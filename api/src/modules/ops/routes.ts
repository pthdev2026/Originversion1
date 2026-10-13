/**
 * Module « ops » — exploitation : disponibilité, supervision, état du système.
 *
 *   GET /ready                 le service peut-il travailler ? (base, stockage, disque) — public, sans détail sensible
 *   GET /metrics               compteurs pour la supervision — protégé par un jeton (METRICS_TOKEN)
 *   GET /api/admin/system      tableau de bord JSON pour l'administrateur
 */
import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import type { Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';
import type { MetricsRegistry } from '../../platform/http/metrics.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { checkReadiness, freeBytesOf, latestBackup, type FreeBytes } from '../../platform/system/health.ts';
import { requireAdmin } from '../identity/middleware.ts';

export interface OpsDeps {
  sql: Sql;
  metrics: MetricsRegistry;
  storageRoot: string;
  backupDir: string;
  minFreeBytes: number;
  metricsToken: string | null;
  freeBytes?: FreeBytes;
}

const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

async function jobCounts(sql: Sql): Promise<Record<string, number>> {
  const rows = await sql<{ status: string; count: string }[]>`SELECT status, count(*)::text AS count FROM media_jobs GROUP BY status`;
  const counts: Record<string, number> = { queued: 0, running: 0, succeeded: 0, failed: 0, canceled: 0 };
  for (const row of rows) counts[row.status] = Number(row.count);
  return counts;
}

export function opsRoutes(deps: OpsDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const freeBytes = deps.freeBytes ?? freeBytesOf;

  routes.get('/ready', async c => {
    const readiness = await checkReadiness({ sql: deps.sql, storageRoot: deps.storageRoot, minFreeBytes: deps.minFreeBytes, freeBytes });
    return c.json({ status: readiness.ok ? 'ready' : 'not_ready', checks: readiness.checks }, readiness.ok ? 200 : 503);
  });

  routes.get('/metrics', async c => {
    if (!deps.metricsToken) throw errors.notFound(); // fonction désactivée tant qu'aucun jeton n'est configuré
    const bearer = /^Bearer (.+)$/.exec(c.req.header('authorization') ?? '')?.[1];
    if (!bearer || !safeEqual(bearer, deps.metricsToken)) throw errors.unauthorized();

    const [jobs, free, backup] = await Promise.all([jobCounts(deps.sql), freeBytes(deps.storageRoot).catch(() => 0), latestBackup(deps.backupDir)]);
    const text = deps.metrics.render({
      origin_media_jobs: Object.entries(jobs).map(([status, value]) => ({ help: 'Tâches d\'encodage par statut.', value, labels: { status } })),
      origin_disk_free_bytes: free,
      origin_backup_age_seconds: backup ? Math.round((Date.now() - backup.createdAt.getTime()) / 1000) : -1,
    });
    return c.body(text, 200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Cache-Control': 'no-store' });
  });

  routes.get('/api/admin/system', async c => {
    requireAdmin(c);
    const [readiness, jobs, backup, users, migrations, running] = await Promise.all([
      checkReadiness({ sql: deps.sql, storageRoot: deps.storageRoot, minFreeBytes: deps.minFreeBytes, freeBytes }),
      jobCounts(deps.sql),
      latestBackup(deps.backupDir),
      deps.sql<{ count: string }[]>`SELECT count(*)::text AS count FROM users`,
      deps.sql<{ count: string }[]>`SELECT count(*)::text AS count FROM schema_migrations`,
      deps.sql<{ playback_id: string; progress: string; step: string | null }[]>`SELECT playback_id, progress, step FROM media_jobs WHERE status = 'running'`,
    ]);
    return c.json({
      ready: readiness.ok,
      checks: readiness.checks,
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      jobs,
      runningJobs: running.map(job => ({ playbackId: job.playback_id, progress: Number(job.progress), step: job.step })),
      users: Number(users[0]?.count ?? 0),
      migrationsApplied: Number(migrations[0]?.count ?? 0),
      lastBackup: backup ? { name: backup.name, createdAt: backup.createdAt.toISOString(), ageHours: Math.round((Date.now() - backup.createdAt.getTime()) / 36e5) } : null,
    });
  });

  return routes;
}
