/** Module « progress » — accès aux données de reprise de lecture (SQL uniquement). */
import type { Sql } from '../../platform/database/client.ts';

export interface Progress {
  playbackId: string;
  programSlug: string | null;
  positionSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
  updatedAt: Date;
}

interface ProgressRow {
  playback_id: string;
  program_slug: string | null;
  position_seconds: string;
  duration_seconds: string | null;
  completed: boolean;
  updated_at: Date;
}

const toProgress = (row: ProgressRow): Progress => ({
  playbackId: row.playback_id,
  programSlug: row.program_slug,
  positionSeconds: Number(row.position_seconds),
  durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
  completed: row.completed,
  updatedAt: row.updated_at,
});

/**
 * Enregistre la position. « Dernier envoi gagne », mais un envoi plus ancien (client_ts inférieur)
 * n'écrase jamais un plus récent : les envois peuvent arriver dans le désordre.
 */
export async function upsertProgress(
  sql: Sql,
  input: { userId: string; playbackId: string; programSlug: string | null; positionSeconds: number; durationSeconds: number | null; completed: boolean; clientTs: number },
): Promise<void> {
  await sql`
    INSERT INTO watch_progress (user_id, playback_id, program_slug, position_seconds, duration_seconds, completed, client_ts)
    VALUES (${input.userId}, ${input.playbackId}, ${input.programSlug}, ${input.positionSeconds}, ${input.durationSeconds}, ${input.completed}, ${input.clientTs})
    ON CONFLICT (user_id, playback_id) DO UPDATE SET
      program_slug = COALESCE(EXCLUDED.program_slug, watch_progress.program_slug),
      position_seconds = EXCLUDED.position_seconds,
      duration_seconds = COALESCE(EXCLUDED.duration_seconds, watch_progress.duration_seconds),
      completed = EXCLUDED.completed,
      client_ts = EXCLUDED.client_ts,
      updated_at = now()
    WHERE EXCLUDED.client_ts >= watch_progress.client_ts`;
}

export async function findProgress(sql: Sql, userId: string, playbackId: string): Promise<Progress | null> {
  const [row] = await sql<ProgressRow[]>`SELECT * FROM watch_progress WHERE user_id = ${userId} AND playback_id = ${playbackId}`;
  return row ? toProgress(row) : null;
}

export interface ContinueWatchingItem extends Progress {
  title: string | null;
  kind: string | null;
}

/** Contenus commencés et non terminés, les plus récents d'abord. */
export async function listContinueWatching(sql: Sql, userId: string, limit: number): Promise<ContinueWatchingItem[]> {
  const rows = await sql<(ProgressRow & { title: string | null; kind: string | null })[]>`
    SELECT w.*, p.title, p.kind
    FROM watch_progress w
    LEFT JOIN programs p ON p.slug = w.program_slug
    WHERE w.user_id = ${userId} AND w.completed = false AND w.position_seconds >= 10
    ORDER BY w.updated_at DESC
    LIMIT ${limit}`;
  return rows.map(row => ({ ...toProgress(row), title: row.title, kind: row.kind }));
}

export async function deleteProgress(sql: Sql, userId: string, playbackId: string): Promise<void> {
  await sql`DELETE FROM watch_progress WHERE user_id = ${userId} AND playback_id = ${playbackId}`;
}
