/** Module « progress » — routes HTTP (voir docs/API-CONTRACT.md). Toutes exigent un compte connecté. */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { isValidId } from '../../platform/storage/layout.ts';
import { requireUser } from '../identity/middleware.ts';
import { isHistoryEnabled } from '../account/repository.ts';
import { getCards } from '../catalog/content.ts';
import { clearHistory, deleteProgress, findProgress, listContinueWatching, listProgramProgress, type Progress } from './repository.ts';
import { saveProgress } from './service.ts';

const bodySchema = z.object({
  positionSeconds: z.number({ required_error: 'positionSeconds requis.' }).finite().min(0).max(86_400),
  durationSeconds: z.number().finite().positive().max(86_400).optional(),
  /** Horodatage du navigateur (ms) : sert à ignorer un envoi arrivé en retard. */
  sentAt: z.number().int().nonnegative().optional(),
});

const present = (progress: Progress) => ({
  playbackId: progress.playbackId,
  positionSeconds: progress.positionSeconds,
  durationSeconds: progress.durationSeconds,
  completed: progress.completed,
  updatedAt: progress.updatedAt.toISOString(),
});

function playbackIdOf(raw: string): string {
  if (!isValidId(raw)) throw errors.badRequest('Identifiant de lecture invalide.');
  return raw;
}

export function progressRoutes(deps: { sql: Sql }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.put('/api/me/progress/:playbackId', async c => {
    const user = requireUser(c);
    const playbackId = playbackIdOf(c.req.param('playbackId'));
    let raw: unknown;
    try { raw = await c.req.json(); } catch { throw errors.badRequest('Corps JSON invalide.'); }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw errors.badRequest(parsed.error.issues[0]?.message ?? 'Requête invalide.');

    const saved = await saveProgress(deps.sql, {
      userId: user.id,
      playbackId,
      positionSeconds: parsed.data.positionSeconds,
      reportedDurationSeconds: parsed.data.durationSeconds ?? null,
      clientTs: parsed.data.sentAt ?? Date.now(),
    }, await isHistoryEnabled(deps.sql, user.id)); // historique désactivé : calculé mais non enregistré
    return c.json(present(saved));
  });

  // Où reprendre ce contenu ? 404 = jamais commencé.
  routes.get('/api/me/progress/:playbackId', async c => {
    const user = requireUser(c);
    const progress = (await isHistoryEnabled(deps.sql, user.id)) ? await findProgress(deps.sql, user.id, playbackIdOf(c.req.param('playbackId'))) : null;
    if (!progress) throw errors.notFound('Aucune progression pour ce contenu.');
    return c.json(present(progress));
  });

  // Efface tout l'historique de visionnage du compte (bouton « Effacer l'historique »).
  routes.delete('/api/me/history', async c => {
    const cleared = await clearHistory(deps.sql, requireUser(c).id);
    return c.json({ cleared });
  });

  routes.delete('/api/me/progress/:playbackId', async c => {
    const user = requireUser(c);
    await deleteProgress(deps.sql, user.id, playbackIdOf(c.req.param('playbackId')));
    return c.body(null, 204);
  });

  // Progression de tous les épisodes d'un programme (état « Reprendre » / « Vu » d'une liste d'épisodes).
  // `?program=<slug>` est obligatoire : on ne renvoie jamais tout l'historique d'un coup.
  routes.get('/api/me/progress', async c => {
    const user = requireUser(c);
    const program = c.req.query('program');
    if (!program) throw errors.badRequest('Le paramètre « program » (identifiant du programme) est obligatoire.');
    if (!isValidId(program)) throw errors.badRequest('Identifiant de programme invalide.');
    const items = (await isHistoryEnabled(deps.sql, user.id)) ? await listProgramProgress(deps.sql, user.id, program) : [];
    return c.json({ items: items.map(present) });
  });

  routes.get('/api/me/continue-watching', async c => {
    const user = requireUser(c);
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 20) || 20, 1), 50);
    const items = (await isHistoryEnabled(deps.sql, user.id)) ? await listContinueWatching(deps.sql, user.id, limit) : [];
    // Fiche résumée du programme (visuel, titre, catégorie…) : l'écran n'a plus besoin d'un catalogue embarqué pour afficher la ligne.
    const cards = await getCards(deps.sql, [...new Set(items.flatMap(item => (item.programSlug ? [item.programSlug] : [])))]);
    return c.json({
      items: items.map(item => ({
        ...present(item),
        program: item.programSlug ? cards.get(item.programSlug) ?? null : null,
        programSlug: item.programSlug,
        episode: item.episode,
        title: item.title,
        kind: item.kind,
        progressRatio: item.durationSeconds ? Math.min(1, Math.round((item.positionSeconds / item.durationSeconds) * 1000) / 1000) : null,
      })),
    });
  });

  return routes;
}
