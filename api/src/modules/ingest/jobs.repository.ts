/**
 * File de tâches d'encodage, dans PostgreSQL (SQL uniquement).
 *
 * Idée : une « tâche » est une ligne. Un travailleur (worker) la RÉSERVE pour une durée limitée (un « bail »)
 * et la renouvelle régulièrement. S'il disparaît (panne, redémarrage), le bail expire et la tâche est
 * reprise par un autre. `FOR UPDATE SKIP LOCKED` garantit que deux travailleurs ne prennent jamais la même.
 */
import type { LoudnessMeasure } from './pipeline/ffmpeg.ts';
import type { Executor, Sql } from '../../platform/database/client.ts';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface MediaJob {
  id: string;
  playbackId: string;
  programSlug: string;
  kind: 'film' | 'serie' | 'documentaire' | 'brand';
  title: string;
  isDemo: boolean;
  sourcePath: string;
  preset: string;
  status: JobStatus;
  step: string | null;
  progress: number;
  attempts: number;
  maxAttempts: number;
  /** `loudness` : mesure du volume de la source (conservée entre les tentatives) ; null = mesurée mais non corrigée (muet). */
  state: { completedRungs?: string[]; loudness?: LoudnessMeasure | null };
  lastError: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

interface JobRow {
  id: string;
  playback_id: string;
  program_slug: string;
  kind: MediaJob['kind'];
  title: string;
  is_demo: boolean;
  source_path: string;
  preset: string;
  status: JobStatus;
  step: string | null;
  progress: string;
  attempts: number;
  max_attempts: number;
  state: MediaJob['state'];
  last_error: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

const toJob = (row: JobRow): MediaJob => ({
  id: row.id,
  playbackId: row.playback_id,
  programSlug: row.program_slug,
  kind: row.kind,
  title: row.title,
  isDemo: row.is_demo,
  sourcePath: row.source_path,
  preset: row.preset,
  status: row.status,
  step: row.step,
  progress: Number(row.progress),
  attempts: row.attempts,
  maxAttempts: row.max_attempts,
  state: row.state ?? {},
  lastError: row.last_error,
  createdAt: row.created_at,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
});

export interface EnqueueInput {
  id: string;
  playbackId: string;
  programSlug: string;
  kind: MediaJob['kind'];
  title: string;
  isDemo: boolean;
  sourcePath: string;
  preset: string;
  uploadId: string | null;
  createdBy: string | null;
}

/** Ajoute une tâche. Retourne null s'il y en a déjà une active pour ce média. */
export async function enqueueJob(sql: Executor, input: EnqueueInput): Promise<MediaJob | null> {
  const [row] = await sql<JobRow[]>`
    INSERT INTO media_jobs (id, playback_id, program_slug, kind, title, is_demo, source_path, preset, upload_id, created_by)
    VALUES (${input.id}, ${input.playbackId}, ${input.programSlug}, ${input.kind}, ${input.title}, ${input.isDemo},
            ${input.sourcePath}, ${input.preset}, ${input.uploadId}, ${input.createdBy})
    ON CONFLICT (playback_id) WHERE status IN ('queued', 'running') DO NOTHING
    RETURNING *`;
  return row ? toJob(row) : null;
}

/**
 * Réserve la prochaine tâche disponible : en attente, ou « en cours » dont le bail a expiré (travailleur disparu).
 * Une tâche dont le bail a expiré après avoir épuisé ses tentatives est marquée « échouée » au lieu d'être reprise.
 */
export async function claimNextJob(sql: Sql, workerId: string, leaseSeconds: number): Promise<MediaJob | null> {
  await sql`
    UPDATE media_jobs
    SET status = 'failed', finished_at = now(), updated_at = now(), locked_by = NULL, locked_until = NULL,
        last_error = COALESCE(last_error, 'Le travailleur a disparu après toutes les tentatives autorisées.')
    WHERE status = 'running' AND locked_until < now() AND attempts >= max_attempts`;

  const [row] = await sql<JobRow[]>`
    UPDATE media_jobs
    SET status = 'running', attempts = attempts + 1, locked_by = ${workerId},
        locked_until = now() + make_interval(secs => ${leaseSeconds}),
        started_at = COALESCE(started_at, now()), updated_at = now(), step = COALESCE(step, 'démarrage')
    WHERE id = (
      SELECT id FROM media_jobs
      WHERE (status = 'queued' AND run_after <= now()) OR (status = 'running' AND locked_until < now())
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *`;
  return row ? toJob(row) : null;
}

/** Renouvelle le bail et publie la progression. Retourne false si la tâche n'appartient plus à ce travailleur. */
export async function heartbeat(
  sql: Sql,
  input: { jobId: string; workerId: string; leaseSeconds: number; progress: number; step: string; state?: MediaJob['state'] },
): Promise<boolean> {
  const rows = await sql`
    UPDATE media_jobs
    SET locked_until = now() + make_interval(secs => ${input.leaseSeconds}), progress = ${Math.min(100, Math.max(0, input.progress))},
        step = ${input.step}, state = COALESCE(${input.state ? sql.json(input.state as never) : null}::jsonb, state), updated_at = now()
    WHERE id = ${input.jobId} AND locked_by = ${input.workerId} AND status = 'running'
    RETURNING id`;
  return rows.length > 0;
}

export async function markSucceeded(sql: Sql, jobId: string, workerId: string): Promise<void> {
  await sql`
    UPDATE media_jobs SET status = 'succeeded', progress = 100, step = 'terminé', finished_at = now(), updated_at = now(),
                          locked_by = NULL, locked_until = NULL, last_error = NULL
    WHERE id = ${jobId} AND locked_by = ${workerId}`;
}

/**
 * Échec d'une tentative : on remet en file avec un délai croissant, tant qu'il reste des tentatives.
 * Une erreur « définitive » (fichier illisible…) échoue tout de suite.
 */
export async function markFailed(sql: Sql, input: { jobId: string; workerId: string; error: string; permanent: boolean }): Promise<'retry' | 'failed'> {
  const [row] = await sql<{ status: JobStatus }[]>`
    UPDATE media_jobs
    SET status = CASE WHEN ${input.permanent} OR attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
        run_after = now() + make_interval(secs => LEAST(attempts * 60, 900)),
        finished_at = CASE WHEN ${input.permanent} OR attempts >= max_attempts THEN now() ELSE NULL END,
        last_error = ${input.error.slice(0, 2000)}, locked_by = NULL, locked_until = NULL, step = 'en attente d''une nouvelle tentative', updated_at = now()
    WHERE id = ${input.jobId} AND locked_by = ${input.workerId}
    RETURNING status`;
  return row?.status === 'failed' ? 'failed' : 'retry';
}

/** Arrêt volontaire du travailleur : la tâche retourne en file sans consommer de tentative. */
export async function release(sql: Sql, jobId: string, workerId: string): Promise<void> {
  await sql`
    UPDATE media_jobs SET status = 'queued', attempts = GREATEST(attempts - 1, 0), locked_by = NULL, locked_until = NULL,
                          step = 'remise en file', updated_at = now()
    WHERE id = ${jobId} AND locked_by = ${workerId} AND status = 'running'`;
}

export async function getJob(sql: Sql, id: string): Promise<MediaJob | null> {
  const [row] = await sql<JobRow[]>`SELECT * FROM media_jobs WHERE id = ${id}`;
  return row ? toJob(row) : null;
}

export interface JobFilter {
  /** Tâches d'un contenu précis (identifiant de lecture). */
  playbackId?: string;
  /** Tâches de tous les contenus d'un programme (film ou tous les épisodes d'une série). */
  programSlug?: string;
}

export async function listJobs(sql: Sql, limit: number, filter: JobFilter = {}): Promise<MediaJob[]> {
  const byPlayback = filter.playbackId ? sql`AND playback_id = ${filter.playbackId}` : sql``;
  const byProgram = filter.programSlug ? sql`AND program_slug = ${filter.programSlug}` : sql``;
  const rows = await sql<JobRow[]>`SELECT * FROM media_jobs WHERE true ${byPlayback} ${byProgram} ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map(toJob);
}

export async function cancelJob(sql: Sql, id: string): Promise<boolean> {
  const rows = await sql`
    UPDATE media_jobs SET status = 'canceled', finished_at = now(), updated_at = now(), locked_by = NULL, locked_until = NULL
    WHERE id = ${id} AND status IN ('queued', 'running') RETURNING id`;
  return rows.length > 0;
}

/** Relance une tâche échouée ou annulée (administrateur). Les points de reprise sont conservés. */
export async function retryJob(sql: Sql, id: string): Promise<boolean> {
  const rows = await sql`
    UPDATE media_jobs SET status = 'queued', attempts = 0, run_after = now(), finished_at = NULL, last_error = NULL, updated_at = now()
    WHERE id = ${id} AND status IN ('failed', 'canceled') RETURNING id`;
  return rows.length > 0;
}

/** Vrai tant que la tâche appartient à ce travailleur et n'a pas été annulée. */
export async function stillOwns(sql: Sql, jobId: string, workerId: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM media_jobs WHERE id = ${jobId} AND locked_by = ${workerId} AND status = 'running'`;
  return rows.length > 0;
}
