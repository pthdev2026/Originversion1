import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from './app.ts';
import { findPlayableAsset, listPlayablePrograms, registerAsset, type IngestInput } from './catalog.ts';
import { connect, databaseUrl, type Sql } from './db/client.ts';
import { migrate } from './db/migrate.ts';

// Chaque exécution travaille dans un schéma PostgreSQL jetable : la base de développement n'est pas touchée.
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let storageDir: string;
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
  admin = connect(databaseUrl(), { max: 1 });
  try {
    await admin`SELECT 1`;
  } catch {
    available = false;
    await admin.end();
    return;
  }
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = connect(databaseUrl(), { max: 2, connection: { search_path: schema } });
  await migrate(sql);
  storageDir = await mkdtemp(path.join(tmpdir(), 'origin-hls-'));
});

after(async () => {
  if (!available) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  await rm(storageDir, { recursive: true, force: true });
});

describe('catalogue en base', { skip: process.env.CI ? false : undefined }, () => {
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

  it('met à jour sans doublon lors d’une nouvelle ingestion', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    await registerAsset(sql, asset({ title: 'Film test v2', durationSeconds: 20 }));
    const programs = await listPlayablePrograms(sql);
    assert.equal(programs.length, 1);
    assert.equal(programs[0]?.title, 'Film test v2');
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
    await mkdir(path.join(storageDir, 'film-test', 'v0'), { recursive: true });
    await writeFile(path.join(storageDir, 'film-test', 'master.m3u8'), '#EXTM3U\n');
    await writeFile(path.join(storageDir, 'film-test', 'v0', 'seg_00000.m4s'), Buffer.from('0123456789'));
    const app = createApp({ sql, storageDir, mediaSecret: 'secret-test', ttlSeconds: 60 });

    const missing = await app.request('/api/programs/inconnu/playback');
    assert.equal(missing.status, 404);
    assert.equal((await app.request('/api/programs/Mauvais_ID/playback')).status, 404);

    const playback = await app.request('/api/programs/film-test/playback');
    assert.equal(playback.status, 200);
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
    // Un chemin qui tente de sortir du dossier du programme n'est jamais servi.
    assert.equal((await app.request(`${base}..%2F..%2F..%2Fetc%2Fpasswd`)).status, 404);
    assert.equal((await app.request(`${base}..%2Fautre%2Fmaster.m3u8`)).status, 404);
  });
});
