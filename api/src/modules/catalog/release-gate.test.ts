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
import { runSchedule } from '../catalog/routes.ts';
import { registerAsset } from '../ingest/repository.ts';

const PASSWORD = 'Un très bon mot de passe';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const AVIF = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif'), Buffer.alloc(16)]);
const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
const storageRoot = `/tmp/origin-gate-${randomBytes(4).toString('hex')}`;
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


const DAY = 86_400_000;
const past = () => new Date(Date.now() - 60_000).toISOString();
const asset = (playbackId: string, programSlug: string, kind: 'film' | 'serie') =>
  registerAsset(sql, { playbackId, programSlug, kind, title: programSlug, storagePath: playbackId, durationSeconds: 60, sourceWidth: 1280, sourceHeight: 720, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: false });
const put = (slug: string, doc: Record<string, unknown>) => call('PUT', `/api/admin/programs/${slug}`, doc, adminCookie);
const film = (extra: Record<string, unknown> = {}) => ({ kind: 'film', title: 'Un film', publishAt: past(), ...extra });
const visible = async (slug: string) => (await call('GET', `/api/programs/${slug}`)).status === 200;
const events = async () => (await json(await call('GET', '/api/admin/audit?limit=200', undefined, adminCookie))).entries.map((e: any) => `${e.event}:${e.details.slug}`);
const alerts: { slug: string; missing: string[] }[] = [];
const run = (now?: Date) => runSchedule(sql, now, async item => { alerts.push({ slug: item.slug, missing: item.missing }); });

describe('porte de publication', () => {
  it('médias prêts à l\'échéance : publication normale', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await put('pret', film())).status, 201);
    await asset('pret', 'pret', 'film');
    const done = await run();
    assert.deepEqual([done.released, done.blocked.length], [['pret'], 0]);
    assert.equal(await visible('pret'), true);
  });

  it('média absent à l\'échéance : publication BLOQUÉE, tracée, alertée une seule fois, jamais publiée toute seule', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await put('retard', film({ title: 'En retard' }))).status, 201);
    const first = await run();
    assert.deepEqual(first.released, []);
    assert.deepEqual(first.blocked.map(b => [b.slug, b.missing]), [['retard', ['retard']]]);
    assert.equal(await visible('retard'), false, 'toujours invisible');
    assert.deepEqual(alerts.filter(a => a.slug === 'retard'), [{ slug: 'retard', missing: ['retard'] }]);
    const again = await run();
    assert.equal(again.blocked.length, 0, 'pas de nouvelle alerte à chaque passage');
    assert.equal(alerts.filter(a => a.slug === 'retard').length, 1);
    assert.equal((await events()).filter((e: string) => e === 'catalog.program.release_blocked:retard').length, 1, 'une seule trace');
    const entry = (await json(await call('GET', '/api/admin/schedule', undefined, adminCookie))).entries.find((e: any) => e.slug === 'retard');
    assert.deepEqual(entry.blocked.missing, ['retard']);
    // les médias deviennent prêts APRÈS l'échéance : pas de publication tardive non contrôlée
    await asset('retard', 'retard', 'film');
    assert.deepEqual((await run(new Date(Date.now() + DAY))).released, []);
    assert.equal(await visible('retard'), false);
  });

  it('validation éditoriale : 409 tant que les médias manquent, 204 puis publication quand ils sont prêts ; réservée à l\'administrateur', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await put('valide', film({ title: 'À valider' }))).status, 201);
    await run();
    assert.equal(await visible('valide'), false);
    const viewer = cookieOf(await call('POST', '/api/auth/register', { email: 'vero@mail.fr', password: PASSWORD }));
    assert.equal((await call('POST', '/api/admin/programs/valide/release', undefined, viewer)).status, 403);
    assert.equal((await call('POST', '/api/admin/programs/inconnu/release', undefined, adminCookie)).status, 404);
    const refused = await call('POST', '/api/admin/programs/valide/release', undefined, adminCookie);
    assert.equal(refused.status, 409);
    assert.match((await json(refused)).message, /valide/);
    await asset('valide', 'valide', 'film');
    assert.equal((await call('POST', '/api/admin/programs/valide/release', undefined, adminCookie)).status, 204);
    assert.equal(await visible('valide'), true);
    assert.ok((await events()).includes('catalog.program.release_validated:valide'));
    const entry = (await json(await call('GET', '/api/admin/schedule', undefined, adminCookie))).entries.find((e: any) => e.slug === 'valide');
    assert.equal(entry, undefined, 'plus de sortie planifiée');
  });

  it('série : tous les épisodes déclarés doivent être prêts', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const serie = { kind: 'serie', title: 'Série', publishAt: past(), seasons: [{ number: 1, episodes: [{ key: 's1-e1', number: 1, title: 'Un' }, { key: 's1-e2', number: 2, title: 'Deux' }] }] };
    assert.equal((await put('serie-gate', serie)).status, 201);
    await asset('serie-gate-s1-e1', 'serie-gate', 'serie');
    const done = await run();
    assert.deepEqual(done.blocked.map(b => [b.slug, b.missing]), [['serie-gate', ['serie-gate-s1-e2']]], 'un épisode sur deux : bloquée, avec ce qui manque');
    assert.equal(await visible('serie-gate'), false);
  });

  it('nouvelle date de sortie = nouvelle décision : le blocage est levé et la sortie réévaluée', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await put('replanifie', film({ title: 'Replanifié' }))).status, 201);
    await run();
    await asset('replanifie', 'replanifie', 'film');
    assert.equal((await put('replanifie', film({ title: 'Replanifié', publishAt: new Date(Date.now() - 30_000).toISOString() }))).status, 200, 'même programme, autre date');
    const done = await run();
    assert.deepEqual(done.released, ['replanifie']);
    assert.equal(await visible('replanifie'), true);
  });

  it('retrait planifié et publication manuelle : inchangés (la porte ne concerne que la sortie automatique)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await put('manuel', { kind: 'film', title: 'Manuel', published: true })).status, 201, 'publication explicite par l\'éditeur : autorisée sans média');
    assert.equal(await visible('manuel'), true);
    assert.equal((await put('temp', { kind: 'film', title: 'Temp', published: true, unpublishAt: new Date(Date.now() + DAY).toISOString() })).status, 201);
    assert.deepEqual((await run(new Date(Date.now() + 2 * DAY))).expired, ['temp']);
  });
});
