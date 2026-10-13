/**
 * Point d'entrée : lit la configuration, se connecte à la base, applique les migrations,
 * démarre le serveur HTTP et gère l'arrêt propre. Aucune règle métier ici.
 */
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { ConfigError, loadConfig } from './config/env.ts';
import { connect } from './platform/database/client.ts';
import { migrate } from './platform/database/migrate.ts';
import { createLogger } from './platform/logger.ts';
import { createLogMailer } from './platform/mail.ts';
import { StorageLayout } from './platform/storage/layout.ts';
import { createIdentityService } from './modules/identity/service.ts';
import { createBunnySigner, createOriginSigner } from './modules/playback/delivery.ts';

// 1. Configuration : refus net si elle est invalide.
let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
}

const logger = createLogger({ level: config.logLevel, pretty: !config.isProduction });
if (config.mediaSecretIsEphemeral) {
  logger.warn('MEDIA_SECRET absent : secret temporaire généré, les URLs de lecture expirent au redémarrage.');
}

// 2. Base de données et migrations.
const sql = connect(config.databaseUrl);
try {
  const applied = await migrate(sql);
  if (applied.length > 0) logger.info({ applied }, 'migrations appliquées');
} catch (error) {
  logger.fatal({ err: error }, 'base de données injoignable : lancez « npm run db:start »');
  process.exit(1);
}

// 3. Application et serveur.
const storage = new StorageLayout(config.storageRoot);
const identity = createIdentityService({
  sql,
  logger,
  mailer: createLogMailer(logger),
  config: {
    registrationMode: config.identity.registrationMode,
    sessionTtlSeconds: config.identity.sessionTtlSeconds,
    publicAppUrl: config.identity.publicAppUrl,
  },
});
const deliverySigner =
  config.delivery.mode === 'bunny' && config.delivery.cdnUrl && config.delivery.tokenKey
    ? createBunnySigner({ cdnUrl: config.delivery.cdnUrl, tokenKey: config.delivery.tokenKey, ttlSeconds: config.mediaTtlSeconds })
    : createOriginSigner({ secret: config.mediaSecrets[0], ttlSeconds: config.mediaTtlSeconds });
logger.info({ mode: config.delivery.mode }, 'mode de diffusion');
const app = createApp({
  deliverySigner,
  identity,
  cookieSecure: config.identity.cookieSecure,
  sessionTtlSeconds: config.identity.sessionTtlSeconds,
  playbackRequiresLogin: config.identity.playbackRequiresLogin,
  ops: { backupDir: config.ops.backupDir, minFreeBytes: config.ops.minFreeBytes, metricsToken: config.ops.metricsToken },
  uploadMaxBytes: config.media.uploadMaxBytes,
  encodePreset: config.media.encodePreset,
  sql,
  logger,
  storage,
  mediaSecrets: config.mediaSecrets,
  mediaTtlSeconds: config.mediaTtlSeconds,
  corsOrigins: config.corsOrigins,
  trustProxy: config.trustProxy,
  rateLimits: config.rateLimits,
});

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, info => {
  logger.info({ port: info.port, hlsRoot: storage.hlsRoot }, 'API ORIGIN démarrée');
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logger.warn({ port: config.port }, 'port déjà utilisé : l’API tourne probablement déjà');
    process.exit(0);
  }
  throw error;
});

// Entretien : retire les sessions expirées une fois par heure.
const purgeTimer = setInterval(() => {
  identity.purgeSessions().then(count => count > 0 && logger.info({ count }, 'sessions expirées supprimées'), error => logger.error({ err: error }, 'purge des sessions impossible'));
}, 60 * 60 * 1000);
purgeTimer.unref();

// 4. Arrêt propre : on finit les requêtes en cours, puis on ferme la base.
let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'arrêt demandé');
  const forced = setTimeout(() => process.exit(1), 10_000);
  forced.unref();
  server.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', reason => {
  logger.fatal({ err: reason }, 'promesse rejetée non gérée');
  process.exit(1);
});
