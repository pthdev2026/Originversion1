/** Recherche intelligente (fautes de frappe, mots-clés, suggestions, recherches récentes) et alerte de nouvelle connexion. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import pino from 'pino';
import type { Hono } from 'hono';
import { createApp } from './app.ts';
import { DEV_DATABASE_URL } from './config/env.ts';
import { connect, type Sql } from './platform/database/client.ts';
import { migrate } from './platform/database/migrate.ts';
import type { AppEnv } from './platform/http/types.ts';
import { StorageLayout } from './platform/storage/layout.ts';
import { insertUser } from './modules/identity/repository.ts';
import { hashPassword } from './modules/identity/password.ts';
import { createIdentityService } from './modules/identity/service.ts';
import { createAccountService } from './modules/account/service.ts';
import { registerAsset } from './modules/ingest/repository.ts';

const PASSWORD = 'Un très bon mot de passe';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const AVIF = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif'), Buffer.alloc(16)]);
const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
const storageRoot = `/tmp/origin-security-${randomBytes(4).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let app: Hono<AppEnv>;
let available = true;
let adminCookie = '';
const mails: { to: string; subject: string; text: string }[] = [];
const tick = () => new Promise(resolve => setTimeout(resolve, 25));

const call = (method: string, path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) => {
  const raw = body instanceof Uint8Array;
  return app.request(path, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined || raw ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: (raw ? body : JSON.stringify(body)) as BodyInit }),
  });
};
const json = async (response: Response) => (await response.json()) as any;
const cookieOf = (response: Response) => (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
const register = async (email: string) => cookieOf(await call('POST', '/api/auth/register', { email, password: PASSWORD }, undefined, { 'user-agent': CHROME_MAC }));
const login = async (email: string, userAgent: string, password = PASSWORD) => call('POST', '/api/auth/login', { email, password }, undefined, { 'user-agent': userAgent });

before(async () => {
  admin = connect(databaseUrl, { max: 1 });
  try { await admin`SELECT 1`; } catch { available = false; await admin.end(); return; }
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = connect(databaseUrl, { max: 6, connection: { search_path: schema } });
  await migrate(sql);
  const logger = pino({ level: 'silent' });
  const mailer = { async send(message: { to: string; subject: string; text: string }) { mails.push(message); } };
  const storage = new StorageLayout(storageRoot);
  const account = createAccountService({ sql, logger, mailer, storage });
  const identity = createIdentityService({
    sql, logger, mailer, afterAccountDeleted: info => account.afterAccountDeleted(info),
    config: { registrationMode: 'open', sessionTtlSeconds: 3600, publicAppUrl: 'http://localhost:3210' },
  });
  app = createApp({
    sql, logger, storage, account, mailer,
    mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: ['http://localhost:3210'], trustProxy: false,
    rateLimits: { apiPerMinute: 100_000, mediaPerMinute: 100_000, authPerMinute: 100_000, metricsPerMinute: 100_000 },
    identity, cookieSecure: true, sessionTtlSeconds: 3600, playbackRequiresLogin: false, uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
  });
  await insertUser(sql, { id: randomUUID(), email: 'root@origin.test', passwordHash: await hashPassword('Mot de passe administrateur 1'), displayName: null, role: 'admin', emailVerified: true });
  adminCookie = cookieOf(await call('POST', '/api/auth/login', { email: 'root@origin.test', password: 'Mot de passe administrateur 1' }));
});

after(async () => {
  if (!available) return;
  await rm(storageRoot, { recursive: true, force: true });
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});



const search = async (q: string) => json(await call('GET', `/api/search?q=${encodeURIComponent(q)}`));



let viewer = '';
const send = (method: string, path: string, cookie?: string, headers: Record<string, string> = {}, body?: BodyInit) =>
  app.request(path, { method, headers: { ...(cookie ? { cookie } : {}), ...headers }, ...(body === undefined ? {} : { body }) });
const concrete = (path: string) => path.replace(/:[A-Za-z]+\??/g, 'x-id').replace(/\*$/, 'x');
const routes = () => {
  const seen = new Set<string>();
  return (app.routes as { method: string; path: string }[]).filter(r => r.method !== 'ALL' && !r.path.includes('*') && !seen.has(`${r.method} ${r.path}`) && seen.add(`${r.method} ${r.path}`));
};
// Routes publiques VOULUES (tout le reste sous /api/admin, /files, /uploads, /api/me exige une session).
const PUBLIC = [/^\/health$/, /^\/ready$/, /^\/avatars\//, /^\/subtitles\//, /^\/images\//, /^\/media\//, /^\/api\/(home|programs|collections|themes|creators|search|recommendations|coming-soon|contact|trending|ranking|playback-sessions)/, /^\/api\/auth\//, /^\/metrics$/];

describe('revue de sécurité ciblée', () => {
  it('prépare un compte spectateur', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    viewer = cookieOf(await call('POST', '/api/auth/register', { email: 'sec@mail.fr', password: PASSWORD }));
    assert.ok(viewer.length > 10);
  });

  it('MATRICE : toute route /api/admin, /files (sauf avatar) et /uploads refuse l\'anonyme (401) et le spectateur (403)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const adminOnly = routes().filter(r => /^\/api\/admin\//.test(r.path) || (/^\/files\//.test(r.path) && !/^\/files\/me\//.test(r.path)) || /^\/uploads/.test(r.path));
    assert.ok(adminOnly.length >= 30, `routes d'administration trouvées : ${adminOnly.length}`);
    const violations: string[] = [];
    for (const r of adminOnly) {
      const path = concrete(r.path);
      const anon = await send(r.method, path);
      if (anon.status !== 401) violations.push(`ANONYME ${r.method} ${r.path} → ${anon.status}`);
      const asViewer = await send(r.method, path, viewer);
      if (asViewer.status !== 403) violations.push(`SPECTATEUR ${r.method} ${r.path} → ${asViewer.status}`);
    }
    assert.deepEqual(violations, []);
  });

  it('MATRICE : toute route /api/me et /files/me exige une session (401 sans cookie, jamais de donnée)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const personal = routes().filter(r => /^\/api\/me(\/|$)/.test(r.path) || /^\/files\/me\//.test(r.path));
    assert.ok(personal.length >= 25, `routes personnelles trouvées : ${personal.length}`);
    const violations: string[] = [];
    for (const r of personal) {
      const res = await send(r.method, concrete(r.path));
      if (res.status !== 401) violations.push(`${r.method} ${r.path} → ${res.status}`);
    }
    assert.deepEqual(violations, []);
  });

  it('inventaire : aucune route n\'est publique par oubli (liste blanche explicite)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const unclassified = routes().filter(r => !PUBLIC.some(p => p.test(r.path)) && !/^\/api\/admin\//.test(r.path) && !/^\/files\//.test(r.path) && !/^\/uploads/.test(r.path) && !/^\/api\/me(\/|$)/.test(r.path)).map(r => `${r.method} ${r.path}`);
    assert.deepEqual(unclassified, [], 'routes ni publiques voulues ni protégées : à classer');
  });

  it('CSRF : une écriture portant le cookie mais venant d\'une origine étrangère est refusée (403) sur TOUTES les routes d\'écriture', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const writes = routes().filter(r => r.method !== 'GET' && r.method !== 'HEAD' && r.method !== 'OPTIONS' && !/^\/api\/(contact|auth\/(login|register|password|email))/.test(r.path) && !/^\/uploads/.test(r.path));
    assert.ok(writes.length >= 40, `routes d'écriture : ${writes.length}`);
    const violations: string[] = [];
    for (const cookie of [viewer, adminCookie]) {
      for (const r of writes) {
        const res = await send(r.method, concrete(r.path), cookie, { origin: 'https://evil.example', 'content-type': 'application/json' }, '{}');
        if (res.status !== 403) violations.push(`${r.method} ${r.path} → ${res.status}`);
      }
    }
    assert.deepEqual([...new Set(violations)], []);
  });

  it('CSRF : les écritures d\'authentification venant d\'une origine étrangère sont refusées aussi', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    for (const path of ['/api/auth/login', '/api/auth/register', '/api/auth/logout', '/api/auth/password/forgot']) {
      const res = await send('POST', path, undefined, { origin: 'https://evil.example', 'content-type': 'application/json' }, JSON.stringify({ email: 'a@b.fr', password: 'x' }));
      assert.equal(res.status, 403, path);
    }
  });

  it('cookie de production : __Host-, HttpOnly, Secure, SameSite, Path=/, sans Domain', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const res = await call('POST', '/api/auth/login', { email: 'sec@mail.fr', password: PASSWORD });
    const header = res.headers.get('set-cookie') ?? '';
    assert.match(header, /^__Host-origin_session=/);
    for (const flag of [/HttpOnly/i, /Secure/i, /SameSite=(Lax|Strict)/i, /Path=\//i]) assert.match(header, flag);
    assert.doesNotMatch(header, /Domain=/i, 'un cookie __Host- n\'a jamais de Domain');
  });

  it('corps démesurés : refusés proprement (jamais une erreur 500)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const big = JSON.stringify({ email: 'a@b.fr', password: 'x'.repeat(6 * 1024 * 1024) });
    const res = await send('POST', '/api/auth/login', undefined, { 'content-type': 'application/json' }, big);
    assert.ok([400, 413].includes(res.status), `statut ${res.status}`);
    const junk = await send('POST', '/api/auth/login', undefined, { 'content-type': 'application/json' }, '{"email":');
    assert.equal(junk.status, 400);
    const withViewer = await send('PATCH', '/api/me', viewer, { 'content-type': 'application/json' }, JSON.stringify({ displayName: 'x'.repeat(2_000_000) }));
    assert.ok([400, 413].includes(withViewer.status), `statut ${withViewer.status}`);
  });

  it('envois tus : taille annoncée excessive, métadonnées invalides, identifiants piégés', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const b64 = (v: string) => Buffer.from(v).toString('base64');
    const tus = (length: string, meta: string) => send('POST', '/uploads', adminCookie, { 'tus-resumable': '1.0.0', 'upload-length': length, 'upload-metadata': meta });
    assert.ok([413, 400].includes((await tus(String(1024 ** 4), `filename ${b64('a.mp4')},playbackId ${b64('film-ok')},kind ${b64('film')},title ${b64('T')}`)).status), 'plus grand que la limite');
    for (const bad of ['./etc/passwd', 'A B', 'x'.repeat(200), '']) {
      const res = await tus('1000', `filename ${b64('a.mp4')},playbackId ${b64(bad)},kind ${b64('film')},title ${b64('T')}`);
      assert.equal(res.status, 400, `playbackId « ${bad.slice(0, 20)} »`);
    }
    assert.equal((await tus('1000', `filename ${b64('./evil.sh')},playbackId ${b64('film-ok')},kind ${b64('brand-xx')},title ${b64('T')}`)).status, 400, 'type de contenu inconnu');
  });

  it('traversée de chemins : /media, /images, /subtitles, /avatars ne sortent jamais du stockage', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const attempts = ['/media/token/../../../etc/passwd', '/media/%2e%2e/%2e%2e/etc/passwd', '/images/..%2f..%2fpackage.json', '/images/%2e%2e/%2e%2e/package.json', '/images/x/..%2f..%2f..%2fpackage.json',
      '/subtitles/x/..%2f..%2fx.vtt', '/subtitles/..%2f..%2fx/fr.vtt', '/avatars/..%2f..%2fpackage.json', '/avatars/%2e%2e%2f.env'];
    const violations: string[] = [];
    for (const path of attempts) {
      const res = await send('GET', path);
      const text = res.status === 200 ? await res.text() : '';
      if (res.status >= 500 || res.status === 200 || /"name":|root:|PASSPHRASE/.test(text)) violations.push(`${path} → ${res.status}`);
    }
    assert.deepEqual(violations, []);
  });

  it('lecture : un jeton falsifié, expiré ou d\'un autre média est refusé (403)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    for (const path of ['/media/abc.def/film/master.m3u8', '/media/0.xxx/film/master.m3u8', '/media/%00/film/master.m3u8']) {
      const res = await send('GET', path);
      assert.ok([403, 404].includes(res.status), `${path} → ${res.status}`);
    }
  });

  it('erreurs : aucune trace de pile ni de requête SQL dans les réponses', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const probes: [string, string, string?][] = [['GET', '/api/programs/%27%3B%20DROP%20TABLE%20users--'], ['GET', '/api/search?q=%27%20OR%201%3D1--'], ['GET', '/api/me/progress?program=%27'], ['POST', '/api/auth/login']];
    for (const [method, path] of probes) {
      const res = await send(method, path, viewer, { 'content-type': 'application/json' }, method === 'POST' ? '{"email":{"$ne":null},"password":1}' : undefined);
      const text = await res.text();
      assert.ok(res.status < 500, `${method} ${path} → ${res.status}`);
      assert.doesNotMatch(text, /at .*\.ts:\d+|SELECT |INSERT |postgres|node_modules|stack/i, `${method} ${path} révèle des détails internes`);
    }
    assert.equal((await send('GET', '/api/programs/x-id')).status, 404);
  });

  it('énumération : connexion et « mot de passe oublié » ne révèlent pas si une adresse existe', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const known = await call('POST', '/api/auth/login', { email: 'sec@mail.fr', password: 'mauvais-mot-de-passe-1' });
    const unknown = await call('POST', '/api/auth/login', { email: 'personne@mail.fr', password: 'mauvais-mot-de-passe-1' });
    assert.equal(known.status, unknown.status);
    assert.equal((await json(known)).message, (await json(unknown)).message);
    const f1 = await call('POST', '/api/auth/password/forgot', { email: 'sec@mail.fr' });
    const f2 = await call('POST', '/api/auth/password/forgot', { email: 'personne@mail.fr' });
    assert.deepEqual([f1.status, (await json(f1)).message], [f2.status, (await json(f2)).message]);
  });
});
