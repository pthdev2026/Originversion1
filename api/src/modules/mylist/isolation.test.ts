/** Recherche intelligente (fautes de frappe, mots-clés, suggestions, recherches récentes) et alerte de nouvelle connexion. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import pino from 'pino';
import type { Hono } from 'hono';
import { createApp } from '../../app.ts';
import { DEV_DATABASE_URL } from '../../config/env.ts';
import { connect, type Sql } from '../../platform/database/client.ts';
import { migrate } from '../../platform/database/migrate.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { StorageLayout } from '../../platform/storage/layout.ts';
import { insertUser } from '../identity/repository.ts';
import { hashPassword } from '../identity/password.ts';
import { createIdentityService } from '../identity/service.ts';
import { createAccountService } from '../account/service.ts';
import { registerAsset } from '../ingest/repository.ts';

const PASSWORD = 'Un très bon mot de passe';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const AVIF = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif'), Buffer.alloc(16)]);
const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
const storageRoot = `/tmp/origin-isolation-${randomBytes(4).toString('hex')}`;
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
    mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
    rateLimits: { apiPerMinute: 100_000, mediaPerMinute: 100_000, authPerMinute: 100_000, metricsPerMinute: 100_000 },
    identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: false, uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
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


const as = (cookie: string, extra: Record<string, string> = {}) => ({ cookie, ...extra });
const send = (method: string, path: string, cookie?: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(path, { method, headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const slugsOf = async (cookie: string) => ((await json(await send('GET', '/api/me/list', cookie))).items as { slug: string }[]).map(item => item.slug).sort();
const count = async (email: string) => Number((await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM my_list ml JOIN users u ON u.id = ml.user_id WHERE u.email = ${email}`)[0]?.n);
let pilote = '';
let second = '';

describe('compte pilote et deuxième compte', () => {
  it('prépare le catalogue et deux comptes', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    for (const slug of ['film-a', 'film-b', 'film-c', 'film-d', 'film-e', 'film-f']) {
      assert.equal((await call('PUT', `/api/admin/programs/${slug}`, { kind: 'film', title: slug, published: true }, adminCookie)).status, 201);
    }
    await registerAsset(sql, { playbackId: 'film-a', programSlug: 'film-a', kind: 'film', title: 'film-a', storagePath: 'film-a', durationSeconds: 600, sourceWidth: 1280, sourceHeight: 720, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: false });
    assert.equal((await call('PUT', '/api/admin/programs/film-brouillon', { kind: 'film', title: 'brouillon' }, adminCookie)).status, 201);
    pilote = cookieOf(await call('POST', '/api/auth/register', { email: 'pilote@mail.fr', password: PASSWORD }));
    second = cookieOf(await call('POST', '/api/auth/register', { email: 'second@mail.fr', password: PASSWORD }));
    assert.ok(pilote && second && pilote !== second);
  });

  it('Ma liste — ajout, double clic, rafales simultanées : une seule ligne, aucune erreur', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const burst = await Promise.all(Array.from({ length: 40 }, () => send('PUT', '/api/me/list/film-a', pilote)));
    assert.deepEqual([...new Set(burst.map(r => r.status))], [204]);
    assert.equal(await count('pilote@mail.fr'), 1);
    const mixed = await Promise.all(Array.from({ length: 30 }, (_, i) => send(i % 2 ? 'DELETE' : 'PUT', '/api/me/list/film-b', pilote)));
    assert.ok(mixed.every(r => r.status === 204), 'ajouts et retraits entrelacés : jamais d’erreur');
    assert.ok((await count('pilote@mail.fr')) <= 2, 'au plus film-a + film-b, jamais de doublon');
    await send('PUT', '/api/me/list/film-b', pilote);
    assert.deepEqual(await slugsOf(pilote), ['film-a', 'film-b']);
  });

  it('Ma liste — contenu inconnu ou brouillon refusé (aucune ligne fantôme) ; retrait idempotent', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await send('PUT', '/api/me/list/inexistant', pilote)).status, 404);
    assert.equal((await send('PUT', '/api/me/list/film-brouillon', pilote)).status, 404);
    assert.equal((await send('DELETE', '/api/me/list/film-jamais-ajoute', pilote)).status, 204);
    assert.equal(await count('pilote@mail.fr'), 2);
  });

  it('isolation — le deuxième compte ne voit ni ne modifie rien du pilote', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.deepEqual(await slugsOf(second), []);
    // retirer « le même slug » chez le deuxième compte ne touche pas la liste du pilote
    assert.equal((await send('DELETE', '/api/me/list/film-a', second)).status, 204);
    assert.deepEqual(await slugsOf(pilote), ['film-a', 'film-b']);
    // l'identité vient UNIQUEMENT de la session : un identifiant glissé dans l'URL, l'en-tête ou le corps est ignoré
    const pilotId = (await sql<{ id: string }[]>`SELECT id FROM users WHERE email = 'pilote@mail.fr'`)[0]?.id ?? '';
    await send('PUT', `/api/me/list/film-c?userId=${pilotId}`, second, { userId: pilotId }, { 'x-user-id': pilotId });
    assert.deepEqual(await slugsOf(second), ['film-c']);
    assert.deepEqual(await slugsOf(pilote), ['film-a', 'film-b']);
    assert.equal((await send('GET', '/api/me/list')).status, 401, 'sans session : 401');
    assert.equal((await send('GET', '/api/me/list', 'origin_session=falsifie')).status, 401, 'session inventée : 401');
  });

  it('progression et historique — personnels, jamais mélangés, un envoi tardif n’écrase pas un envoi récent', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const put = (cookie: string, position: number, sentAt: number) => send('PUT', '/api/me/progress/film-a', cookie, { positionSeconds: position, durationSeconds: 600, sentAt });
    assert.equal((await put(pilote, 300, 2000)).status, 200);
    assert.equal((await put(pilote, 100, 1000)).status, 200, 'envoi arrivé en retard : accepté sans écraser');
    assert.equal((await json(await send('GET', '/api/me/progress/film-a', pilote))).positionSeconds, 300);
    assert.equal((await send('GET', '/api/me/progress/film-a', second)).status, 404, 'le deuxième compte n’a aucune progression');
    assert.deepEqual((await json(await send('GET', '/api/me/continue-watching', second))).items, []);
    assert.equal((await put(second, 550, 3000)).status, 200);
    assert.equal((await json(await send('GET', '/api/me/progress/film-a', pilote))).positionSeconds, 300, 'celle du pilote est intacte');
    assert.equal((await json(await send('GET', '/api/programs/film-a/play-target', second))).state, 'resume');
    assert.equal((await json(await send('GET', '/api/programs/film-a/play-target', pilote))).resumeSeconds, 300);
    // « terminé » est propre à chaque compte
    await put(second, 599, 4000);
    assert.equal((await json(await send('GET', '/api/me/progress/film-a', second))).completed, true);
    assert.equal((await json(await send('GET', '/api/me/progress/film-a', pilote))).completed, false);
  });

  it('persistance — déconnexion, ancienne session invalide, reconnexion : tout est restauré', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await send('POST', '/api/auth/logout', pilote)).status, 204);
    assert.equal((await send('GET', '/api/me/list', pilote)).status, 401, 'l’ancienne session ne marche plus');
    assert.equal((await send('PUT', '/api/me/list/film-d', pilote)).status, 401, 'et ne peut rien écrire');
    const again = cookieOf(await call('POST', '/api/auth/login', { email: 'pilote@mail.fr', password: PASSWORD }));
    assert.deepEqual(await slugsOf(again), ['film-a', 'film-b']);
    assert.equal((await json(await send('GET', '/api/me/progress/film-a', again))).positionSeconds, 300);
    assert.equal((await json(await send('GET', '/api/me/continue-watching', again))).items[0].playbackId, 'film-a');
    pilote = again;
  });

  it('changement de compte sur le même navigateur : chacun retrouve SON état', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await send('POST', '/api/auth/logout', second);
    const secondAgain = cookieOf(await call('POST', '/api/auth/login', { email: 'second@mail.fr', password: PASSWORD }));
    assert.deepEqual(await slugsOf(secondAgain), ['film-c']);
    assert.deepEqual(await slugsOf(pilote), ['film-a', 'film-b']);
    second = secondAgain;
  });

  it('session expirée pendant la lecture : 401, rien n’est perdu, reprise après reconnexion', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const cookie = cookieOf(await call('POST', '/api/auth/register', { email: 'expire@mail.fr', password: PASSWORD }));
    assert.equal((await send('PUT', '/api/me/progress/film-a', cookie, { positionSeconds: 200, durationSeconds: 600, sentAt: 10 })).status, 200);
    await sql`UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = (SELECT id FROM users WHERE email = 'expire@mail.fr')`;
    assert.equal((await send('PUT', '/api/me/progress/film-a', cookie, { positionSeconds: 300, durationSeconds: 600, sentAt: 20 })).status, 401, 'envoi après expiration : refusé proprement');
    assert.equal((await send('GET', '/api/me/list', cookie)).status, 401);
    const again = cookieOf(await call('POST', '/api/auth/login', { email: 'expire@mail.fr', password: PASSWORD }));
    assert.equal((await json(await send('GET', '/api/programs/film-a/playback', again))).resume.positionSeconds, 200, 'la dernière position reçue avant l’expiration est conservée');
    assert.equal((await send('PUT', '/api/me/progress/film-a', again, { positionSeconds: 300, durationSeconds: 600, sentAt: 20 })).status, 200, 'le front peut rejouer l’envoi refusé');
    await send('POST', '/api/me/delete', again, { password: PASSWORD });
  });

  it('pré-requête CORS (PUT avec cookies) : autorisée pour le front, refusée pour une origine inconnue', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const preflight = (origin: string) => app.request('/api/me/progress/film-a', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type' } });
    const allowed = await preflight('http://localhost:3210');
    assert.ok([200, 204].includes(allowed.status));
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3210');
    assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
    assert.match(allowed.headers.get('access-control-allow-methods') ?? '', /PUT/);
    assert.match((allowed.headers.get('access-control-allow-headers') ?? '').toLowerCase(), /content-type/);
    assert.equal((await preflight('https://evil.example')).headers.get('access-control-allow-origin'), null);
  });

  it('plafond de 500 contenus : respecté même sous ajouts simultanés', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await sql`INSERT INTO my_list (user_id, slug) SELECT u.id, 'rempli-' || g FROM users u, generate_series(1, 497) g WHERE u.email = 'second@mail.fr'`;
    assert.equal(await count('second@mail.fr'), 498);
    const statuses = (await Promise.all(['film-a', 'film-b', 'film-d', 'film-e', 'film-f'].map(slug => send('PUT', `/api/me/list/${slug}`, second)))).map(r => r.status);
    assert.equal(await count('second@mail.fr'), 500, 'exactement le plafond');
    assert.equal(statuses.filter(status => status === 204).length, 2, 'deux ajouts passent');
    assert.equal(statuses.filter(status => status === 400).length, 3, 'les autres sont refusés');
  });

  it('suppression de compte : ses données disparaissent, celles de l’autre restent', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await send('POST', '/api/me/delete', second, { password: PASSWORD })).status, 204);
    assert.equal(await count('second@mail.fr'), 0);
    assert.deepEqual(await slugsOf(pilote), ['film-a', 'film-b']);
  });
});
