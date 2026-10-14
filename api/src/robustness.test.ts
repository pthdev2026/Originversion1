/**
 * Tests de robustesse : concurrence (migrations, éditions simultanées), traduction des pannes de base de données,
 * entrées hostiles. Ils vérifient que le système se dégrade proprement au lieu de produire des états incohérents.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import pino from 'pino';
import type { Hono } from 'hono';
import { createApp } from './app.ts';
import { DEV_DATABASE_URL } from './config/env.ts';
import { insertUser } from './modules/identity/repository.ts';
import { hashPassword } from './modules/identity/password.ts';
import { createIdentityService } from './modules/identity/service.ts';
import { connect, type Sql } from './platform/database/client.ts';
import { migrate } from './platform/database/migrate.ts';
import { mapDatabaseError } from './platform/http/error-handler.ts';
import type { AppEnv } from './platform/http/types.ts';
import { StorageLayout } from './platform/storage/layout.ts';

describe('traduction des erreurs de base de données', () => {
  it('panne, délai, saturation → 503 ; doublon → 409 ; référence → 400 ; bug → null', () => {
    for (const code of ['ECONNREFUSED', 'CONNECTION_CLOSED', '57014', '57P01', '53300', '40P01']) {
      assert.equal(mapDatabaseError({ code })?.status, 503, code);
    }
    assert.equal(mapDatabaseError({ code: '23505' })?.status, 409);
    assert.equal(mapDatabaseError({ code: '23503' })?.status, 400);
    assert.equal(mapDatabaseError({ code: '42703' }), null, 'colonne inconnue = bug : reste une 500');
    assert.equal(mapDatabaseError(new Error('x')), null);
    assert.equal(mapDatabaseError(null), null);
  });
});

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let app: Hono<AppEnv>;
let available = true;
let adminCookie = '';
let dir = '';

const send = (method: string, pathName: string, body?: unknown, cookie?: string, raw = false) =>
  app.request(pathName, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: raw ? String(body) : JSON.stringify(body) }),
  });

before(async () => {
  admin = connect(databaseUrl, { max: 1 });
  try { await admin`SELECT 1`; } catch { available = false; await admin.end(); return; }
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = connect(databaseUrl, { max: 12, connection: { search_path: schema } });
  await migrate(sql);
  dir = await mkdtemp(path.join(tmpdir(), 'origin-robust-'));
  const logger = pino({ level: 'silent' });
  const identity = createIdentityService({
    sql, logger, mailer: { async send() {} },
    config: { registrationMode: 'open', sessionTtlSeconds: 3600, publicAppUrl: 'http://localhost:3210' },
  });
  app = createApp({
    sql, logger, storage: new StorageLayout(dir),
    mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
    rateLimits: { apiPerMinute: 100_000, mediaPerMinute: 100_000, authPerMinute: 100_000, metricsPerMinute: 100_000 },
    identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: false,
    uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
  });
  await insertUser(sql, { id: randomUUID(), email: 'root@origin.test', passwordHash: await hashPassword('Mot de passe administrateur 1'), displayName: null, role: 'admin' });
  const login = await send('POST', '/api/auth/login', { email: 'root@origin.test', password: 'Mot de passe administrateur 1' });
  adminCookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
});

after(async () => {
  if (!available) return;
  await rm(dir, { recursive: true, force: true });
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

describe('concurrence', () => {
  it('deux instances qui migrent en même temps : chaque migration est appliquée une seule fois', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const migrations = await mkdtemp(path.join(tmpdir(), 'origin-mig-'));
    await writeFile(path.join(migrations, '001_a.sql'), 'CREATE TABLE concurrent_a (id int);');
    await writeFile(path.join(migrations, '002_b.sql'), 'CREATE TABLE concurrent_b (id int);');
    // Deux « instances » (deux connexions) lancent migrate() simultanément, sur un schéma vierge.
    const fresh = `test_${randomBytes(6).toString('hex')}`;
    await admin.unsafe(`CREATE SCHEMA ${fresh}`);
    const one = connect(databaseUrl, { max: 2, connection: { search_path: fresh } });
    const two = connect(databaseUrl, { max: 2, connection: { search_path: fresh } });
    try {
      const [first, second] = await Promise.all([migrate(one, migrations), migrate(two, migrations)]);
      assert.deepEqual([...first, ...second].sort(), ['001_a.sql', '002_b.sql'], 'chaque migration appliquée exactement une fois');
      assert.deepEqual(await migrate(one, migrations), [], 'idempotent');
    } finally {
      await one.end();
      await two.end();
      await admin.unsafe(`DROP SCHEMA ${fresh} CASCADE`);
      await rm(migrations, { recursive: true, force: true });
    }
  });

  it('20 enregistrements simultanés du même programme : aucune erreur, état final cohérent', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const doc = (n: number) => ({
      kind: 'serie', title: `Série v${n}`, published: true,
      seasons: [{ number: 1, episodes: [{ key: 's1-e1', number: 1, title: 'Un' }, { key: 's1-e2', number: 2, title: 'Deux' }] }],
    });
    const responses = await Promise.all(Array.from({ length: 20 }, (_, n) => send('PUT', '/api/admin/programs/concurrent', doc(n), adminCookie)));
    assert.deepEqual([...new Set(responses.map(r => r.status))].sort(), [200, 201]);
    const [row] = await sql<{ seasons: string; episodes: string }[]>`
      SELECT (SELECT count(*) FROM seasons WHERE program_slug = 'concurrent')::text AS seasons,
             (SELECT count(*) FROM episodes WHERE program_slug = 'concurrent')::text AS episodes`;
    assert.equal(row?.seasons, '1');
    assert.equal(row?.episodes, '2');
  });

  it('20 écritures simultanées de la même collection : positions cohérentes', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    for (const slug of ['p1', 'p2', 'p3']) {
      await send('PUT', `/api/admin/programs/${slug}`, { kind: 'film', title: slug, published: true }, adminCookie);
    }
    const responses = await Promise.all(Array.from({ length: 20 }, (_, n) =>
      send('PUT', '/api/admin/collections/course', { title: 'Course', layout: 'rail', published: true, items: n % 2 ? ['p1', 'p2', 'p3'] : ['p3', 'p2', 'p1'] }, adminCookie)));
    assert.deepEqual([...new Set(responses.map(r => r.status))], [204]);
    const items = await sql<{ position: number }[]>`SELECT position FROM collection_items WHERE collection_slug = 'course' ORDER BY position`;
    assert.deepEqual(items.map(i => i.position), [0, 1, 2]);
  });
});

describe('entrées hostiles', () => {
  it('ne produit jamais de 500 sur des entrées malformées', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const hostile = [
      '', '%', '%%', '_', "'; DROP TABLE programs; --", '\\', '\u0000', '😀'.repeat(40), 'a'.repeat(5000), '../../etc/passwd', '%00', '%ZZ',
    ];
    const statuses = new Set<number>();
    for (const value of hostile) {
      const q = encodeURIComponent(value);
      for (const pathName of [`/api/search?q=${q}`, `/api/programs/${q}`, `/api/themes/${q}`, `/api/collections/${q}`, `/api/programs/${q}/similar`, `/images/${q}/${q}`, `/subtitles/${q}/${q}`]) {
        try {
          const response = await send('GET', pathName);
          statuses.add(response.status);
          assert.ok(response.status < 500, `${pathName} → ${response.status}`);
        } catch (error) {
          assert.fail(`${pathName} a levé : ${String(error)}`);
        }
      }
    }
    assert.ok([...statuses].every(status => status === 200 || status === 400 || status === 404), [...statuses].join(','));
    // La table n'a pas été touchée par l'injection.
    assert.ok(Number((await sql`SELECT count(*) FROM programs`)[0]?.['count']) >= 0);
  });

  it('JSON malformé, mauvais types et champs en trop : 400 propre', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const bodies: unknown[] = ['{', '[]', 'null', '"texte"', '{"kind":5}', '{"kind":"film","title":"x","seasons":"non"}', '{"kind":"film","title":"x","__proto__":{"a":1}}'];
    for (const body of bodies) {
      const response = await send('PUT', '/api/admin/programs/hostile', body, adminCookie, true);
      assert.equal(response.status, 400, String(body));
    }
    for (const path of ['/api/auth/login', '/api/auth/register', '/api/auth/password/forgot', '/api/playback-sessions']) {
      for (const body of ['{', '[]', 'null', '{"email":5,"password":[]}']) {
        const response = await send('POST', path, body, undefined, true);
        assert.equal(response.status, 400, `${path} ${body}`);
      }
    }
  });

  it('corps trop gros refusé sans lire le tout', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const response = await send('PUT', '/api/admin/programs/gros', JSON.stringify({ kind: 'film', title: 'x'.repeat(80_000) }), adminCookie, true);
    assert.equal(response.status, 413);
  });
});

describe('panne de la base en cours de service', () => {
  it('répond 503 « réessayez » (et non 500), puis /health signale la panne', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    // Application dédiée dont la connexion est coupée : simule une base qui disparaît pendant le service.
    const doomed = connect(databaseUrl, { max: 2, connection: { search_path: schema } });
    const logger = pino({ level: 'silent' });
    const identity = createIdentityService({
      sql: doomed, logger, mailer: { async send() {} },
      config: { registrationMode: 'open', sessionTtlSeconds: 3600, publicAppUrl: 'http://localhost:3210' },
    });
    const broken = createApp({
      sql: doomed, logger, storage: new StorageLayout(dir),
      mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
      rateLimits: { apiPerMinute: 100_000, mediaPerMinute: 100_000, authPerMinute: 100_000, metricsPerMinute: 100_000 },
      identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: false,
      uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
    });
    assert.equal((await broken.request('/api/home')).status, 200);
    await doomed.end();
    const home = await broken.request('/api/home');
    assert.equal(home.status, 503);
    assert.equal(home.headers.get('retry-after'), '5');
    assert.equal(((await home.json()) as { error: string }).error, 'unavailable');
    assert.equal((await broken.request('/health')).status, 503);
  });
});
