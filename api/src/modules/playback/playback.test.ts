import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import pino from 'pino';
import { createApp } from '../../app.ts';
import { DEV_DATABASE_URL } from '../../config/env.ts';
import { connect, type Sql } from '../../platform/database/client.ts';
import { migrate } from '../../platform/database/migrate.ts';
import { StorageLayout } from '../../platform/storage/layout.ts';
import { registerAsset, type IngestInput } from '../ingest/repository.ts';
import { createIdentityService } from '../identity/service.ts';
import type { AppDependencies } from '../../app.ts';
import { findPlayableAsset } from '../ingest/repository.ts';
import { listPlayablePrograms } from '../catalog/repository.ts';

// Chaque exécution travaille dans un schéma PostgreSQL jetable : la base de développement n'est pas touchée.
// Si PostgreSQL n'est pas démarré, les tests concernés sont SAUTÉS (et non « réussis »).
const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let storageRoot: string;
let available = true;

const asset = (overrides: Partial<IngestInput> = {}): IngestInput => ({
  playbackId: 'film-test',
  programSlug: 'film-test',
  kind: 'film',
  title: 'Film test',
  storagePath: 'film-test',
  durationSeconds: 15.5,
  sourceWidth: 1920,
  sourceHeight: 1080,
  renditions: [{ name: '720p', height: 720, videoKbps: 2800 }],
  preset: 'medium',
  encodeSeconds: 10,
  encodedAt: '2026-10-11T12:00:00Z',
  isDemo: true,
  ...overrides,
});

before(async () => {
  admin = connect(databaseUrl, { max: 1 });
  try {
    await admin`SELECT 1`;
  } catch {
    available = false;
    await admin.end();
    return;
  }
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = connect(databaseUrl, { max: 2, connection: { search_path: schema } });
  await migrate(sql);
  storageRoot = await mkdtemp(path.join(tmpdir(), 'origin-storage-'));
});

after(async () => {
  if (!available) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  await rm(storageRoot, { recursive: true, force: true });
});

const testLogger = pino({ level: 'silent' });

/** Application de test : base jetable, secrets fixes, limites larges (surchargeables). */
function makeApp(overrides: Partial<AppDependencies> = {}) {
  const identity = createIdentityService({
    sql,
    logger: testLogger,
    mailer: { async send() {} },
    config: { registrationMode: 'open', sessionTtlSeconds: 3600, publicAppUrl: 'http://localhost:3210' },
  });
  return createApp({
    sql,
    logger: testLogger,
    storage: new StorageLayout(storageRoot),
    mediaSecrets: ['secret-test-secret-test-secret-test!!'],
    mediaTtlSeconds: 60,
    corsOrigins: undefined,
    trustProxy: false,
    rateLimits: { apiPerMinute: 1000, mediaPerMinute: 1000, authPerMinute: 1000, metricsPerMinute: 1000 },
    identity,
    cookieSecure: false,
    sessionTtlSeconds: 3600,
    playbackRequiresLogin: false,
    uploadMaxBytes: 1024 ** 3,
    encodePreset: 'ultrafast',
    ...overrides,
  });
}

describe('catalogue en base', () => {
  it('migre le schéma et ne rejoue pas les migrations', async t => {
    if (!available) return t.skip('PostgreSQL injoignable (npm run db:start)');
    assert.deepEqual(await migrate(sql), []);
  });

  it('enregistre un média puis le retrouve lisible', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    await registerAsset(sql, asset());
    const found = await findPlayableAsset(sql, 'film-test');
    assert.equal(found?.durationSeconds, 15.5);
    assert.equal(found?.programSlug, 'film-test');
    assert.deepEqual(found?.renditions, [{ name: '720p', height: 720, videoKbps: 2800 }]);
    assert.equal((await listPlayablePrograms(sql))[0]?.slug, 'film-test');
  });

  it('met à jour le média sans doublon ni écrasement de la fiche éditoriale', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    await registerAsset(sql, asset({ title: 'Film test v2', durationSeconds: 20 }));
    const programs = await listPlayablePrograms(sql);
    assert.equal(programs.length, 1);
    assert.equal(programs[0]?.title, 'Film test', 'le titre éditorial est conservé');
    assert.equal((await findPlayableAsset(sql, 'film-test'))?.durationSeconds, 20);
  });

  it('ne rend pas lisible un média non prêt', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    await sql`INSERT INTO media_assets (playback_id, program_slug, status, storage_path) VALUES ('film-test-encours', 'film-test', 'processing', 'x')`;
    assert.equal(await findPlayableAsset(sql, 'film-test-encours'), null);
  });

  it('refuse les données invalides', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    await assert.rejects(registerAsset(sql, asset({ programSlug: 'Mauvais Slug', playbackId: 'ok-id' })));
    await assert.rejects(registerAsset(sql, asset({ playbackId: 'sans-duree', durationSeconds: 0 })));
  });
});

describe('API de lecture', () => {
  it('sert la lecture signée d’un média prêt, refuse le reste', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const storage = new StorageLayout(storageRoot);
    await mkdir(path.join(storage.hlsDir('film-test'), 'v0'), { recursive: true });
    await writeFile(path.join(storage.hlsDir('film-test'), 'master.m3u8'), '#EXTM3U\n');
    await writeFile(path.join(storage.hlsDir('film-test'), 'v0', 'seg_00000.m4s'), Buffer.from('0123456789'));

    const app = makeApp({ storage });

    const missing = await app.request('/api/programs/inconnu/playback');
    assert.equal(missing.status, 404);
    const missingBody = (await missing.json()) as { error: string; requestId: string };
    assert.equal(missingBody.error, 'not_available');
    assert.ok(missingBody.requestId, 'la réponse d’erreur porte un identifiant de requête');
    assert.equal((await app.request('/api/programs/Mauvais_ID/playback')).status, 404);

    const playback = await app.request('/api/programs/film-test/playback');
    assert.equal(playback.status, 200);
    assert.ok(playback.headers.get('x-request-id'));
    const body = (await playback.json()) as { manifestUrl: string; durationSeconds: number };
    assert.equal(body.durationSeconds, 20);

    const master = await app.request(new URL(body.manifestUrl).pathname);
    assert.equal(master.status, 200);
    assert.equal(master.headers.get('content-type'), 'application/vnd.apple.mpegurl');

    const base = new URL(body.manifestUrl).pathname.replace(/master\.m3u8$/, '');
    const partial = await app.request(`${base}v0/seg_00000.m4s`, { headers: { Range: 'bytes=2-5' } });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(await partial.text(), '2345');

    assert.equal((await app.request('/media/1.signature/film-test/master.m3u8')).status, 403);
    // Un chemin qui tente de sortir du dossier du média n'est jamais servi.
    assert.equal((await app.request(`${base}..%2F..%2F..%2Fetc%2Fpasswd`)).status, 404);
    assert.equal((await app.request(`${base}..%2Fautre%2Fmaster.m3u8`)).status, 404);
    // Pourcentage mal formé : erreur 400 propre, pas une panne 500.
    const malformed = await app.request(`${base}%E0%A4%A`);
    assert.equal(malformed.status, 400);
    // Les erreurs inconnues deviennent un 404 JSON propre, pas une page d'erreur.
    const unknown = await app.request('/nimporte/quoi');
    assert.equal(unknown.status, 404);
    assert.equal(((await unknown.json()) as { error: string }).error, 'not_found');
  });

  it('applique les protections de sécurité', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp({ rateLimits: { apiPerMinute: 3, mediaPerMinute: 1000, authPerMinute: 1000, metricsPerMinute: 1000 } });
    const first = await app.request('/api/programs/film-test/playback');
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('cache-control'), 'no-store', 'les URLs signées ne se mettent pas en cache');
    assert.equal(first.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(first.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(first.headers.get('ratelimit-limit'), '3');
    await app.request('/api/programs/film-test/playback');
    await app.request('/api/programs/film-test/playback');
    const limited = await app.request('/api/programs/film-test/playback');
    assert.equal(limited.status, 429);
    assert.equal(((await limited.json()) as { error: string }).error, 'rate_limited');
    // La santé n'est jamais limitée : la supervision doit toujours pouvoir interroger le service.
    assert.equal((await app.request('/health')).status, 200);
  });

  it('refuse les corps trop volumineux sur l’API', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    const big = 'x'.repeat(70 * 1024);
    const response = await app.request('/api/programs/film-test/playback', { method: 'POST', body: big });
    assert.ok([404, 413].includes(response.status));
  });

  it('expose l’état de santé', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    const response = await app.request('/health');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', database: 'ok' });
  });
});
