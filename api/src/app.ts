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
import type { AppEnv } from './platform/http/types.ts';
import { analyticsRoutes } from './modules/analytics/routes.ts';
import { jobRoutes } from './modules/ingest/jobs.routes.ts';
import { opsRoutes } from './modules/ops/routes.ts';
import { createMetrics } from './platform/http/metrics.ts';
import type { FreeBytes } from './platform/system/health.ts';
import { uploadRoutes } from './modules/ingest/uploads.routes.ts';
import { identityRoutes } from './modules/identity/routes.ts';
import { myListRoutes } from './modules/mylist/routes.ts';
import { progressRoutes } from './modules/progress/routes.ts';
import { loadSession } from './modules/identity/middleware.ts';
import type { IdentityService } from './modules/identity/service.ts';
import { createOriginSigner, type DeliverySigner } from './modules/playback/delivery.ts';
import { errors } from './platform/errors.ts';
import { accessLog, noStore, requestTimeout, requireTrustedOrigin, withCors, withRequestId, withSecurityHeaders } from './platform/http/middleware.ts';
import { clientIp, rateLimit } from './platform/http/rate-limit.ts';
import type { Sql } from './platform/database/client.ts';
import type { Logger } from './platform/logger.ts';
import type { StorageLayout } from './platform/storage/layout.ts';
import { catalogRoutes } from './modules/catalog/routes.ts';
import { healthRoutes } from './modules/health/routes.ts';
import { mediaRoutes } from './modules/media/routes.ts';
import { recommendationRoutes } from './modules/recommendation/routes.ts';
import { imageRoutes } from './modules/catalog/images.ts';
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
  rateLimits: { apiPerMinute: number; mediaPerMinute: number; authPerMinute: number; metricsPerMinute: number };
  identity: IdentityService;
  cookieSecure: boolean;
  sessionTtlSeconds: number;
  playbackRequiresLogin: boolean;
  uploadMaxBytes: number;
  encodePreset: string;
  /** Façon de signer les URLs de lecture. Par défaut : l'API sert elle-même les fichiers (mode « origin »). */
  deliverySigner?: DeliverySigner;
  /** Ident de marque avant les programmes. Par défaut : une fois par titre, média `origin-ident`. */
  ident?: { policy: 'title' | 'season' | 'always' | 'off'; playbackId: string; skippableAfterSeconds: number };
  /** Exploitation (valeurs par défaut sûres si absentes). */
  ops?: { backupDir: string; minFreeBytes: number; metricsToken: string | null; freeBytes?: FreeBytes };
}

export function createApp(deps: AppDependencies): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // L'ordre compte : l'identifiant de requête d'abord, pour que tout le reste puisse l'utiliser.
  app.use('*', withRequestId);
  const metrics = createMetrics();
  app.use('*', metrics.middleware);
  app.use('*', accessLog(deps.logger));
  app.use('*', withSecurityHeaders);
  app.use('*', withCors(deps.corsOrigins));

  // Protections par groupe de routes (voir docs/SECURITE-BACKEND.md).
  const minute = 60_000;
  const byIp = (c: Parameters<typeof clientIp>[0]) => clientIp(c, deps.trustProxy);
  app.use('/api/*', rateLimit({ windowMs: minute, max: deps.rateLimits.apiPerMinute, keyOf: c => `api:${byIp(c)}` }));
  app.use('/api/*', requireTrustedOrigin(deps.corsOrigins));
  app.use('/api/*', loadSession({ identity: deps.identity, cookieSecure: deps.cookieSecure }));
  app.use('/api/playback-sessions', rateLimit({ windowMs: minute, max: deps.rateLimits.metricsPerMinute, keyOf: c => `metrics:${byIp(c)}` }));
  app.use('/api/*', bodyLimit({ maxSize: 64 * 1024, onError: () => { throw errors.tooLarge(); } }));
  app.use('/api/*', requestTimeout(10_000));
  app.use('/api/*', noStore);
  // Envois de fichiers : pas de limite de taille de corps ni de délai de 10 s (un envoi peut durer),
  // mais réservés aux administrateurs et soumis à la même protection d'origine et de session.
  app.use('/uploads/*', requireTrustedOrigin(deps.corsOrigins));
  app.use('/uploads/*', loadSession({ identity: deps.identity, cookieSecure: deps.cookieSecure }));
  app.use('/uploads/*', rateLimit({ windowMs: minute, max: 600, keyOf: c => `uploads:${byIp(c)}` }));
  app.use('/images/*', rateLimit({ windowMs: minute, max: deps.rateLimits.mediaPerMinute, keyOf: c => `images:${byIp(c)}` }));
  app.use('/media/*', rateLimit({ windowMs: minute, max: deps.rateLimits.mediaPerMinute, keyOf: c => `media:${byIp(c)}` }));

  // Modules fonctionnels. Recommandations : voir modules/recommendation/README.md.
  app.route('/', healthRoutes({ sql: deps.sql }));
  app.route('/', catalogRoutes({ sql: deps.sql }));
  app.route('/', playbackRoutes({
    sql: deps.sql,
    signer: deps.deliverySigner ?? createOriginSigner({ secret: deps.mediaSecrets[0], ttlSeconds: deps.mediaTtlSeconds }),
    requireLogin: deps.playbackRequiresLogin,
    ident: deps.ident ?? { policy: 'title', playbackId: 'origin-ident', skippableAfterSeconds: 2 },
  }));
  app.route('/', identityRoutes({
    identity: deps.identity,
    cookieSecure: deps.cookieSecure,
    sessionTtlSeconds: deps.sessionTtlSeconds,
    authPerMinute: deps.rateLimits.authPerMinute,
    clientKey: byIp,
  }));
  app.route('/', recommendationRoutes({ sql: deps.sql }));
  app.route('/', progressRoutes({ sql: deps.sql }));
  app.route('/', myListRoutes({ sql: deps.sql }));
  app.route('/', analyticsRoutes({ sql: deps.sql }));
  app.route('/', opsRoutes({
    sql: deps.sql,
    metrics,
    storageRoot: deps.storage.root,
    backupDir: deps.ops?.backupDir ?? `${deps.storage.root}/backups`,
    minFreeBytes: deps.ops?.minFreeBytes ?? 0,
    metricsToken: deps.ops?.metricsToken ?? null,
    ...(deps.ops?.freeBytes ? { freeBytes: deps.ops.freeBytes } : {}),
  }));
  app.route('/', jobRoutes({ sql: deps.sql }));
  app.route('/', uploadRoutes({
    sql: deps.sql,
    layout: deps.storage,
    maxBytes: deps.uploadMaxBytes,
    preset: deps.encodePreset,
    minFreeBytes: deps.ops?.minFreeBytes ?? 0,
    ...(deps.ops?.freeBytes ? { freeBytes: deps.ops.freeBytes } : {}),
  }));
  app.route('/', imageRoutes({ storage: deps.storage }));
  app.route('/', mediaRoutes({ sql: deps.sql, storage: deps.storage, mediaSecrets: deps.mediaSecrets }));

  registerErrorHandlers(app, deps.logger);
  return app;
}
