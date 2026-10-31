/** Module « recommendation » — lectures SQL (caractéristiques du catalogue, historique, popularité). */
import { AUDIENCE_MIN_WATCH_SECONDS, AUDIENCE_WINDOW_DAYS } from '../catalog/audience.ts';
import type { Sql } from '../../platform/database/client.ts';
import { isHistoryEnabled } from '../account/repository.ts';
import type { HistoryEntry, ProgramFeatures } from './scoring.ts';

/** Tout le catalogue public avec ses thématiques : quelques centaines de lignes au plus, calculé à la demande. */
export async function loadCatalog(sql: Sql): Promise<ProgramFeatures[]> {
  const programs = await sql<{ slug: string; title: string; kind: string; category: string | null; genres: string[] }[]>`
    SELECT slug, title, kind, category, genres FROM programs WHERE published AND kind <> 'brand'`;
  const themes = await sql<{ program_slug: string; slug: string; title: string }[]>`
    SELECT pt.program_slug, t.slug, t.title FROM program_themes pt JOIN themes t ON t.slug = pt.theme_slug`;
  const byProgram = new Map<string, Map<string, string>>();
  for (const row of themes) {
    const map = byProgram.get(row.program_slug) ?? new Map<string, string>();
    map.set(row.slug, row.title);
    byProgram.set(row.program_slug, map);
  }
  return programs.map(program => ({ ...program, themes: byProgram.get(program.slug) ?? new Map() }));
}

/**
 * Intérêts d'un compte : contenus terminés (1), entamés à plus de 25 % (0,6), mis en liste (0,8).
 * Une lecture commencée puis abandonnée tout de suite n'est pas un signal d'intérêt.
 */
export async function loadHistory(sql: Sql, userId: string): Promise<HistoryEntry[]> {
  // Historique désactivé par la personne : ce qu'elle a regardé n'influence rien (sa liste, choix explicite, reste prise en compte).
  const historyOn = await isHistoryEnabled(sql, userId);
  const watched = !historyOn ? [] : await sql<{ slug: string; completed: boolean; ratio: string | null }[]>`
    SELECT DISTINCT ON (slug) slug, completed, ratio FROM (
      SELECT COALESCE(wp.program_slug, m.program_slug) AS slug, wp.completed,
             CASE WHEN wp.duration_seconds > 0 THEN (wp.position_seconds / wp.duration_seconds)::text END AS ratio
      FROM watch_progress wp
      LEFT JOIN media_assets m ON m.playback_id = wp.playback_id
      WHERE wp.user_id = ${userId}
    ) x WHERE slug IS NOT NULL
    ORDER BY slug, completed DESC`;
  const list = await sql<{ slug: string }[]>`SELECT slug FROM my_list WHERE user_id = ${userId}`;

  const entries = new Map<string, HistoryEntry>();
  for (const row of list) entries.set(row.slug, { slug: row.slug, weight: 0.8, via: 'list' });
  for (const row of watched) {
    if (row.completed) entries.set(row.slug, { slug: row.slug, weight: 1, via: 'completed' });
    else if (Number(row.ratio ?? 0) >= 0.25) entries.set(row.slug, { slug: row.slug, weight: 0.6, via: 'watching' });
    else if (!entries.has(row.slug)) entries.set(row.slug, { slug: row.slug, weight: 0.01, via: 'watching' }); // « déjà ouvert » : exclu, sans influence
  }
  return [...entries.values()];
}

/** Programmes réellement regardés (voir audience.ts), du plus vu au moins vu ; égalité : titre puis identifiant. */
export async function loadTrending(sql: Sql, limit: number): Promise<{ slug: string; views: number }[]> {
  const rows = await sql<{ slug: string; views: string }[]>`
    SELECT p.slug, count(*)::text AS views
    FROM playback_sessions s
    JOIN media_assets m ON m.playback_id = s.playback_id
    JOIN programs p ON p.slug = m.program_slug AND p.published AND p.kind <> 'brand'
    WHERE s.started_at > now() - make_interval(days => ${AUDIENCE_WINDOW_DAYS}) AND s.watch_seconds >= ${AUDIENCE_MIN_WATCH_SECONDS}
    GROUP BY p.slug ORDER BY count(*) DESC, min(p.title), p.slug LIMIT ${limit}`;
  return rows.map(row => ({ slug: row.slug, views: Number(row.views) }));
}

/** Repli éditorial : l'ordre du Top 10 s'il existe, sinon les programmes lisibles. */
export async function loadEditorialOrder(sql: Sql, limit: number): Promise<string[]> {
  const rows = await sql<{ slug: string }[]>`
    SELECT p.slug FROM programs p
    LEFT JOIN collection_items ci ON ci.program_slug = p.slug AND ci.collection_slug = 'top-10'
    WHERE p.published AND p.kind <> 'brand'
    ORDER BY ci.position NULLS LAST,
             EXISTS (SELECT 1 FROM media_assets m WHERE m.program_slug = p.slug AND m.status = 'ready') DESC, p.title
    LIMIT ${limit}`;
  return rows.map(row => row.slug);
}
