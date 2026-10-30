/** Protection des statistiques de lecture : sans jeton émis par la lecture, aucune « vue » ne peut être fabriquée. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
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
import { registerAsset } from '../ingest/repository.ts';
import { loadTrending } from '../recommendation/repository.ts';
import { SESSION_TOKEN_TTL_SECONDS, signSessionGrant, verifySessionGrant } from './session-token.ts';

const SECRET = 'secret-test-secret-test-secret-test!!';
const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let app: Hono<AppEnv>;
let available = true;

const post = (body: unknown, contentType = 'application/json') =>
  app.request('/api/playback-sessions', { method: 'POST', headers: { 'content-type': contentType }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const body = (id: string, playbackId: string, extra: Record<string, unknown> = {}) => ({
  id, playbackId, startupMs: 700, rebufferCount: 0, rebufferMs: 0, watchSeconds: 60, levelSeconds: { '720': 60 }, maxHeight: 720,
  device: 'desktop', browser: 'Chrome', engine: 'hlsjs', connection: '4g', ...extra,
});
const rows = async (id: string) => sql<{ watch_seconds: string }[]>`SELECT watch_seconds FROM playback_sessions WHERE id = ${id}`;

before(async () => {
  admin = connect(databaseUrl, { max: 1 });
  try { await admin`SELECT 1`; } catch { available = false; await admin.end(); return; }
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = connect(databaseUrl, { max: 4, connection: { search_path: schema } });
  await migrate(sql);
  const logger = pino({ level: 'silent' });
  const identity = createIdentityService({ sql, logger, mailer: { async send() {} }, config: { registrationMode: 'open', sessionTtlSeconds: 3600, publicAppUrl: 'http://localhost:3210' } });
  app = createApp({
    sql, logger, storage: new StorageLayout('/tmp/origin-test-unused'),
    mediaSecrets: [SECRET], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
    rateLimits: { apiPerMinute: 10_000, mediaPerMinute: 10_000, authPerMinute: 10_000, metricsPerMinute: 10_000 },
    identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: false, uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
  });
  await insertUser(sql, { id: randomUUID(), email: 'root@origin.test', passwordHash: await hashPassword('Mot de passe administrateur 1'), displayName: null, role: 'admin' });
  const login = await app.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'root@origin.test', password: 'Mot de passe administrateur 1' }) });
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  for (const slug of ['cible', 'autre']) {
    await app.request(`/api/admin/programs/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ kind: 'film', title: slug, published: true }) });
    await registerAsset(sql, {
      playbackId: slug, programSlug: slug, kind: 'film', title: slug, storagePath: slug, durationSeconds: 5000,
      sourceWidth: 1280, sourceHeight: 720, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: true,
    });
  }
});

after(async () => {
  if (!available) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

describe('jeton de session de lecture (unité)', () => {
  const id = randomUUID();
  const now = Date.now();
  it('accepte un jeton valide et mesure le temps écoulé', () => {
    const { token } = signSessionGrant(SECRET, id, 'cible', now - 90_000);
    assert.deepEqual(verifySessionGrant([SECRET], id, 'cible', token, now), { ok: true, elapsedSeconds: 90 });
  });
  it('refuse : autre session, autre média, autre secret, jeton tronqué, expiré, daté du futur', () => {
    const { token } = signSessionGrant(SECRET, id, 'cible', now - 1000);
    assert.equal(verifySessionGrant([SECRET], randomUUID(), 'cible', token, now).ok, false);
    assert.equal(verifySessionGrant([SECRET], id, 'autre', token, now).ok, false);
    assert.equal(verifySessionGrant(['un-autre-secret'], id, 'cible', token, now).ok, false);
    assert.equal(verifySessionGrant([SECRET], id, 'cible', token.slice(0, -3), now).ok, false);
    assert.equal(verifySessionGrant([SECRET], id, 'cible', undefined, now).ok, false);
    assert.equal(verifySessionGrant([SECRET], id, 'cible', 'a.b.c', now).ok, false);
    const old = signSessionGrant(SECRET, id, 'cible', now - (SESSION_TOKEN_TTL_SECONDS + 5) * 1000);
    assert.deepEqual(verifySessionGrant([SECRET], id, 'cible', old.token, now), { ok: false, reason: 'expired' });
    const future = signSessionGrant(SECRET, id, 'cible', now + 3_600_000);
    assert.deepEqual(verifySessionGrant([SECRET], id, 'cible', future.token, now), { ok: false, reason: 'future' });
  });
  it('accepte l’ancien secret pendant une rotation', () => {
    const { token } = signSessionGrant('ancien-secret-ancien-secret-xxxxx!', id, 'cible', now - 1000);
    assert.equal(verifySessionGrant([SECRET, 'ancien-secret-ancien-secret-xxxxx!'], id, 'cible', token, now).ok, true);
  });
});

describe('POST /api/playback-sessions : autorisation', () => {
  it('REFUSE (403) un rapport sans jeton, avec un faux jeton, ou pour un autre média', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const id = randomUUID();
    assert.equal((await post(body(id, 'cible'))).status, 403);
    assert.equal((await post(body(id, 'cible', { token: '1.AAAA' }))).status, 403);
    const real = signSessionGrant(SECRET, id, 'cible', Date.now() - 3_600_000).token;
    assert.equal((await post(body(id, 'autre', { token: real }))).status, 403, 'jeton d’un autre média');
    assert.equal((await post(body(randomUUID(), 'cible', { token: real }))).status, 403, 'jeton d’une autre session');
    assert.equal((await rows(id)).length, 0, 'rien n’est enregistré');
  });

  it('ATTAQUE : 500 sessions fabriquées pour gonfler le Top 10 → aucune vue comptée', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    for (let i = 0; i < 500; i++) await post(body(randomUUID(), 'cible', { watchSeconds: 7200 }));
    assert.deepEqual((await loadTrending(sql, 10)).filter(item => item.slug === 'cible'), []);
  });

  it('PARCOURS RÉEL : la lecture délivre un jeton, le rapport (text/plain, sans compte) est accepté, les renvois sont idempotents', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const playback = (await (await app.request('/api/programs/cible/playback')).json()) as { analytics: { sessionId: string; token: string } };
    const { sessionId, token } = playback.analytics;
    assert.match(sessionId, /^[0-9a-f-]{36}$/);
    const first = await post(JSON.stringify(body(sessionId, 'cible', { token, watchSeconds: 5 })), 'text/plain');
    assert.equal(first.status, 204);
    for (let i = 0; i < 5; i++) assert.equal((await post(body(sessionId, 'cible', { token, watchSeconds: 5 }))).status, 204);
    assert.equal((await rows(sessionId)).length, 1, 'un jeton = une seule ligne, quel que soit le nombre d’envois');
  });

  it('DONNÉES INCOHÉRENTES : le temps regardé est plafonné au temps réellement écoulé depuis la lecture', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const playback = (await (await app.request('/api/programs/cible/playback')).json()) as { analytics: { sessionId: string; token: string } };
    const { sessionId, token } = playback.analytics;
    assert.equal((await post(body(sessionId, 'cible', { token, watchSeconds: 7200, levelSeconds: { '720': 7200 } }))).status, 204);
    const [row] = await rows(sessionId);
    assert.ok(Number(row?.watch_seconds) <= 2, `2 h annoncées 0 s après l’émission → ${row?.watch_seconds} s retenues`);
    assert.equal((await loadTrending(sql, 10)).filter(item => item.slug === 'cible').length, 0, 'moins de 10 s réelles : pas une vue');
  });

  it('une vraie lecture de plus de 10 s compte pour la popularité', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const id = randomUUID();
    const token = signSessionGrant(SECRET, id, 'autre', Date.now() - 600_000).token;
    assert.equal((await post(body(id, 'autre', { token, watchSeconds: 300 }))).status, 204);
    assert.deepEqual((await loadTrending(sql, 10)).map(item => item.slug), ['autre']);
  });
});
