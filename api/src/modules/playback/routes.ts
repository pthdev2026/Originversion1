/** Module « playback » — routes HTTP (voir docs/API-CONTRACT.md). */
import { Hono } from 'hono';
import type { Sql } from '../../platform/database/client.ts';
import { createPlaybackSession, type PlaybackServiceConfig } from './service.ts';

export function playbackRoutes(deps: { sql: Sql; config: PlaybackServiceConfig }): Hono {
  const routes = new Hono();

  // Informations de lecture d'un contenu. Pas de média prêt = 404 explicite (« not_available »),
  // jamais de faux contenu.
  routes.get('/api/programs/:id/playback', async c => {
    const origin = new URL(c.req.url).origin;
    const session = await createPlaybackSession(deps.sql, deps.config, c.req.param('id'), origin);
    return c.json(session);
  });

  return routes;
}
