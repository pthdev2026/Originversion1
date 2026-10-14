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

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let app: Hono<AppEnv>;
let available = true;
let adminCookie = '';

const json = { 'content-type': 'application/json' };
const asset = (id: string, slug: string) => registerAsset(sql, {
  playbackId: id, programSlug: slug, kind: 'film', title: slug, storagePath: id, durationSeconds: 100,
  sourceWidth: 1280, sourceHeight: 720, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: false,
});
const session = (playbackId: string, watched: number, extra: { error?: string; startup?: number } = {}) => sql`
  INSERT INTO playback_sessions (id, playback_id, watch_seconds, startup_ms, fatal_error, device, browser, engine)
  VALUES (${randomUUID()}, ${playbackId}, ${watched}, ${extra.startup ?? 800}, ${extra.error ?? null}, 'desktop', 'Chrome', 'hlsjs')`;

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
  await insertUser(sql, { id: randomUUID(), email: 'root@origin.test', passwordHash: await hashPassword('Mot de passe administrateur 1'), displayName: null, role: 'admin' });
  const login = await app.request('/api/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ email: 'root@origin.test', password: 'Mot de passe administrateur 1' }) });
  adminCookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
});

after(async () => {
  if (!available) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

describe('tableau de bord éditorial', () => {
  it('réservé à l’administrateur', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await app.request('/api/admin/metrics/programs')).status, 401);
  });

  it('agrège lectures, achèvement et santé du catalogue', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await asset('film-a', 'film-a');
    await asset('film-b', 'film-b');
    await sql`INSERT INTO programs (slug, kind, title, is_demo, published) VALUES ('sans-media', 'film', 'Sans média', false, true)`;
    await session('film-a', 100);
    await session('film-a', 50, { startup: 1200 });
    await session('film-a', 4);                        // ouverture accidentelle : pas une lecture
    await session('film-a', 30, { error: 'network' });
    await session('film-b', 10);

    // Deux comptes sur film-a : l'un a terminé, l'autre non.
    const ids = [randomUUID(), randomUUID()];
    for (const [index, id] of ids.entries()) {
      await insertUser(sql, { id, email: `u${index}@mail.fr`, passwordHash: 'x', displayName: null, role: 'viewer' });
      await sql`INSERT INTO watch_progress (user_id, playback_id, program_slug, position_seconds, duration_seconds, completed)
                VALUES (${id}, 'film-a', 'film-a', ${index === 0 ? 99 : 20}, 100, ${index === 0})`;
    }

    const response = await app.request('/api/admin/metrics/programs?days=7', { headers: { cookie: adminCookie } });
    assert.equal(response.status, 200);
    const body = (await response.json()) as any;
    const a = body.programs.find((p: any) => p.slug === 'film-a');
    assert.equal(a.views, 3);
    assert.equal(a.viewers, 2);
    assert.equal(a.completionRate, 0.5);
    assert.equal(a.errorRate, 0.25);
    assert.equal(a.watchHours, Math.round((184 / 3600) * 100) / 100);
    assert.equal(a.avgWatchMinutes, Math.round((184 / 3 / 60) * 10) / 10);
    assert.equal(body.programs[0].slug, 'film-a', 'le plus regardé d’abord');
    assert.equal(body.totals.accounts, 3);
    assert.equal(body.totals.activeViewers, 2);
    assert.deepEqual(body.catalogHealth, { published: 3, playable: 2, publishedWithoutMedia: ['sans-media'] });
    assert.ok(!JSON.stringify(body).includes('mail.fr'), 'aucune donnée personnelle');
  });
});
