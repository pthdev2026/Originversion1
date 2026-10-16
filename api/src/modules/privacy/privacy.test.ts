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
import { createIdentityService } from '../identity/service.ts';
import { purgeExpired } from '../ops/maintenance.repository.ts';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let app: Hono<AppEnv>;
let available = true;

const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

before(async () => {
  admin = connect(databaseUrl, { max: 1 });
  try { await admin`SELECT 1`; } catch { available = false; await admin.end(); return; }
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = connect(databaseUrl, { max: 4, connection: { search_path: schema } });
  await migrate(sql);
  const logger = pino({ level: 'silent' });
  const identity = createIdentityService({
    sql, logger, mailer: { async send() {} },
    config: { registrationMode: 'open', sessionTtlSeconds: 3600, publicAppUrl: 'http://localhost:3210' },
  });
  app = createApp({
    sql, logger, storage: new StorageLayout('/tmp/origin-test-unused'),
    mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
    rateLimits: { apiPerMinute: 10_000, mediaPerMinute: 10_000, authPerMinute: 10_000, metricsPerMinute: 10_000 },
    identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: false,
    uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
  });
});

after(async () => {
  if (!available) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

describe('export des données personnelles (RGPD)', () => {
  it('exige un compte', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await app.request('/api/me/export')).status, 401);
  });

  it('exporte les données du compte — et seulement les siennes, sans aucun secret', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const mk = async (email: string) => (await app.request('/api/auth/register', json({ email, password: 'Un très bon mot de passe' }))).headers.get('set-cookie')?.split(';')[0] ?? '';
    const alice = await mk('alice@mail.fr');
    const bob = await mk('bob@mail.fr');
    await sql`INSERT INTO programs (slug, kind, title) VALUES ('film', 'film', 'Film')`;
    await sql`INSERT INTO media_assets (playback_id, program_slug, status, storage_path, duration_seconds) VALUES ('film', 'film', 'ready', 'film', 100)`;
    await app.request('/api/me/progress/film', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: alice }, body: JSON.stringify({ positionSeconds: 40 }) });
    await app.request('/api/me/list/film', { method: 'PUT', headers: { cookie: alice } });
    await app.request('/api/me/list/film', { method: 'PUT', headers: { cookie: bob } });

    const response = await app.request('/api/me/export', { headers: { cookie: alice } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition') ?? '', /attachment; filename=/);
    const text = await response.text();
    const data = JSON.parse(text) as any;
    assert.equal(data.account.email, 'alice@mail.fr');
    assert.deepEqual(data.watchProgress.map((p: any) => [p.playbackId, p.positionSeconds]), [['film', 40]]);
    assert.deepEqual(data.myList.map((i: any) => i.slug), ['film']);
    assert.ok(data.securityEvents.some((e: any) => e.event === 'register'));
    assert.equal(data.activeSessions, 1);
    assert.ok(!text.includes('bob@mail.fr'), 'aucune donnée d’un autre compte');
    for (const secret of ['password', 'hash', 'token', 'secret']) {
      assert.ok(!text.toLowerCase().includes(secret), `ne doit pas contenir « ${secret} »`);
    }
  });
});

describe('entretien et durée de conservation', () => {
  it('supprime le périmé et conserve le récent', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const [user] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = 'alice@mail.fr'`;
    const userId = user?.id as string;
    // Anciens : à supprimer. Récents : à garder.
    await sql`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ('old', ${userId}, now() - interval '30 days'), ('fresh', ${userId}, now() + interval '1 hour')`;
    await sql`INSERT INTO email_verifications (token_hash, user_id, email, expires_at) VALUES ('oldv', ${userId}, 'alice@mail.fr', now() - interval '30 days')`;
    await sql`INSERT INTO audit_log (user_id, event, created_at) VALUES (${userId}, 'vieux', now() - interval '400 days'), (${userId}, 'recent', now() - interval '2 days')`;
    for (const [id, age] of [[randomUUID(), 200], [randomUUID(), 5]] as const) {
      await sql`INSERT INTO playback_sessions (id, playback_id, started_at, device, browser, engine) VALUES (${id}, 'film', now() - make_interval(days => ${age}), 'desktop', 'Chrome', 'hlsjs')`;
    }
    await sql`UPDATE sessions SET expires_at = now() - interval '30 days' WHERE user_id = (SELECT id FROM users WHERE email = 'bob@mail.fr')`;

    const report = await purgeExpired(sql, { telemetryDays: 180, auditDays: 365 });
    assert.deepEqual(report, { sessions: 1, tokens: 2, telemetry: 1, audit: 1 });
    assert.deepEqual((await sql`SELECT token_hash FROM password_resets`).map(r => r['token_hash']), ['fresh']);
    assert.deepEqual((await sql`SELECT event FROM audit_log WHERE event IN ('vieux','recent')`).map(r => r['event']), ['recent']);
    assert.equal((await sql`SELECT 1 FROM playback_sessions`).length, 1);
    // Idempotent.
    assert.deepEqual(await purgeExpired(sql, { telemetryDays: 180, auditDays: 365 }), { sessions: 0, tokens: 0, telemetry: 0, audit: 0 });
  });
});
