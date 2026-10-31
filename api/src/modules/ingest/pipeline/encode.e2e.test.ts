/**
 * Test de bout en bout avec un VRAI ffmpeg : source synthétique de 6 s → encodage → contrôle → publication → base.
 * Sauté automatiquement si ffmpeg ou PostgreSQL ne sont pas disponibles.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import pino from 'pino';
import { DEV_DATABASE_URL } from '../../../config/env.ts';
import { connect, type Sql } from '../../../platform/database/client.ts';
import { migrate } from '../../../platform/database/migrate.ts';
import { StorageLayout } from '../../../platform/storage/layout.ts';
import { BunnyMediaStore, LocalMediaStore } from '../../../platform/storage/media-store.ts';
import { createBunnySigner } from '../../playback/delivery.ts';
import { findPlayableAsset } from '../repository.ts';
import { claimNextJob, enqueueJob, getJob } from '../jobs.repository.ts';
import { processNextJob } from '../worker.ts';
import { JobAbortedError } from './errors.ts';
import { checkTools, DEFAULT_LOUDNESS, measureLoudness, type Tools } from './ffmpeg.ts';
import { runEncodeJob } from './run-job.ts';
import { validateRendition } from './qc.ts';

const candidates = [
  process.env['FFMPEG_PATH'],
  '/Users/easycash/Library/Application Support/AutoCut/ffmpeg/ffmpeg',
  'ffmpeg',
].filter((value): value is string => Boolean(value));
const ffmpeg = candidates.find(candidate => spawnSync(candidate, ['-version']).status === 0);
const ffprobeCandidates = [
  process.env['FFPROBE_PATH'],
  ffmpeg ? path.join(path.dirname(ffmpeg), 'ffprobe') : undefined,
  'ffprobe',
].filter((value): value is string => Boolean(value));
const ffprobe = ffprobeCandidates.find(candidate => spawnSync(candidate, ['-version']).status === 0);

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let root: string;
let layout: StorageLayout;
let tools: Tools;
let ready = true;
const logger = pino({ level: 'silent' });

async function makeSource(name: string, seconds: number, size = '1280x720'): Promise<string> {
  const file = path.join(layout.sourcesRoot, name, 'original.mp4');
  await mkdir(path.dirname(file), { recursive: true });
  const result = spawnSync(tools.ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `testsrc=duration=${seconds}:size=${size}:rate=24`,
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file,
  ]);
  assert.equal(result.status, 0, String(result.stderr));
  return path.join(name, 'original.mp4');
}

before(async () => {
  if (!ffmpeg || !ffprobe) { ready = false; return; }
  tools = { ffmpeg, ffprobe };
  admin = connect(databaseUrl, { max: 1 });
  try { await admin`SELECT 1`; } catch { ready = false; await admin.end(); return; }
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = connect(databaseUrl, { max: 4, connection: { search_path: schema } });
  await migrate(sql);
  root = await mkdtemp(path.join(tmpdir(), 'origin-e2e-'));
  layout = new StorageLayout(root);
  await checkTools(tools);
});

after(async () => {
  if (!ready) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  await rm(root, { recursive: true, force: true });
});

describe('pipeline d’encodage (ffmpeg réel)', () => {
  it('publie vers Bunny (zone simulée) et produit une URL signée par le CDN', async t => {
    if (!ready) return t.skip('ffmpeg ou PostgreSQL indisponible');
    const uploaded: string[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      uploaded.push(`${init?.method} ${new URL(String(input)).pathname}`);
      return new Response('{}', { status: 201 });
    };
    const store = new BunnyMediaStore({ host: 'storage.example', zone: 'zone', accessKey: 'cle-de-zone-de-test', fetchImpl: fakeFetch });
    const sourcePath = await makeSource('e2e-cdn', 4);
    const queued = await enqueueJob(sql, {
      id: randomUUID(), playbackId: 'e2e-cdn', programSlug: 'e2e-cdn', kind: 'film', title: 'CDN', isDemo: true,
      sourcePath, preset: 'ultrafast', uploadId: null, createdBy: null,
    });
    await processNextJob({ sql, logger, layout, store, tools, workerId: 'test', signal: new AbortController().signal });
    const job = await getJob(sql, queued?.id ?? '');
    assert.equal(job?.status, 'succeeded', job?.lastError ?? '');

    const asset = await findPlayableAsset(sql, 'e2e-cdn');
    assert.match(asset?.storagePath ?? '', /^e2e-cdn\/v[0-9a-z]+$/, 'chemin versionné');
    assert.ok(uploaded.some(line => line.endsWith('/zone/hls/' + (asset?.storagePath ?? '') + '/master.m3u8')));
    assert.ok(uploaded.every(line => line.startsWith('PUT') || line.startsWith('GET') || line.startsWith('DELETE')));

    const signed = createBunnySigner({ cdnUrl: 'https://videos.b-cdn.net', tokenKey: 'cle-de-securite-de-test', ttlSeconds: 600 })
      .sign({ playbackId: 'e2e-cdn', storagePath: asset?.storagePath ?? '' }, { publicOrigin: 'http://x' });
    assert.ok(signed.manifestUrl.endsWith('/hls/' + (asset?.storagePath ?? '') + '/master.m3u8'));
    await assert.rejects(access(layout.workDir(queued?.id ?? '')), 'dossier de travail supprimé');
  });

  it('encode, contrôle, publie et rend le média lisible', async t => {
    if (!ready) return t.skip('ffmpeg ou PostgreSQL indisponible');
    const sourcePath = await makeSource('e2e-film', 6);
    const queued = await enqueueJob(sql, {
      id: randomUUID(), playbackId: 'e2e-film', programSlug: 'e2e-film', kind: 'film', title: 'Film de test', isDemo: true,
      sourcePath, preset: 'ultrafast', uploadId: null, createdBy: null,
    });
    assert.ok(queued);

    const worked = await processNextJob({ sql, logger, layout, store: new LocalMediaStore(layout), tools, workerId: 'test', signal: new AbortController().signal, leaseSeconds: 30 });
    assert.equal(worked, true);

    const finished = await getJob(sql, queued?.id ?? '');
    assert.equal(finished?.status, 'succeeded', finished?.lastError ?? '');
    assert.equal(finished?.progress, 100);

    const asset = await findPlayableAsset(sql, 'e2e-film');
    assert.ok(asset, 'le média est lisible en base');
    assert.ok(Math.abs((asset?.durationSeconds ?? 0) - 6) < 0.5);
    assert.deepEqual(asset?.renditions.map(item => item.name), ['720p', '480p', '360p'], 'pas de sur-échantillonnage');

    const hls = layout.hlsDir('e2e-film');
    const master = await readFile(path.join(hls, 'master.m3u8'), 'utf8');
    assert.match(master, /RESOLUTION=1280x720/);
    assert.match(master, /CODECS="avc1\.[0-9a-f]{6},mp4a\.40\.2"/);
    for (const rung of ['720p', '480p', '360p']) await validateRendition(path.join(hls, rung), 6);
    assert.ok((await stat(path.join(hls, 'poster.jpg'))).size > 0);
    assert.equal(existsSyncSafe(layout.workDir(queued?.id ?? '')), false, 'dossier de travail déplacé à la publication');
    // Aucun programme n'existait : l'encodage l'a créé en BROUILLON (jamais publié par un simple envoi vidéo).
    const [created] = await sql<{ published: boolean }[]>`SELECT published FROM programs WHERE slug = 'e2e-film'`;
    assert.equal(created?.published, false, 'programme créé implicitement = brouillon');
  });

  it('normalise le volume : une source très faible est ramenée à la cible, une piste muette n’échoue pas', async t => {
    if (!ready) return t.skip('ffmpeg ou PostgreSQL indisponible');
    const make = async (name: string, audio: string) => {
      const file = path.join(layout.sourcesRoot, name, 'original.mp4');
      await mkdir(path.dirname(file), { recursive: true });
      const result = spawnSync(tools.ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=10:size=640x360:rate=24',
        '-f', 'lavfi', '-i', audio, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file,
      ]);
      assert.equal(result.status, 0, String(result.stderr));
      return `${name}/original.mp4`;
    };
    const run = async (playbackId: string, sourcePath: string) => {
      await enqueueJob(sql, { id: randomUUID(), playbackId, programSlug: playbackId, kind: 'film', title: playbackId, isDemo: true, sourcePath, preset: 'ultrafast', uploadId: null, createdBy: null });
      const worked = await processNextJob({
        sql, logger, layout, store: new LocalMediaStore(layout), tools, workerId: 'test', signal: new AbortController().signal, leaseSeconds: 30,
        loudness: DEFAULT_LOUDNESS,
      });
      assert.equal(worked, true);
      return (await sql<{ status: string; last_error: string | null }[]>`SELECT status, last_error FROM media_jobs WHERE playback_id = ${playbackId}`)[0];
    };

    // Source très faible (~ -40 LUFS) : la sortie doit être proche de -16 LUFS.
    const quiet = await make('e2e-faible', 'sine=frequency=440:duration=10,volume=0.01');
    const before = await measureLoudness(tools, path.join(layout.sourcesRoot, quiet), DEFAULT_LOUDNESS);
    assert.ok(before && before.inputI < -30, `source attendue très faible, mesurée ${before?.inputI}`);
    const job = await run('e2e-faible', quiet);
    assert.equal(job?.status, 'succeeded', job?.last_error ?? '');
    const after = await measureLoudness(tools, path.join(layout.hlsDir('e2e-faible'), '360p', 'index.m3u8'), DEFAULT_LOUDNESS);
    assert.ok(after && Math.abs(after.inputI - DEFAULT_LOUDNESS.lufs) <= 1.5, `volume de sortie ${after?.inputI} LUFS, cible ${DEFAULT_LOUDNESS.lufs}`);
    assert.ok(after && after.inputTP <= DEFAULT_LOUDNESS.truePeak + 0.6, `crête ${after?.inputTP} dBTP`);

    // Piste muette : la mesure vaut « -inf » → pas de correction, et surtout pas d'échec de la tâche.
    const silent = await make('e2e-muet', 'anullsrc=r=48000:cl=stereo');
    const silentJob = await run('e2e-muet', silent);
    assert.equal(silentJob?.status, 'succeeded', silentJob?.last_error ?? '');
    const state = (await sql<{ state: { loudness?: unknown } }[]>`SELECT state FROM media_jobs WHERE playback_id = 'e2e-muet'`)[0]?.state;
    assert.ok(!state || state.loudness === null || state.loudness === undefined);
  });

  it('survit à une panne passagère de la base pendant le rapport de progression (aucun plantage)', async t => {
    if (!ready) return t.skip('ffmpeg ou PostgreSQL indisponible');
    const sourcePath = await makeSource('e2e-panne', 6);
    const queued = await enqueueJob(sql, {
      id: randomUUID(), playbackId: 'e2e-panne', programSlug: 'e2e-panne', kind: 'film', title: 'Panne', isDemo: true,
      sourcePath, preset: 'ultrafast', uploadId: null, createdBy: null,
    });
    const claimed = await claimNextJob(sql, 'w-panne', 60);
    assert.equal(claimed?.id, queued?.id);
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', listener);
    let lost = 0;
    try {
      await runEncodeJob(claimed as NonNullable<typeof claimed>, {
        sql, logger, layout, store: new LocalMediaStore(layout), tools, signal: new AbortController().signal,
        // Les rapports d'avancement « encodage … » échouent comme un CONNECT_TIMEOUT ; les points de contrôle réussissent.
        report: async (_progress: number, step: string) => { if (step.startsWith('encodage')) { lost += 1; throw new Error('write CONNECT_TIMEOUT 127.0.0.1:5433'); } return true; },
      });
      await new Promise(resolve => setTimeout(resolve, 100)); // laisse passer d'éventuels rejets tardifs
    } finally {
      process.off('unhandledRejection', listener);
    }
    assert.ok(lost > 0, 'au moins un rapport a bien échoué pendant le test');
    assert.deepEqual(unhandled, [], 'aucune promesse rejetée non gérée (sinon Node arrête le processus)');
  });

  it('reprend après une interruption sans refaire les qualités terminées', async t => {
    if (!ready) return t.skip('ffmpeg ou PostgreSQL indisponible');
    const sourcePath = await makeSource('e2e-reprise', 6);
    const queued = await enqueueJob(sql, {
      id: randomUUID(), playbackId: 'e2e-reprise', programSlug: 'e2e-reprise', kind: 'film', title: 'Reprise', isDemo: true,
      sourcePath, preset: 'ultrafast', uploadId: null, createdBy: null,
    });
    const claimed = await claimNextJob(sql, 'w1', 60);
    assert.equal(claimed?.id, queued?.id);

    // Première tentative : « panne » juste après la première qualité terminée (le rapport refuse de continuer).
    let savedState: { completedRungs?: string[] } = {};
    const context = (state: { completedRungs?: string[] }) => ({
      sql, logger, layout, store: new LocalMediaStore(layout), tools, signal: new AbortController().signal,
      report: async (_progress: number, _step: string, newState?: { completedRungs?: string[] }) => {
        if (newState) { savedState = newState; return (newState.completedRungs?.length ?? 0) < 1; } // coupe dès la 1re qualité validée
        return true;
      },
    });
    await assert.rejects(runEncodeJob({ ...(claimed as NonNullable<typeof claimed>) }, context({})), JobAbortedError);
    assert.deepEqual(savedState.completedRungs, ['720p']);

    const firstPlaylist = path.join(layout.workDir(claimed?.id ?? ''), '720p', 'index.m3u8');
    const before = (await stat(firstPlaylist)).mtimeMs;

    // Seconde tentative avec les points de reprise : la qualité 720p n'est PAS ré-encodée.
    const resumed = { ...(claimed as NonNullable<typeof claimed>), state: savedState };
    await runEncodeJob(resumed, { ...context(savedState), report: async () => true });
    assert.ok(await findPlayableAsset(sql, 'e2e-reprise'));
    const published = path.join(layout.hlsDir('e2e-reprise'), '720p', 'index.m3u8');
    assert.equal((await stat(published)).mtimeMs, before, 'qualité conservée telle quelle, non ré-encodée');
  });

  it('rejette un fichier illisible de façon définitive, sans rien publier', async t => {
    if (!ready) return t.skip('ffmpeg ou PostgreSQL indisponible');
    const relative = path.join('e2e-casse', 'original.mp4');
    await mkdir(path.join(layout.sourcesRoot, 'e2e-casse'), { recursive: true });
    await writeFile(path.join(layout.sourcesRoot, relative), 'ceci n’est pas une vidéo');
    const queued = await enqueueJob(sql, {
      id: randomUUID(), playbackId: 'e2e-casse', programSlug: 'e2e-casse', kind: 'film', title: 'Cassé', isDemo: true,
      sourcePath: relative, preset: 'ultrafast', uploadId: null, createdBy: null,
    });
    await processNextJob({ sql, logger, layout, store: new LocalMediaStore(layout), tools, workerId: 'test', signal: new AbortController().signal });
    const job = await getJob(sql, queued?.id ?? '');
    assert.equal(job?.status, 'failed');
    assert.equal(job?.attempts, 1, 'erreur définitive : aucune nouvelle tentative inutile');
    assert.match(job?.lastError ?? '', /illisible|vidéo/i);
    assert.equal(await findPlayableAsset(sql, 'e2e-casse'), null);
  });
});

function existsSyncSafe(file: string): boolean {
  return existsSync(file);
}
