/**
 * Composition de l'application (« composition root »).
 *
 * C'est ICI, et seulement ici, qu'on assemble les pièces : les middlewares puis les modules.
 * Chaque module reçoit ses dépendances (base de données, stockage, configuration) en paramètre ;
 * aucun module n'importe un autre module « de l'intérieur ». Résultat : on peut tester un module
 * seul, et ajouter un module = ajouter une ligne ci-dessous.
 *
 *   requête ─▶ middlewares (id, journal, sécurité, CORS) ─▶ module (routes ▶ service ▶ repository) ─▶ réponse
 */
import { Hono } from 'hono';
import { registerErrorHandlers } from './platform/http/error-handler.ts';
import { accessLog, withCors, withRequestId, withSecurityHeaders } from './platform/http/middleware.ts';
import type { Sql } from './platform/database/client.ts';
import type { Logger } from './platform/logger.ts';
import type { StorageLayout } from './platform/storage/layout.ts';
import { catalogRoutes } from './modules/catalog/routes.ts';
import { healthRoutes } from './modules/health/routes.ts';
import { mediaRoutes } from './modules/media/routes.ts';
import { playbackRoutes } from './modules/playback/routes.ts';

export interface AppDependencies {
  sql: Sql;
  logger: Logger;
  storage: StorageLayout;
  mediaSecret: string;
  mediaTtlSeconds: number;
  corsOrigins: string[] | undefined;
}

export function createApp(deps: AppDependencies): Hono {
  const app = new Hono();

  // L'ordre compte : l'identifiant de requête d'abord, pour que tout le reste puisse l'utiliser.
  app.use('*', withRequestId);
  app.use('*', accessLog(deps.logger));
  app.use('*', withSecurityHeaders);
  app.use('*', withCors(deps.corsOrigins));

  // Modules fonctionnels. Prévus plus tard : identity, recommendation, analytics (voir modules/*/README.md).
  app.route('/', healthRoutes({ sql: deps.sql }));
  app.route('/', catalogRoutes({ sql: deps.sql }));
  app.route('/', playbackRoutes({ sql: deps.sql, config: { mediaSecret: deps.mediaSecret, ttlSeconds: deps.mediaTtlSeconds } }));
  app.route('/', mediaRoutes({ sql: deps.sql, storage: deps.storage, mediaSecret: deps.mediaSecret }));

  registerErrorHandlers(app, deps.logger);
  return app;
}
