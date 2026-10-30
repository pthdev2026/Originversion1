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
const storageRoot = `/tmp/origin-schedule-${randomBytes(4).toString('hex')}`;
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

const withMedia = (slug: string) => registerAsset(sql, { playbackId: slug, programSlug: slug, kind: 'film', title: slug, storagePath: slug, durationSeconds: 60, sourceWidth: 1280, sourceHeight: 720, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: false });
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const DAY = 86_400_000;
const film = (title: string, extra: Record<string, unknown> = {}) => ({ kind: 'film', title, tagline: `${title} : accroche`, posterUrl: '/images/x.png', ...extra });
const put = (slug: string, doc: unknown) => call('PUT', `/api/admin/programs/${slug}`, doc, adminCookie);
const visible = async (slug: string) => (await call('GET', `/api/programs/${slug}`)).status === 200;
const comingSoon = async () => (await json(await call('GET', '/api/coming-soon'))).programs.map((p: any) => p.slug);

describe('programmation des sorties', () => {
  it('valide les dates', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await put('a', film('A', { published: true, publishAt: iso(DAY) }))).status, 400, 'déjà public + date de sortie');
    assert.equal((await put('a', film('A', { announced: true }))).status, 400, 'annonce sans date');
    assert.equal((await put('a', film('A', { publishAt: iso(2 * DAY), unpublishAt: iso(DAY) }))).status, 400, 'retrait avant la sortie');
    assert.equal((await put('a', film('A', { publishAt: 'demain' }))).status, 400, 'date illisible');
  });

  it('un brouillon programmé reste invisible, annoncé ou non', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await put('secret', film('Secret', { publishAt: iso(DAY) }))).status, 201);
    assert.equal((await put('teaser', film('Teaser', { publishAt: iso(2 * DAY), announced: true }))).status, 201);
    await withMedia('secret'); await withMedia('teaser'); // médias prêts : la porte de publication laissera sortir ces deux programmes
    assert.equal(await visible('secret'), false);
    assert.equal(await visible('teaser'), false, 'annoncé ≠ publié : la fiche complète reste fermée');
    assert.deepEqual(await comingSoon(), ['teaser'], 'seul l’annoncé apparaît dans « Prochainement »');
    const card = (await json(await call('GET', '/api/coming-soon'))).programs[0];
    assert.deepEqual(Object.keys(card).sort(), ['image', 'imageAlt', 'kind', 'releaseAt', 'slug', 'tagline', 'title']);
    assert.equal((await search('teaser')).programs.length, 0, 'absent de la recherche');
  });

  it('rien ne bouge avant l’échéance', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.deepEqual(await runSchedule(sql), { released: [], expired: [], blocked: [] });
    assert.equal(await visible('teaser'), false);
  });

  it('à l’échéance : sortie automatique, retrait de « Prochainement », trace dans le journal', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const done = await runSchedule(sql, new Date(Date.now() + 3 * DAY));
    assert.deepEqual(done.released.sort(), ['secret', 'teaser']);
    assert.equal(await visible('teaser'), true);
    assert.equal(await visible('secret'), true);
    assert.deepEqual(await comingSoon(), []);
    assert.equal((await search('teaser')).programs.length, 1, 'cherchable dès la sortie');
    assert.deepEqual(await runSchedule(sql, new Date(Date.now() + 3 * DAY)), { released: [], expired: [], blocked: [] }, 'idempotent');
    const view = await json(await call('GET', '/api/admin/programs/teaser', undefined, adminCookie));
    assert.deepEqual([view.document.published, view.document.publishAt, view.document.announced], [true, null, false]);
    const events = (await json(await call('GET', '/api/admin/audit', undefined, adminCookie))).entries.map((e: any) => e.event);
    assert.ok(events.includes('catalog.program.release'));
  });

  it('retrait planifié : le programme public repasse en brouillon à la date prévue', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await put('temporaire', film('Temporaire', { published: true, unpublishAt: iso(5 * DAY) }))).status, 201);
    assert.equal(await visible('temporaire'), true);
    assert.deepEqual((await runSchedule(sql, new Date(Date.now() + DAY))).expired, []);
    assert.deepEqual((await runSchedule(sql, new Date(Date.now() + 6 * DAY))).expired, ['temporaire']);
    assert.equal(await visible('temporaire'), false);
    const view = await json(await call('GET', '/api/admin/programs/temporaire', undefined, adminCookie));
    assert.deepEqual([view.document.published, view.document.unpublishAt], [false, null]);
  });

  it('calendrier éditorial : réservé à l’administrateur, chronologique', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await call('GET', '/api/admin/schedule')).status, 401);
    const viewer = cookieOf(await call('POST', '/api/auth/register', { email: 'yan@mail.fr', password: PASSWORD }));
    assert.equal((await call('GET', '/api/admin/schedule', undefined, viewer)).status, 403);
    await put('plus-tard', film('Plus tard', { publishAt: iso(20 * DAY), unpublishAt: iso(40 * DAY) }));
    await put('bientot', film('Bientôt', { publishAt: iso(10 * DAY), announced: true }));
    const entries = (await json(await call('GET', '/api/admin/schedule', undefined, adminCookie))).entries;
    assert.deepEqual(entries.map((e: any) => `${e.slug}:${e.event}`), ['bientot:release', 'plus-tard:release', 'plus-tard:expiry']);
    assert.equal(entries[0].announced, true);
  });
});
