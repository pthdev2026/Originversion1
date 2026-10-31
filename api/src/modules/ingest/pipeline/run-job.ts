/**
 * Exécution d'une tâche d'encodage, de la source au contenu publié.
 *
 *  1. Lire et valider la source          5. Contrôle qualité complet
 *  2. Préparer le dossier de travail     6. Publication (déplacement atomique)
 *  3. Encoder chaque qualité             7. Inscription en base (le média devient lisible)
 *  4. Affiche, playlist maître, meta     8. Nettoyage
 *
 * Reprise : les qualités déjà encodées ET validées sont conservées d'une tentative à l'autre.
 * Rien n'est visible des spectateurs avant l'étape 7 : un échec ne peut donc jamais publier une vidéo incomplète.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../../../platform/logger.ts';
import type { MediaStore } from '../../../platform/storage/media-store.ts';
import type { StorageLayout } from '../../../platform/storage/layout.ts';
import type { Sql } from '../../../platform/database/client.ts';
import { registerAsset } from '../repository.ts';
import type { MediaJob } from '../jobs.repository.ts';
import { JobAbortedError } from './errors.ts';
import { encodeRung, extractPoster, loudnormFilter, measureLoudness, probe, probeCodecString, type LoudnessTarget, type Tools } from './ffmpeg.ts';
import { buildMasterPlaylist, type RenditionEntry } from './playlist.ts';
import { QcError, validateRendition } from './qc.ts';

/** Échelle de qualités. Une qualité n'est produite que si la source est au moins aussi haute (pas de sur-échantillonnage). */
export const LADDER = [
  { name: '1080p', height: 1080, videoKbps: 5000, audioKbps: 128 },
  { name: '720p', height: 720, videoKbps: 2800, audioKbps: 128 },
  { name: '480p', height: 480, videoKbps: 1400, audioKbps: 96 },
  { name: '360p', height: 360, videoKbps: 800, audioKbps: 96 },
] as const;

export const SEGMENT_SECONDS = 4;

export interface JobContext {
  sql: Sql;
  logger: Logger;
  layout: StorageLayout;
  store: MediaStore;
  tools: Tools;
  /** Publie la progression et renouvelle le bail. Retourne false si la tâche ne nous appartient plus. */
  report: (progress: number, step: string, state?: MediaJob['state']) => Promise<boolean>;
  signal: AbortSignal;
  /** Normalisation du volume (EBU R128). Absent : aucune correction. */
  loudness?: LoudnessTarget | null;
}

export async function runEncodeJob(job: MediaJob, ctx: JobContext): Promise<void> {
  const { layout, tools, signal } = ctx;
  const log = ctx.logger.child({ jobId: job.id, playbackId: job.playbackId });
  const guard = async (progress: number, step: string, state?: MediaJob['state']): Promise<void> => {
    if (signal.aborted || !(await ctx.report(progress, step, state))) throw new JobAbortedError();
  };

  // 1. Source.
  await guard(1, 'lecture de la source');
  const source = path.join(layout.sourcesRoot, job.sourcePath);
  const info = await probe(tools, source, signal);
  log.info({ ...info }, 'source analysée');

  const rungs = LADDER.filter(rung => rung.height <= info.height);
  // Source plus petite que le plus bas palier : on garde sa propre hauteur (paire).
  const plan = rungs.length > 0 ? [...rungs] : [{ name: `${info.height - (info.height % 2)}p`, height: info.height - (info.height % 2), videoKbps: 600, audioKbps: 96 }];

  // 2. Dossier de travail (conservé entre les tentatives pour reprendre là où on s'est arrêté).
  const work = layout.workDir(job.id);
  await mkdir(work, { recursive: true });

  // 2 bis. Volume : mesuré UNE fois (et conservé pour les reprises) ; toutes les qualités reçoivent la même correction.
  let loudness = job.state.loudness;
  if (ctx.loudness && info.hasAudio && loudness === undefined) {
    await guard(2, 'mesure du volume');
    try {
      loudness = await measureLoudness(tools, source, ctx.loudness, signal);
    } catch (error) {
      if (error instanceof JobAbortedError) throw error;
      log.warn({ err: error }, 'mesure du volume impossible : encodage sans normalisation');
      loudness = null;
    }
    log.info({ loudness }, loudness ? 'volume mesuré' : 'volume non corrigé (piste muette ou illisible)');
  }
  const audioFilter = ctx.loudness && loudness ? loudnormFilter(ctx.loudness, loudness) : undefined;

  // 3. Encodage qualité par qualité, avec points de reprise.
  const completed = new Set<string>(job.state.completedRungs ?? []);
  const stats = new Map<string, Awaited<ReturnType<typeof validateRendition>>>();
  for (const [index, rung] of plan.entries()) {
    const dir = path.join(work, rung.name);
    if (completed.has(rung.name)) {
      try {
        stats.set(rung.name, await validateRendition(dir, info.durationSeconds)); // vérifie que le travail précédent est intact
        continue;
      } catch (error) {
        if (!(error instanceof QcError)) throw error;
        log.warn({ rung: rung.name, reason: error.message }, 'point de reprise invalide : qualité à refaire');
        completed.delete(rung.name);
      }
    }
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });

    const base = (index / plan.length) * 90;
    const span = 90 / plan.length;
    let lastReported = 0;
    await encodeRung(tools, {
      source, outDir: dir, height: rung.height, videoKbps: rung.videoKbps, audioKbps: rung.audioKbps,
      preset: job.preset, hasAudio: info.hasAudio, ...(audioFilter ? { audioFilter } : {}), segmentSeconds: SEGMENT_SECONDS, durationSeconds: info.durationSeconds,
      signal,
      onProgress: fraction => {
        const now = Date.now();
        if (now - lastReported < 5000) return; // au plus un rapport toutes les 5 s
        lastReported = now;
        // Rapport de confort, jamais bloquant : une panne passagère de la base ne doit ni faire échouer ni faire planter l'encodage
        // (le bail est renouvelé par le minuteur du travailleur ; sans ce `catch`, la promesse rejetée arrêtait tout le processus).
        void ctx.report(base + fraction * span, `encodage ${rung.name}`).catch(error => ctx.logger.warn({ err: error }, 'rapport de progression perdu (non bloquant)'));
      },
    });
    stats.set(rung.name, await validateRendition(dir, info.durationSeconds));
    completed.add(rung.name);
    await guard(base + span, `qualité ${rung.name} terminée`, { completedRungs: [...completed], ...(loudness !== undefined ? { loudness } : {}) });
    log.info({ rung: rung.name }, 'qualité terminée');
  }

  // 4. Affiche, playlist maître, métadonnées.
  await guard(92, 'finalisation');
  await extractPoster(tools, source, path.join(work, 'poster.jpg'), Math.min(info.durationSeconds * 0.1, 60), signal);

  const entries: RenditionEntry[] = [];
  for (const rung of plan) {
    const stat = stats.get(rung.name);
    if (!stat) throw new Error(`Statistiques manquantes pour ${rung.name}`);
    const width = Math.round((info.width / info.height) * rung.height / 2) * 2;
    entries.push({
      uri: `${rung.name}/index.m3u8`,
      bandwidth: Math.max(stat.peakBitsPerSecond, stat.averageBitsPerSecond),
      averageBandwidth: stat.averageBitsPerSecond,
      width,
      height: rung.height,
      codecs: await probeCodecString(tools, path.join(work, rung.name, 'index.m3u8')),
    });
  }
  await writeFile(path.join(work, 'master.m3u8'), buildMasterPlaylist(entries, info.hasAudio));
  const meta = {
    id: job.playbackId,
    source: { width: info.width, height: info.height, fps: info.fps, durationSeconds: info.durationSeconds },
    encodedAt: new Date().toISOString(),
    segmentSeconds: SEGMENT_SECONDS,
    preset: job.preset,
    renditions: plan.map((rung, index) => ({ index, name: rung.name, height: rung.height, videoKbps: rung.videoKbps, audioKbps: rung.audioKbps })),
  };
  await writeFile(path.join(work, 'meta.json'), JSON.stringify(meta, null, 2));

  // 5. Contrôle qualité complet : tout doit être cohérent AVANT de publier.
  await guard(95, 'contrôle qualité');
  const master = await readFile(path.join(work, 'master.m3u8'), 'utf8');
  for (const rung of plan) {
    if (!master.includes(`${rung.name}/index.m3u8`)) throw new QcError(`Playlist maître incomplète : ${rung.name} absente.`);
    await validateRendition(path.join(work, rung.name), info.durationSeconds);
  }

  // 6. Publication, puis 7. inscription en base : à partir d'ici le contenu est lisible.
  await guard(98, 'publication');
  const version = `v${Date.now().toString(36)}`;
  const { storagePath } = await ctx.store.publishHls(work, job.playbackId, version);
  await registerAsset(ctx.sql, {
    playbackId: job.playbackId,
    programSlug: job.programSlug,
    kind: job.kind,
    title: job.title,
    storagePath,
    durationSeconds: info.durationSeconds,
    sourceWidth: info.width,
    sourceHeight: info.height,
    renditions: plan.map(rung => ({ name: rung.name, height: rung.height, videoKbps: rung.videoKbps })),
    preset: job.preset,
    encodeSeconds: null,
    encodedAt: meta.encodedAt,
    isDemo: job.isDemo,
    publishNewProgram: false,
  });
  // 8. Les anciennes versions sont retirées APRÈS que la nouvelle est lisible (au mieux : une erreur n'est pas fatale).
  await ctx.store.pruneOldVersions(job.playbackId, storagePath).catch(error => log.warn({ err: error }, 'nettoyage des anciennes versions impossible'));
  log.info({ storagePath }, 'contenu publié');
}
