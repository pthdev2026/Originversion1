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
import { registerAsset } from '../ingest/repository.ts';
import { validateVtt } from './routes.ts';

const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nBonjour à tous\n';

describe('validation WebVTT', () => {
  it('accepte un fichier valide et refuse le reste', () => {
    assert.equal(validateVtt(VTT), null);
    assert.equal(validateVtt('﻿' + VTT), null, 'BOM toléré');
    assert.match(validateVtt('1\n00:00:01,000 --> 00:00:02,000\nSRT') ?? '', /WEBVTT/);
    assert.match(validateVtt('WEBVTT\n\npas de repère') ?? '', /repère/);
    assert.match(validateVtt(VTT + '<script>x</script>') ?? '', /interdite/);
  });
});

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
const storageRoot = `/tmp/origin-sub-${randomBytes(4).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let app: Hono<AppEnv>;
let available = true;
let adminCookie = '';

const call = (method: string, path: string, body?: string, cookie?: string) =>
  app.request(path, { method, headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'text/vtt' }) }, ...(body === undefined ? {} : { body }) });
const asset = (id: string) => registerAsset(sql, {
  playbackId: id, programSlug: id, kind: 'film', title: id, storagePath: id, durationSeconds: 60,
  sourceWidth: 1280, sourceHeight: 720, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: true,
});

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
    sql, logger, storage: new StorageLayout(storageRoot),
    mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
    rateLimits: { apiPerMinute: 10_000, mediaPerMinute: 10_000, authPerMinute: 10_000, metricsPerMinute: 10_000 },
    identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: false,
    uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
  });
  await insertUser(sql, { id: randomUUID(), email: 'root@origin.test', passwordHash: await hashPassword('Mot de passe administrateur 1'), displayName: null, role: 'admin' });
  const login = await app.request('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'root@origin.test', password: 'Mot de passe administrateur 1' }),
  });
  adminCookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  await asset('film');
});

after(async () => {
  if (!available) return;
  await rm(storageRoot, { recursive: true, force: true });
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

describe('sous-titres', () => {
  it('dépôt réservé à l’administrateur', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await call('PUT', '/files/subtitles/film/fr', VTT)).status, 401);
  });

  it('dépose, expose dans la réponse de lecture, sert, remplace et supprime', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await call('PUT', '/files/subtitles/film/fr?label=Fran%C3%A7ais&default=true', VTT, adminCookie)).status, 204);
    assert.equal((await call('PUT', '/files/subtitles/film/en?label=English', VTT.replace('Bonjour à tous', 'Hello'), adminCookie)).status, 204);

    const playback = (await (await call('GET', '/api/programs/film/playback')).json()) as { subtitles: { lang: string; label: string; default: boolean; url: string }[] };
    assert.deepEqual(playback.subtitles.map(s => [s.lang, s.label, s.default]), [['fr', 'Français', true], ['en', 'English', false]]);
    assert.match(playback.subtitles[0]?.url ?? '', /\/subtitles\/film\/fr\.vtt$/);

    const served = await call('GET', '/subtitles/film/fr.vtt');
    assert.equal(served.status, 200);
    assert.match(served.headers.get('content-type') ?? '', /^text\/vtt/);
    assert.equal(await served.text(), VTT);

    // La piste par défaut est unique : en désigner une autre déplace le drapeau.
    await call('PUT', '/files/subtitles/film/en?label=English&default=true', VTT, adminCookie);
    const next = (await (await call('GET', '/api/programs/film/playback')).json()) as { subtitles: { lang: string; default: boolean }[] };
    assert.deepEqual(next.subtitles.map(s => [s.lang, s.default]), [['en', true], ['fr', false]]);

    assert.equal((await call('DELETE', '/files/subtitles/film/en', undefined, adminCookie)).status, 204);
    assert.equal((await call('GET', '/subtitles/film/en.vtt')).status, 404);
    assert.equal((await call('DELETE', '/files/subtitles/film/en', undefined, adminCookie)).status, 404);
  });

  it('refuse les fichiers et identifiants invalides', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await call('PUT', '/files/subtitles/film/fr', 'pas du vtt', adminCookie)).status, 400);
    assert.equal((await call('PUT', '/files/subtitles/film/FRANCAIS!', VTT, adminCookie)).status, 400);
    assert.equal((await call('PUT', '/files/subtitles/inconnu/fr', VTT, adminCookie)).status, 404);
    assert.equal((await call('PUT', '/files/subtitles/film/fr', '', adminCookie)).status, 400);
    assert.equal((await call('PUT', '/files/subtitles/film/fr', 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n' + 'x'.repeat(1024 * 1024), adminCookie)).status, 413);
    assert.equal((await call('GET', '/subtitles/..%2Fetc/fr.vtt')).status, 404);
    assert.equal((await call('GET', '/subtitles/film/inconnue.vtt')).status, 404);
  });

  it('un média sans sous-titres répond une liste vide', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await asset('nu');
    const playback = (await (await call('GET', '/api/programs/nu/playback')).json()) as { subtitles: unknown[] };
    assert.deepEqual(playback.subtitles, []);
  });
});
