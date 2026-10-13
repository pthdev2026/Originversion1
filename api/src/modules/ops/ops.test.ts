import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import pino from 'pino';
import type { Hono } from 'hono';
import { createApp } from '../../app.ts';
import { DEV_DATABASE_URL } from '../../config/env.ts';
import { connect, type Sql } from '../../platform/database/client.ts';
import { migrate } from '../../platform/database/migrate.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { StorageLayout } from '../../platform/storage/layout.ts';
import { hashPassword } from '../identity/password.ts';
import { insertUser } from '../identity/repository.ts';
import { createIdentityService } from '../identity/service.ts';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
const GO = 1024 ** 3;
let admin: Sql;
let sql: Sql;
let root: string;
let backupDir: string;
let available = true;
let freeBytesValue = 100 * GO;

function makeApp(metricsToken: string | null = 'jeton-de-supervision-de-test-0123456789'): Hono<AppEnv> {
  const logger = pino({ level: 'silent' });
  const identity = createIdentityService({
    sql, logger, mailer: { async send() {} },
    config: { registrationMode: 'open', sessionTtlSeconds: 3600, publicAppUrl: 'http://localhost:3210' },
  });
  return createApp({
    sql, logger, storage: new StorageLayout(root),
    mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
    rateLimits: { apiPerMinute: 10_000, mediaPerMinute: 10_000, authPerMinute: 10_000, metricsPerMinute: 10_000 },
    identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: false, uploadMaxBytes: 50 * GO, encodePreset: 'ultrafast',
    ops: { backupDir, minFreeBytes: 20 * GO, metricsToken, freeBytes: async () => freeBytesValue },
  });
}

before(async () => {
  admin = connect(databaseUrl, { max: 1 });
  try { await admin`SELECT 1`; } catch { available = false; await admin.end(); return; }
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = connect(databaseUrl, { max: 3, connection: { search_path: schema } });
  await migrate(sql);
  root = await mkdtemp(path.join(tmpdir(), 'origin-ops-'));
  backupDir = path.join(root, 'backups');
  await mkdir(backupDir, { recursive: true });
  await insertUser(sql, { id: randomUUID(), email: 'root@origin.test', passwordHash: await hashPassword('Mot de passe administrateur 1'), displayName: null, role: 'admin' });
});

after(async () => {
  if (!available) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  await rm(root, { recursive: true, force: true });
});

describe('exploitation', () => {
  it('/ready répond 200 quand tout va bien, 503 quand le disque est presque plein', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    freeBytesValue = 100 * GO;
    const ok = await app.request('/ready');
    assert.equal(ok.status, 200);
    assert.equal(((await ok.json()) as { status: string }).status, 'ready');

    freeBytesValue = 5 * GO;
    const full = await app.request('/ready');
    assert.equal(full.status, 503);
    const body = (await full.json()) as { checks: { disk: { ok: boolean; detail: string } } };
    assert.equal(body.checks.disk.ok, false);
    assert.match(body.checks.disk.detail, /5\.0 Go libres/);
    freeBytesValue = 100 * GO;
  });

  it('/metrics : désactivé sans jeton, refusé avec un mauvais jeton, complet avec le bon', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    assert.equal((await makeApp(null).request('/metrics')).status, 404);
    const app = makeApp();
    assert.equal((await app.request('/metrics')).status, 401);
    assert.equal((await app.request('/metrics', { headers: { authorization: 'Bearer mauvais-jeton-xxxxxxxxxxxxxxxxxxxx' } })).status, 401);

    await app.request('/api/programs'); // génère un compteur
    const good = await app.request('/metrics', { headers: { authorization: 'Bearer jeton-de-supervision-de-test-0123456789' } });
    assert.equal(good.status, 200);
    const text = await good.text();
    assert.match(text, /origin_http_requests_total\{route="api",status="2xx"\} \d+/);
    assert.match(text, /origin_media_jobs\{status="failed"\} 0/);
    assert.match(text, /origin_disk_free_bytes \d+/);
    assert.match(text, /origin_backup_age_seconds -1/, 'aucune sauvegarde : -1');
    assert.doesNotMatch(text, /sauve@|password/i, 'aucune donnée personnelle dans les métriques');
  });

  it('le tableau de bord administrateur montre la dernière sauvegarde', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    assert.equal((await app.request('/api/admin/system')).status, 401);
    const login = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'root@origin.test', password: 'Mot de passe administrateur 1' }),
    });
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    let system = (await (await app.request('/api/admin/system', { headers: { cookie } })).json()) as { lastBackup: unknown; ready: boolean; users: number };
    assert.equal(system.lastBackup, null);
    assert.equal(system.ready, true);
    assert.equal(system.users, 1);

    const folder = path.join(backupDir, 'db-20261013T020000Z');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'manifest.json'), '{}');
    system = (await (await app.request('/api/admin/system', { headers: { cookie } })).json()) as typeof system;
    assert.equal((system.lastBackup as { name: string }).name, 'db-20261013T020000Z');
  });

  it('refuse un envoi quand l’espace disque est insuffisant', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    const login = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'root@origin.test', password: 'Mot de passe administrateur 1' }),
    });
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const metadata = ['filename film.mp4', 'playbackId film-test', 'kind film', 'title Test']
      .map(pair => { const [key, ...rest] = pair.split(' '); return `${key} ${Buffer.from(rest.join(' ')).toString('base64')}`; }).join(',');

    freeBytesValue = 30 * GO; // 20 Go de marge + 10 Go × 1,6 = 36 Go nécessaires
    const refused = await app.request('/uploads', { method: 'POST', headers: { cookie, 'tus-resumable': '1.0.0', 'upload-length': String(10 * GO), 'upload-metadata': metadata } });
    assert.equal(refused.status, 503);
    assert.match(((await refused.json()) as { message: string }).message, /Espace disque insuffisant/);

    freeBytesValue = 100 * GO;
    const accepted = await app.request('/uploads', { method: 'POST', headers: { cookie, 'tus-resumable': '1.0.0', 'upload-length': String(10 * GO), 'upload-metadata': metadata } });
    assert.equal(accepted.status, 201);
  });
});
