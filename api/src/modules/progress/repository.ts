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
  /** Épisode concerné (séries) : de quoi afficher « Épisode 6 · Saison 2 ». `null` pour un film. */
  episode: { key: string; number: number; seasonNumber: number; title: string } | null;
}

/** Contenus commencés et non terminés, les plus récents d'abord. */
export async function listContinueWatching(sql: Sql, userId: string, limit: number): Promise<ContinueWatchingItem[]> {
  const rows = await sql<(ProgressRow & { title: string | null; kind: string | null; ep_key: string | null; ep_number: number | null; ep_season: number | null; ep_title: string | null })[]>`
    SELECT w.*, p.title, p.kind, e.key AS ep_key, e.number AS ep_number, e.season_number AS ep_season, e.title AS ep_title
    FROM watch_progress w
    LEFT JOIN programs p ON p.slug = w.program_slug
    LEFT JOIN episodes e ON e.program_slug = w.program_slug AND w.playback_id = w.program_slug || '-' || e.key
    WHERE w.user_id = ${userId} AND w.completed = false AND w.position_seconds >= 10
    ORDER BY w.updated_at DESC
    LIMIT ${limit}`;
  return rows.map(row => ({
    ...toProgress(row), title: row.title, kind: row.kind,
    episode: row.ep_key !== null && row.ep_number !== null && row.ep_season !== null && row.ep_title !== null
      ? { key: row.ep_key, number: row.ep_number, seasonNumber: row.ep_season, title: row.ep_title } : null,
  }));
}

/**
 * Progression de CHAQUE contenu d'un programme (tous les épisodes d'une série en un appel), du plus récent au plus ancien.
 * Le programme est retrouvé par `program_slug`, ou à défaut par le média (jointure sur `media_assets`) : même règle
 * que l'historique des recommandations. Terminés INCLUS (c'est ce qui permet d'afficher l'état « Vu »).
 */
export async function listProgramProgress(sql: Sql, userId: string, programSlug: string, limit = 500): Promise<Progress[]> {
  const rows = await sql<ProgressRow[]>`
    SELECT w.*
    FROM watch_progress w
    LEFT JOIN media_assets m ON m.playback_id = w.playback_id
    WHERE w.user_id = ${userId} AND COALESCE(w.program_slug, m.program_slug) = ${programSlug}
    ORDER BY w.updated_at DESC
    LIMIT ${limit}`;
  return rows.map(toProgress);
}

/** Efface TOUT l'historique de visionnage d'un compte (retourne le nombre de lignes supprimées). */
export async function clearHistory(sql: Sql, userId: string): Promise<number> {
  return (await sql`DELETE FROM watch_progress WHERE user_id = ${userId}`).count;
}

export async function deleteProgress(sql: Sql, userId: string, playbackId: string): Promise<void> {
  await sql`DELETE FROM watch_progress WHERE user_id = ${userId} AND playback_id = ${playbackId}`;
}

/** Le compte a-t-il déjà commencé ce programme (n'importe quel épisode) ? Sert à décider de l'ident de marque. */
export async function hasProgressInProgram(sql: Sql, userId: string, programSlug: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM watch_progress WHERE user_id = ${userId} AND program_slug = ${programSlug} LIMIT 1`;
  return rows.length > 0;
}

/** Même question pour une saison : `seasonPrefix` vaut « <slug>-s2- » (identifiants bornés : a-z, 0-9, tiret). */
export async function hasProgressInSeason(sql: Sql, userId: string, seasonPrefix: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM watch_progress WHERE user_id = ${userId} AND playback_id LIKE ${`${seasonPrefix}%`} LIMIT 1`;
  return rows.length > 0;
}
