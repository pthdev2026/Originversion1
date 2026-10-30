/** Module « analytics » — routes HTTP (voir docs/API-CONTRACT.md). */
import { Hono } from 'hono';
import type { Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { isValidId } from '../../platform/storage/layout.ts';
import { requireAdmin } from '../identity/middleware.ts';
import { maxWatchSeconds, verifySessionGrant } from './session-token.ts';
import { editorialDashboard, parseSessionReport, saveSessionReport, summarizePlayback } from './metrics.ts';

export function analyticsRoutes(deps: { sql: Sql; mediaSecrets: readonly string[] }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // Rapport de session de lecture. Accessible sans compte (la mesure est anonyme) mais autorisé par le jeton
  // délivré avec la lecture (`analytics.token`) : voir session-token.ts. Sans jeton valide, rien n'est enregistré.
  // Le corps est lu comme du texte puis analysé : le navigateur peut l'envoyer en `text/plain`
  // (requête « simple », sans pré-vérification CORS), ce qui convient à un envoi à la fermeture de la page.
  routes.post('/api/playback-sessions', async c => {
    let raw: unknown;
    try {
      raw = JSON.parse(await c.req.text());
    } catch {
      throw errors.badRequest('Corps JSON invalide.');
    }
    const report = parseSessionReport(raw);
    if (!report) throw errors.badRequest('Rapport de lecture invalide.');
    const grant = verifySessionGrant(deps.mediaSecrets, report.id, report.playbackId, (raw as Record<string, unknown>)['token']);
    if (!grant.ok) throw errors.forbidden('Session de lecture non autorisée.');
    // Données incohérentes : on ne peut pas avoir regardé plus longtemps que le temps écoulé.
    const limit = maxWatchSeconds(grant.elapsedSeconds);
    if (report.watchSeconds > limit) report.watchSeconds = limit;
    for (const [height, seconds] of Object.entries(report.levelSeconds)) report.levelSeconds[height] = Math.min(seconds, limit);
    await saveSessionReport(deps.sql, report);
    return c.body(null, 204);
  });

  // Synthèse de qualité d'expérience : réservée aux administrateurs.
  routes.get('/api/admin/metrics/playback', async c => {
    requireAdmin(c);
    const days = Math.min(Math.max(Number(c.req.query('days') ?? 7) || 7, 1), 90);
    const playbackId = c.req.query('playbackId') ?? null;
    if (playbackId !== null && !isValidId(playbackId)) throw errors.badRequest('Identifiant de lecture invalide.');
    return c.json(await summarizePlayback(deps.sql, days, playbackId));
  });

  // Tableau de bord éditorial : audience et achèvement par programme (agrégats, aucun identifiant de compte).
  routes.get('/api/admin/metrics/programs', async c => {
    requireAdmin(c);
    const days = Math.min(Math.max(Number(c.req.query('days') ?? 30) || 30, 1), 365);
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 50) || 50, 1), 200);
    return c.json(await editorialDashboard(deps.sql, days, limit));
  });

  return routes;
}
