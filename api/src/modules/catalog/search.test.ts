/** Recherche intelligente (fautes de frappe, mots-clés, suggestions, recherches récentes) et alerte de nouvelle connexion. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import pino from 'pino';
import type { Hono } from 'hono';
import { correctTokens } from './search.ts';
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

const PASSWORD = 'Un très bon mot de passe';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const AVIF = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif'), Buffer.alloc(16)]);
const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
const storageRoot = `/tmp/origin-search-${randomBytes(4).toString('hex')}`;
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


const program = (title: string, extra: Record<string, unknown> = {}) => ({ kind: 'serie', title, published: true, ...extra });
const put = (slug: string, doc: unknown) => call('PUT', `/api/admin/programs/${slug}`, doc, adminCookie);
const search = async (q: string) => json(await call('GET', `/api/search?q=${encodeURIComponent(q)}`));

describe('correction des mots (pure)', () => {
  const vocabulary = new Map([['passagers', 5], ['silence', 4], ['mystere', 2], ['foi', 3]]);
  const fix = (word: string) => correctTokens([word], vocabulary).tokens[0];
  it('corrige une faute dans un mot incomplet, sans inventer', () => {
    assert.equal(fix('passagr'), 'passagers', 'faute + mot coupé');
    assert.equal(fix('mystr'), 'mystere', 'faute dans un début de mot');
    assert.equal(fix('myster'), 'myster', 'préfixe exact : déjà trouvable, laissé tel quel');
    assert.equal(fix('pasagers'), 'passagers');
    assert.equal(fix('silance'), 'silence');
    assert.equal(fix('zzzzzz'), 'zzzzzz', 'rien de proche : inchangé');
    assert.equal(fix('fox'), 'fox', 'sous 4 lettres : aucune correction');
  });
});

describe('recherche intelligente', () => {
  it('prépare le catalogue', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await call('PUT', '/api/admin/themes/mystere', { title: 'Mystère' }, adminCookie)).status, 204);
    assert.equal((await put('la-cite-perdue', program('La Cité perdue', { keywords: ['archéologie', 'aventure'] }))).status, 201);
    assert.equal((await put('nuits-blanches', program('Nuits blanches', { tagline: 'Un thriller psychologique' }))).status, 201);
    assert.equal((await put('foi-et-raison', program('Foi et raison'))).status, 201);
  });

  it('retrouve un programme par ses mots-clés cachés', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const result = await search('archeologie');
    assert.deepEqual(result.programs.map((p: any) => p.title), ['La Cité perdue']);
    assert.equal(result.correctedQuery, null);
  });

  it('corrige une faute de frappe et le dit', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const typo = await search('thriler');
    assert.equal(typo.correctedQuery, 'thriller');
    assert.deepEqual(typo.programs.map((p: any) => p.title), ['Nuits blanches']);
    const swap = await search('aevnture'); // lettres échangées
    assert.equal(swap.programs[0]?.title, 'La Cité perdue');
    assert.equal((await search('xqzwv')).programs.length, 0, 'rien de proche : pas de correction inventée');
    assert.equal((await search('raison')).correctedQuery, null, 'une recherche réussie n’est jamais « corrigée »');
  });

  it('suggère pendant la frappe (titres, thématiques)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const s = async (q: string) => (await json(await call('GET', `/api/search/suggestions?q=${encodeURIComponent(q)}`))).suggestions.map((x: any) => `${x.type}:${x.label}`);
    assert.deepEqual(await s('nu'), ['program:Nuits blanches']);
    assert.deepEqual(await s('MYS'), ['theme:Mystère']);
    assert.deepEqual(await s('foi r'), ['program:Foi et raison']);
    assert.deepEqual(await s('zzz'), []);
    assert.equal((await call('GET', '/api/search/suggestions?q=')).status, 400);
  });
});

describe('recherches récentes', () => {
  it('mémorise, dédoublonne, oublie, respecte « historique désactivé »', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await call('GET', '/api/me/searches')).status, 401);
    const cookie = await register('sara@mail.fr');
    for (const q of ['nuits', 'Foi', 'nuits']) assert.equal((await call('POST', '/api/me/searches', { q }, cookie)).status, 204);
    assert.deepEqual((await json(await call('GET', '/api/me/searches', undefined, cookie))).searches, ['nuits', 'Foi']);
    assert.equal((await call('POST', '/api/me/searches', { q: 'a' }, cookie)).status, 400);
    await call('DELETE', '/api/me/searches/item', { q: 'foi' }, cookie);
    assert.deepEqual((await json(await call('GET', '/api/me/searches', undefined, cookie))).searches, ['nuits']);
    await call('PUT', '/api/me/preferences', { history: false }, cookie);
    await call('POST', '/api/me/searches', { q: 'secret' }, cookie);
    assert.deepEqual((await json(await call('GET', '/api/me/searches', undefined, cookie))).searches, []);
    await call('PUT', '/api/me/preferences', { history: true }, cookie);
    assert.deepEqual((await json(await call('GET', '/api/me/searches', undefined, cookie))).searches, ['nuits'], 'rien de nouveau n’a été gardé pendant la pause');
    assert.equal((await call('DELETE', '/api/me/searches', undefined, cookie)).status, 204);
    assert.deepEqual((await json(await call('GET', '/api/me/searches', undefined, cookie))).searches, []);
  });

  it('ne garde que les 20 dernières', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const cookie = await register('tom@mail.fr');
    for (let i = 0; i < 23; i += 1) await call('POST', '/api/me/searches', { q: `requete ${i}` }, cookie);
    const [row] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM search_history sh JOIN users u ON u.id = sh.user_id WHERE u.email = 'tom@mail.fr'`;
    assert.equal(row?.n, '20');
  });
});

describe('alerte de nouvelle connexion', () => {
  it('prévient seulement pour un appareil inconnu d’un compte qui en avait déjà', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await register('uma@mail.fr'); // 1er appareil (inscription) : pas d’alerte
    const alerts = () => mails.filter(m => m.to === 'uma@mail.fr' && /Nouvelle connexion/.test(m.subject)).length;
    assert.equal((await login('uma@mail.fr', CHROME_MAC)).status, 200);
    await tick();
    assert.equal(alerts(), 0, 'même appareil');
    assert.equal((await login('uma@mail.fr', SAFARI_IPHONE)).status, 200);
    await tick();
    assert.equal(alerts(), 1);
    assert.match(mails.at(-1)?.text ?? '', /iPhone|Safari/);
    assert.equal((await login('uma@mail.fr', SAFARI_IPHONE)).status, 200);
    await tick();
    assert.equal(alerts(), 1, 'appareil désormais connu');
  });
});
