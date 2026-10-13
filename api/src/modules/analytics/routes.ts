/** Module « analytics » — routes HTTP (voir docs/API-CONTRACT.md). */
import { Hono } from 'hono';
import type { Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { isValidId } from '../../platform/storage/layout.ts';
import { requireAdmin } from '../identity/middleware.ts';
import { parseSessionReport, saveSessionReport, summarizePlayback } from './metrics.ts';

export function analyticsRoutes(deps: { sql: Sql }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // Rapport de session de lecture. Accessible sans compte (la mesure est anonyme).
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

  return routes;
}
