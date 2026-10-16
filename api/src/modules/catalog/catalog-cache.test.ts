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

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let app: Hono<AppEnv>;
let available = true;
let cookie = '';

const put = (title: string) => app.request('/api/admin/programs/cache-test', {
  method: 'PUT', headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ kind: 'film', title, published: true }),
});
const titleOf = async () => ((await (await app.request('/api/programs/cache-test')).json()) as { title: string }).title;

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
    uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast', catalogCacheTtlMs: 60_000,
  });
  await insertUser(sql, { id: randomUUID(), email: 'root@origin.test', passwordHash: await hashPassword('Mot de passe administrateur 1'), displayName: null, role: 'admin' });
  const login = await app.request('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'root@origin.test', password: 'Mot de passe administrateur 1' }),
  });
  cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
});

after(async () => {
  if (!available) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

describe('cache serveur du catalogue', () => {
  it('sert le cache, mais une écriture éditoriale le vide aussitôt', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await put('Version A')).status, 201);
    assert.equal(await titleOf(), 'Version A');

    // Changement « dans le dos » de l'API (autre instance, accès direct) : le cache répond encore l'ancienne version.
    await sql`UPDATE programs SET title = 'Version B' WHERE slug = 'cache-test'`;
    assert.equal(await titleOf(), 'Version A', 'servi depuis le cache');

    // Une écriture via l'administration vide le cache : le changement est visible immédiatement.
    assert.equal((await put('Version C')).status, 200);
    assert.equal(await titleOf(), 'Version C');
  });

  it('l’accueil et la recherche suivent la même règle ; les erreurs ne sont pas mises en cache', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const search = async () => ((await (await app.request('/api/search?q=version')).json()) as { programs: unknown[] }).programs.length;
    assert.equal(await search(), 1);
    await sql`INSERT INTO programs (slug, kind, title, published) VALUES ('autre', 'film', 'Autre version', true)`;
    assert.equal(await search(), 1, 'recherche en cache');
    await put('Version D'); // écriture admin → cache vidé
    assert.equal(await search(), 2);
    assert.equal((await app.request('/api/programs/inconnu')).status, 404);
  });
});
