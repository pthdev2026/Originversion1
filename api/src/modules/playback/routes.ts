/** Module « playback » — routes HTTP (voir docs/API-CONTRACT.md). */
import { Hono } from 'hono';
import type { Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import type { DeliverySigner } from './delivery.ts';
import { createPlaybackSession } from './service.ts';

export function playbackRoutes(deps: { sql: Sql; signer: DeliverySigner; requireLogin: boolean }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // Informations de lecture d'un contenu. Pas de média prêt = 404 explicite (« not_available »),
  // jamais de faux contenu.
  routes.get('/api/programs/:id/playback', async c => {
    // Accès : ouvert tant que PLAYBACK_REQUIRES_LOGIN est faux ; sinon un compte connecté est exigé.
    if (deps.requireLogin && !c.get('user')) throw errors.unauthorized('Connectez-vous pour regarder ce programme.');
    const origin = new URL(c.req.url).origin;
    const session = await createPlaybackSession(deps.sql, deps.signer, c.req.param('id'), origin);
    return c.json(session);
  });

  return routes;
}
