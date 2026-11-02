/** Mesure exceptionnelle de démonstration : DEMO_PLAYBACK_OVERRIDE (temporaire, interdite en production). */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
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
import { registerAsset } from '../ingest/repository.ts';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let demo: Hono<AppEnv>;
let plain: Hono<AppEnv>;
let available = true;

const build = (override: string[] | null) => {
  const logger = pino({ level: 'silent' });
  const identity = createIdentityService({ sql, logger, mailer: { async send() {} }, config: { registrationMode: 'open', sessionTtlSeconds: 3600, publicAppUrl: 'http://localhost:3210' } });
  return createApp({
    sql, logger, storage: new StorageLayout('/tmp/origin-test-unused'),
    mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
    rateLimits: { apiPerMinute: 10_000, mediaPerMinute: 10_000, authPerMinute: 10_000, metricsPerMinute: 10_000 },
    identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: false, uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
    demoPlaybackOverride: override,
  });
};

before(async () => {
  admin = connect(databaseUrl, { max: 1 });
  try { await admin`SELECT 1`; } catch { available = false; await admin.end(); return; }
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = connect(databaseUrl, { max: 4, connection: { search_path: schema } });
  await migrate(sql);
  await registerAsset(sql, {
    playbackId: 'film-long', programSlug: 'film-long', kind: 'film', title: 'Film long', storagePath: 'film-long', durationSeconds: 5100,
    sourceWidth: 1280, sourceHeight: 720, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: true,
  });
  demo = build(['film-long']);
  plain = build(null);
});

after(async () => {
  if (!available) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

describe('mesure de démonstration : DEMO_PLAYBACK_OVERRIDE', () => {
  it('avec le mode démo, n\'importe quel programme ou épisode lit le film configuré (lien signé, mesure, durée)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    for (const requested of ['un-programme-sans-media', 'serie-x-s1-e3', 'film-long']) {
      const response = await demo.request(`/api/programs/${requested}/playback`);
      assert.equal(response.status, 200, requested);
      const body = (await response.json()) as { programId: string; durationSeconds: number; manifestUrl: string; analytics: { sessionId: string } };
      assert.equal(body.programId, 'film-long');
      assert.equal(body.durationSeconds, 5100);
      assert.match(body.manifestUrl, /\/media\//);
      assert.ok(body.analytics.sessionId);
      assert.equal(response.headers.get('x-demo-override'), requested === 'film-long' ? null : requested);
    }
  });

  it('sans le mode démo : comportement normal (média inconnu = 404, média réel = 200)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await plain.request('/api/programs/un-programme-sans-media/playback')).status, 404);
    assert.equal((await plain.request('/api/programs/film-long/playback')).status, 200);
  });
});
