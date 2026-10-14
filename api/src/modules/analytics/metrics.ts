/**
 * Module « analytics » — mesure de la qualité de lecture (QoE).
 *
 * Le navigateur envoie, toutes les ~15 s, un rapport CUMULATIF de la session de lecture (démarrage, coupures,
 * qualité regardée, erreurs). On garde le maximum de chaque compteur : les envois peuvent arriver dans le désordre.
 * Aucune donnée personnelle : pas d'adresse IP, pas d'identifiant de compte, pas de user-agent brut.
 * Objectifs suivis (voir TARGETS) : démarrage < 2 s, coupures < 1 %, erreurs < 1 %.
 */
import type { Sql } from '../../platform/database/client.ts';

export interface SessionReport {
  id: string;
  playbackId: string;
  startupMs: number | null;
  rebufferCount: number;
  rebufferMs: number;
  watchSeconds: number;
  levelSeconds: Record<string, number>;
  maxHeight: number | null;
  fatalError: string | null;
  device: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  engine: 'hlsjs' | 'native';
  connection: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[a-z0-9][a-z0-9-]*$/;
const MAX_WATCH_SECONDS = 24 * 3600;

const int = (value: unknown, max: number): number | null => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(Math.round(number), max) : null;
};
const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.length > 0 ? value.slice(0, max).replace(/[^\w .+/-]/g, '') : null;

/** Valide et borne un rapport venu du navigateur. Retourne null s'il est inexploitable. */
export function parseSessionReport(input: unknown): SessionReport | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw['id'] !== 'string' || !UUID.test(raw['id'])) return null;
  if (typeof raw['playbackId'] !== 'string' || !ID.test(raw['playbackId'])) return null;
  const device = raw['device'];
  const engine = raw['engine'];
  if (device !== 'mobile' && device !== 'tablet' && device !== 'desktop') return null;
  if (engine !== 'hlsjs' && engine !== 'native') return null;

  const levelSeconds: Record<string, number> = {};
  if (typeof raw['levelSeconds'] === 'object' && raw['levelSeconds'] !== null) {
    for (const [height, seconds] of Object.entries(raw['levelSeconds']).slice(0, 12)) {
      const h = int(height, 4320);
      const s = Number(seconds);
      if (h && Number.isFinite(s) && s >= 0) levelSeconds[String(h)] = Math.min(Math.round(s * 10) / 10, MAX_WATCH_SECONDS);
    }
  }

  return {
    id: raw['id'].toLowerCase(),
    playbackId: raw['playbackId'],
    startupMs: raw['startupMs'] == null ? null : int(raw['startupMs'], 300_000),
    rebufferCount: int(raw['rebufferCount'], 10_000) ?? 0,
    rebufferMs: int(raw['rebufferMs'], 24 * 3600 * 1000) ?? 0,
    watchSeconds: Math.min(Math.max(Number(raw['watchSeconds']) || 0, 0), MAX_WATCH_SECONDS),
    levelSeconds,
    maxHeight: raw['maxHeight'] == null ? null : int(raw['maxHeight'], 4320),
    fatalError: text(raw['fatalError'], 80),
    device,
    browser: text(raw['browser'], 24) ?? 'inconnu',
    engine,
    connection: text(raw['connection'], 12),
  };
}

/**
 * Enregistre un rapport. Les rapports d'une même session sont cumulatifs côté navigateur ;
 * on garde le maximum de chaque compteur pour tolérer les envois dans le désordre.
 */
export async function saveSessionReport(sql: Sql, report: SessionReport): Promise<void> {
  await sql`
    INSERT INTO playback_sessions
      (id, playback_id, startup_ms, rebuffer_count, rebuffer_ms, watch_seconds, level_seconds, max_height, fatal_error, device, browser, engine, connection)
    VALUES
      (${report.id}, ${report.playbackId}, ${report.startupMs}, ${report.rebufferCount}, ${report.rebufferMs}, ${report.watchSeconds},
       ${sql.json(report.levelSeconds)}, ${report.maxHeight}, ${report.fatalError}, ${report.device}, ${report.browser}, ${report.engine}, ${report.connection})
    ON CONFLICT (id) DO UPDATE SET
      startup_ms     = COALESCE(playback_sessions.startup_ms, EXCLUDED.startup_ms),
      rebuffer_count = GREATEST(playback_sessions.rebuffer_count, EXCLUDED.rebuffer_count),
      rebuffer_ms    = GREATEST(playback_sessions.rebuffer_ms, EXCLUDED.rebuffer_ms),
      level_seconds  = CASE WHEN EXCLUDED.watch_seconds >= playback_sessions.watch_seconds THEN EXCLUDED.level_seconds ELSE playback_sessions.level_seconds END,
      watch_seconds  = GREATEST(playback_sessions.watch_seconds, EXCLUDED.watch_seconds),
      max_height     = GREATEST(playback_sessions.max_height, EXCLUDED.max_height),
      fatal_error    = COALESCE(EXCLUDED.fatal_error, playback_sessions.fatal_error),
      updated_at     = now()
    WHERE playback_sessions.playback_id = EXCLUDED.playback_id`;
}

export const TARGETS = { startupP75Ms: 2000, rebufferRatio: 0.01, errorRate: 0.01 } as const;

export interface PlaybackSummary {
  periodDays: number;
  playbackId: string | null;
  sessions: number;
  startedSessions: number;
  startupMs: { p50: number | null; p75: number | null; p95: number | null };
  rebufferRatio: number | null;
  sessionsWithRebufferRate: number | null;
  errorRate: number | null;
  watchHours: number;
  qualitySeconds: Record<string, number>;
  byDevice: Record<string, { sessions: number; startupP75Ms: number | null }>;
  targets: typeof TARGETS;
  meetsTargets: { startup: boolean | null; rebuffer: boolean | null; errors: boolean | null };
}

interface SummaryRow {
  sessions: string;
  started: string;
  p50: string | null;
  p75: string | null;
  p95: string | null;
  watch_s: string;
  rebuffer_ms: string;
  with_rebuffer: string;
  errors: string;
}

const round = (value: string | null): number | null => (value === null ? null : Math.round(Number(value)));

/** Synthèse de la qualité d'expérience sur les `days` derniers jours, éventuellement pour un seul média. */
export async function summarizePlayback(sql: Sql, days = 7, playbackId: string | null = null): Promise<PlaybackSummary> {
  const since = new Date(Date.now() - days * 86_400_000);
  const scope = playbackId ? sql`AND playback_id = ${playbackId}` : sql``;

  const [row] = await sql<SummaryRow[]>`
    SELECT count(*)::text AS sessions,
           count(startup_ms)::text AS started,
           percentile_cont(0.5)  WITHIN GROUP (ORDER BY startup_ms)::text AS p50,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY startup_ms)::text AS p75,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY startup_ms)::text AS p95,
           coalesce(sum(watch_seconds), 0)::text AS watch_s,
           coalesce(sum(rebuffer_ms), 0)::text AS rebuffer_ms,
           count(*) FILTER (WHERE rebuffer_count > 0)::text AS with_rebuffer,
           count(*) FILTER (WHERE fatal_error IS NOT NULL)::text AS errors
    FROM playback_sessions
    WHERE started_at >= ${since} ${scope}`;

  const levels = await sql<{ height: string; seconds: string }[]>`
    SELECT e.key AS height, sum(e.value::numeric)::text AS seconds
    FROM playback_sessions s, jsonb_each_text(s.level_seconds) AS e
    WHERE s.started_at >= ${since} ${scope}
    GROUP BY e.key`;

  const devices = await sql<{ device: string; sessions: string; p75: string | null }[]>`
    SELECT device, count(*)::text AS sessions,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY startup_ms)::text AS p75
    FROM playback_sessions
    WHERE started_at >= ${since} ${scope}
    GROUP BY device`;

  const sessions = Number(row?.sessions ?? 0);
  const watchMs = Number(row?.watch_s ?? 0) * 1000;
  const rebufferMs = Number(row?.rebuffer_ms ?? 0);
  const playedMs = watchMs + rebufferMs;
  const p75 = round(row?.p75 ?? null);
  const rebufferRatio = playedMs > 0 ? rebufferMs / playedMs : null;
  const errorRate = sessions > 0 ? Number(row?.errors ?? 0) / sessions : null;

  return {
    periodDays: days,
    playbackId,
    sessions,
    startedSessions: Number(row?.started ?? 0),
    startupMs: { p50: round(row?.p50 ?? null), p75, p95: round(row?.p95 ?? null) },
    rebufferRatio: rebufferRatio === null ? null : Math.round(rebufferRatio * 10_000) / 10_000,
    sessionsWithRebufferRate: sessions > 0 ? Math.round((Number(row?.with_rebuffer ?? 0) / sessions) * 1000) / 1000 : null,
    errorRate: errorRate === null ? null : Math.round(errorRate * 10_000) / 10_000,
    watchHours: Math.round((watchMs / 3_600_000) * 100) / 100,
    qualitySeconds: Object.fromEntries(levels.map(level => [level.height, Math.round(Number(level.seconds))]).sort((a, b) => Number(b[0]) - Number(a[0]))),
    byDevice: Object.fromEntries(devices.map(device => [device.device, { sessions: Number(device.sessions), startupP75Ms: round(device.p75) }])),
    targets: TARGETS,
    meetsTargets: {
      startup: p75 === null ? null : p75 <= TARGETS.startupP75Ms,
      rebuffer: rebufferRatio === null ? null : rebufferRatio <= TARGETS.rebufferRatio,
      errors: errorRate === null ? null : errorRate <= TARGETS.errorRate,
    },
  };
}

// ---- Tableau de bord éditorial : « qu'est-ce qui est regardé, et jusqu'où ? » ---------------------------------------

export interface ProgramMetrics {
  slug: string;
  title: string;
  kind: string;
  /** Lectures réelles : sessions d'au moins 10 s (une ouverture accidentelle ne compte pas). */
  views: number;
  watchHours: number;
  /** Durée moyenne regardée par lecture, en minutes. */
  avgWatchMinutes: number | null;
  /** Comptes distincts ayant avancé dans ce programme sur la période. */
  viewers: number;
  /** Part de ces comptes qui l'ont terminé (95 % / 30 s). */
  completionRate: number | null;
  startupP75Ms: number | null;
  errorRate: number | null;
  rebufferRatio: number | null;
}

export interface EditorialDashboard {
  periodDays: number;
  totals: { accounts: number; newAccounts: number; activeViewers: number; views: number; watchHours: number };
  programs: ProgramMetrics[];
  catalogHealth: { published: number; playable: number; publishedWithoutMedia: string[] };
}

export async function editorialDashboard(sql: Sql, days = 30, limit = 50): Promise<EditorialDashboard> {
  const since = new Date(Date.now() - days * 86_400_000);

  const rows = await sql<{
    slug: string; title: string; kind: string; views: string; watch_s: string; rebuffer_ms: string; errors: string; sessions: string; p75: string | null;
  }[]>`
    SELECT p.slug, p.title, p.kind,
           count(*) FILTER (WHERE s.watch_seconds >= 10)::text AS views,
           coalesce(sum(s.watch_seconds), 0)::text AS watch_s,
           coalesce(sum(s.rebuffer_ms), 0)::text AS rebuffer_ms,
           count(*) FILTER (WHERE s.fatal_error IS NOT NULL)::text AS errors,
           count(*)::text AS sessions,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY s.startup_ms)::text AS p75
    FROM playback_sessions s
    JOIN media_assets m ON m.playback_id = s.playback_id
    JOIN programs p ON p.slug = m.program_slug AND p.kind <> 'brand'
    WHERE s.started_at >= ${since}
    GROUP BY p.slug, p.title, p.kind
    ORDER BY count(*) FILTER (WHERE s.watch_seconds >= 10) DESC, coalesce(sum(s.watch_seconds), 0) DESC
    LIMIT ${limit}`;

  const progress = await sql<{ slug: string; viewers: string; completed: string }[]>`
    SELECT COALESCE(wp.program_slug, m.program_slug) AS slug,
           count(DISTINCT wp.user_id)::text AS viewers,
           count(DISTINCT wp.user_id) FILTER (WHERE wp.completed)::text AS completed
    FROM watch_progress wp
    LEFT JOIN media_assets m ON m.playback_id = wp.playback_id
    WHERE wp.updated_at >= ${since}
    GROUP BY 1`;
  const progressBySlug = new Map(progress.map(row => [row.slug, row]));

  const [totals] = await sql<{ accounts: string; new_accounts: string; active: string }[]>`
    SELECT (SELECT count(*) FROM users WHERE status = 'active')::text AS accounts,
           (SELECT count(*) FROM users WHERE created_at >= ${since})::text AS new_accounts,
           (SELECT count(DISTINCT user_id) FROM watch_progress WHERE updated_at >= ${since})::text AS active`;

  const [health] = await sql<{ published: string; playable: string }[]>`
    SELECT count(*)::text AS published,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM media_assets m WHERE m.program_slug = p.slug AND m.status = 'ready'))::text AS playable
    FROM programs p WHERE p.published AND p.kind <> 'brand'`;
  const missing = await sql<{ slug: string }[]>`
    SELECT p.slug FROM programs p
    WHERE p.published AND p.kind <> 'brand' AND NOT p.is_demo
      AND NOT EXISTS (SELECT 1 FROM media_assets m WHERE m.program_slug = p.slug AND m.status = 'ready')
    ORDER BY p.slug LIMIT 100`;

  const programs: ProgramMetrics[] = rows.map(row => {
    const views = Number(row.views);
    const watchSeconds = Number(row.watch_s);
    const sessions = Number(row.sessions);
    const rebufferMs = Number(row.rebuffer_ms);
    const playedMs = watchSeconds * 1000 + rebufferMs;
    const reached = progressBySlug.get(row.slug);
    const viewers = Number(reached?.viewers ?? 0);
    return {
      slug: row.slug, title: row.title, kind: row.kind, views,
      watchHours: Math.round((watchSeconds / 3600) * 100) / 100,
      avgWatchMinutes: views > 0 ? Math.round((watchSeconds / views / 60) * 10) / 10 : null,
      viewers,
      completionRate: viewers > 0 ? Math.round((Number(reached?.completed ?? 0) / viewers) * 1000) / 1000 : null,
      startupP75Ms: round(row.p75),
      errorRate: sessions > 0 ? Math.round((Number(row.errors) / sessions) * 10_000) / 10_000 : null,
      rebufferRatio: playedMs > 0 ? Math.round((rebufferMs / playedMs) * 10_000) / 10_000 : null,
    };
  });

  return {
    periodDays: days,
    totals: {
      accounts: Number(totals?.accounts ?? 0),
      newAccounts: Number(totals?.new_accounts ?? 0),
      activeViewers: Number(totals?.active ?? 0),
      views: programs.reduce((sum, program) => sum + program.views, 0),
      watchHours: Math.round(programs.reduce((sum, program) => sum + program.watchHours, 0) * 100) / 100,
    },
    programs,
    catalogHealth: {
      published: Number(health?.published ?? 0),
      playable: Number(health?.playable ?? 0),
      publishedWithoutMedia: missing.map(row => row.slug),
    },
  };
}
