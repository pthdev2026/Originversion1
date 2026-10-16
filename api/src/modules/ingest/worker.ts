/**
 * Travailleur d'encodage : boucle qui réserve une tâche, l'exécute, publie l'avancement.
 *
 * Il tourne dans un PROCESSUS SÉPARÉ de l'API (`npm run worker`) : un encodage de plusieurs heures ne ralentit
 * jamais la lecture des spectateurs, et un redémarrage de l'API n'interrompt pas l'encodage.
 */
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { Sql } from '../../platform/database/client.ts';
import type { Logger } from '../../platform/logger.ts';
import type { MediaStore } from '../../platform/storage/media-store.ts';
import type { StorageLayout } from '../../platform/storage/layout.ts';
import { claimNextJob, heartbeat, markFailed, markSucceeded, release, stillOwns, type MediaJob } from './jobs.repository.ts';
import { JobAbortedError, PermanentJobError } from './pipeline/errors.ts';
import type { LoudnessTarget, Tools } from './pipeline/ffmpeg.ts';
import { QcError } from './pipeline/qc.ts';
import { runEncodeJob } from './pipeline/run-job.ts';

export interface WorkerOptions {
  sql: Sql;
  logger: Logger;
  layout: StorageLayout;
  store: MediaStore;
  tools: Tools;
  /** Normalisation du volume (voir pipeline/ffmpeg.ts). Absent : aucune. */
  loudness?: LoudnessTarget | null;
  /** Durée du bail en secondes : si le travailleur ne donne pas signe de vie, la tâche est reprise. */
  leaseSeconds?: number;
  /** Délai entre deux interrogations de la file quand elle est vide, en millisecondes. */
  pollMs?: number;
}

export interface WorkerHandle {
  /** Demande l'arrêt : la tâche en cours est remise en file proprement. */
  stop(): Promise<void>;
  /** Résout quand la boucle s'est arrêtée. */
  done: Promise<void>;
}

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });

/** Traite UNE tâche si la file en contient. Retourne true si une tâche a été traitée. */
export async function processNextJob(options: WorkerOptions & { workerId: string; signal: AbortSignal }): Promise<boolean> {
  const { sql, logger, workerId, signal } = options;
  const lease = options.leaseSeconds ?? 90;
  const job = await claimNextJob(sql, workerId, lease);
  if (!job) return false;

  const log = logger.child({ jobId: job.id, playbackId: job.playbackId, attempt: job.attempts });
  log.info('tâche réservée');

  // Le bail est renouvelé par chaque rapport de progression ; ce minuteur le renouvelle aussi pendant les longues étapes.
  const controller = new AbortController();
  const onStop = () => controller.abort();
  signal.addEventListener('abort', onStop, { once: true });
  let lastProgress = 0;
  let lastStep = 'démarrage';
  const report = async (progress: number, step: string, state?: MediaJob['state']): Promise<boolean> => {
    lastProgress = progress;
    lastStep = step;
    return heartbeat(sql, { jobId: job.id, workerId, leaseSeconds: lease, progress, step, ...(state ? { state } : {}) });
  };
  const keepAlive = setInterval(() => {
    void (async () => {
      if (!(await stillOwns(sql, job.id, workerId))) controller.abort(); // annulée ou reprise par un autre
      else await report(lastProgress, lastStep);
    })().catch(error => log.error({ err: error }, 'renouvellement du bail impossible'));
  }, Math.max(5, lease / 3) * 1000);

  try {
    await runEncodeJob(job, { sql, logger, layout: options.layout, store: options.store, tools: options.tools, loudness: options.loudness ?? null, report, signal: controller.signal });
    await markSucceeded(sql, job.id, workerId);
    log.info('tâche terminée');
  } catch (error) {
    if (error instanceof JobAbortedError || controller.signal.aborted) {
      if (signal.aborted) {
        await release(sql, job.id, workerId); // arrêt du travailleur : la tâche repart en file, sans perdre une tentative
        log.warn('tâche remise en file (arrêt du travailleur)');
      } else {
        log.warn('tâche interrompue (annulée ou reprise par un autre travailleur)');
      }
    } else {
      const permanent = error instanceof PermanentJobError || error instanceof QcError;
      const message = error instanceof Error ? error.message : String(error);
      const outcome = await markFailed(sql, { jobId: job.id, workerId, error: message, permanent });
      log.error({ err: error, outcome }, 'tâche en échec');
      if (outcome === 'failed') await rm(options.layout.workDir(job.id), { recursive: true, force: true }).catch(() => undefined);
    }
  } finally {
    clearInterval(keepAlive);
    signal.removeEventListener('abort', onStop);
  }
  return true;
}

export function startWorker(options: WorkerOptions): WorkerHandle {
  const workerId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const controller = new AbortController();
  const pollMs = options.pollMs ?? 3000;
  const log = options.logger.child({ workerId });

  const done = (async () => {
    log.info('travailleur démarré');
    while (!controller.signal.aborted) {
      try {
        const worked = await processNextJob({ ...options, workerId, signal: controller.signal });
        if (!worked) await sleep(pollMs, controller.signal);
      } catch (error) {
        log.error({ err: error }, 'erreur dans la boucle du travailleur');
        await sleep(pollMs, controller.signal);
      }
    }
    log.info('travailleur arrêté');
  })();

  return {
    done,
    async stop() {
      controller.abort();
      await done;
    },
  };
}
