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
import { bodyLimit } from 'hono/body-limit';
import { errors } from './platform/errors.ts';
import { accessLog, noStore, requestTimeout, withCors, withRequestId, withSecurityHeaders } from './platform/http/middleware.ts';
import { clientIp, rateLimit } from './platform/http/rate-limit.ts';
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
  /** Le premier secret signe ; tous servent à vérifier (rotation). */
  mediaSecrets: readonly [string, ...string[]];
  mediaTtlSeconds: number;
  corsOrigins: string[] | undefined;
  trustProxy: boolean;
  rateLimits: { apiPerMinute: number; mediaPerMinute: number };
}

export function createApp(deps: AppDependencies): Hono {
  const app = new Hono();

  // L'ordre compte : l'identifiant de requête d'abord, pour que tout le reste puisse l'utiliser.
  app.use('*', withRequestId);
  app.use('*', accessLog(deps.logger));
  app.use('*', withSecurityHeaders);
  app.use('*', withCors(deps.corsOrigins));

  // Protections par groupe de routes (voir docs/SECURITE-BACKEND.md).
  const minute = 60_000;
  const byIp = (c: Parameters<typeof clientIp>[0]) => clientIp(c, deps.trustProxy);
  app.use('/api/*', rateLimit({ windowMs: minute, max: deps.rateLimits.apiPerMinute, keyOf: c => `api:${byIp(c)}` }));
  app.use('/api/*', bodyLimit({ maxSize: 64 * 1024, onError: () => { throw errors.tooLarge(); } }));
  app.use('/api/*', requestTimeout(10_000));
  app.use('/api/*', noStore);
  app.use('/media/*', rateLimit({ windowMs: minute, max: deps.rateLimits.mediaPerMinute, keyOf: c => `media:${byIp(c)}` }));

  // Modules fonctionnels. Prévus plus tard : identity, recommendation, analytics (voir modules/*/README.md).
  app.route('/', healthRoutes({ sql: deps.sql }));
  app.route('/', catalogRoutes({ sql: deps.sql }));
  app.route('/', playbackRoutes({ sql: deps.sql, config: { mediaSecret: deps.mediaSecrets[0], ttlSeconds: deps.mediaTtlSeconds } }));
  app.route('/', mediaRoutes({ sql: deps.sql, storage: deps.storage, mediaSecrets: deps.mediaSecrets }));

  registerErrorHandlers(app, deps.logger);
  return app;
}
