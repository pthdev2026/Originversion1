/** Module « ingest » — suivi des tâches d'encodage (administrateur uniquement). */
import { Hono } from 'hono';
import type { Sql } from '../../platform/database/client.ts';
import { AppError, errors } from '../../platform/errors.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { isValidId } from '../../platform/storage/layout.ts';
import { requireAdmin } from '../identity/middleware.ts';
import { cancelJob, getJob, listJobs, retryJob, type MediaJob } from './jobs.repository.ts';

const present = (job: MediaJob) => ({
  id: job.id,
  playbackId: job.playbackId,
  programSlug: job.programSlug,
  title: job.title,
  status: job.status,
  step: job.step,
  progress: job.progress,
  attempts: job.attempts,
  maxAttempts: job.maxAttempts,
  lastError: job.lastError,
  createdAt: job.createdAt.toISOString(),
  startedAt: job.startedAt?.toISOString() ?? null,
  finishedAt: job.finishedAt?.toISOString() ?? null,
});

export function jobRoutes(deps: { sql: Sql }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const idOf = (raw: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(raw) && !isValidId(raw)) throw errors.badRequest('Identifiant invalide.');
    return raw;
  };

  routes.get('/api/admin/jobs', async c => {
    requireAdmin(c);
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 30) || 30, 1), 100);
    // Filtres facultatifs : `?playbackId=` (un contenu) ou `?program=` (un programme entier). Combinables.
    const playbackId = c.req.query('playbackId');
    const program = c.req.query('program');
    if ((playbackId !== undefined && !isValidId(playbackId)) || (program !== undefined && !isValidId(program))) {
      throw errors.badRequest('Filtre invalide (minuscules, chiffres et tirets).');
    }
    return c.json({
      jobs: (await listJobs(deps.sql, limit, { ...(playbackId ? { playbackId } : {}), ...(program ? { programSlug: program } : {}) })).map(present),
    });
  });

  routes.get('/api/admin/jobs/:id', async c => {
    requireAdmin(c);
    const job = await getJob(deps.sql, idOf(c.req.param('id')));
    if (!job) throw errors.notFound('Tâche introuvable.');
    return c.json(present(job));
  });

  routes.post('/api/admin/jobs/:id/cancel', async c => {
    requireAdmin(c);
    if (!(await cancelJob(deps.sql, idOf(c.req.param('id'))))) throw new AppError('conflict', 409, 'Cette tâche ne peut pas être annulée.');
    return c.body(null, 204);
  });

  routes.post('/api/admin/jobs/:id/retry', async c => {
    requireAdmin(c);
    if (!(await retryJob(deps.sql, idOf(c.req.param('id'))))) throw new AppError('conflict', 409, 'Seule une tâche échouée ou annulée peut être relancée.');
    return c.body(null, 204);
  });

  return routes;
}
