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
import { createLogMailer, createResendMailer } from './platform/mail.ts';
import { StorageLayout } from './platform/storage/layout.ts';
import { runSchedule } from './modules/catalog/routes.ts';
import { listAdminEmails } from './modules/identity/repository.ts';
import { purgeExpired } from './modules/ops/maintenance.repository.ts';
import { createAccountService } from './modules/account/service.ts';
import { createIdentityService } from './modules/identity/service.ts';
import { createMuxClient } from './modules/mux/client.ts';
import { createMuxService, startMuxPoller } from './modules/mux/service.ts';
import { createMuxSigner } from './modules/mux/signer.ts';
import { createBunnySigner, createOriginSigner, createRoutingSigner } from './modules/playback/delivery.ts';

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
// Les migrations utilisent une connexion à part, SANS délai maximal (une migration peut légitimement durer).
const migrationSql = connect(config.databaseUrl, { max: 1 });
try {
  const applied = await migrate(migrationSql);
  if (applied.length > 0) logger.info({ applied }, 'migrations appliquées');
} catch (error) {
  logger.fatal({ err: error }, 'base de données injoignable ou migration en échec : lancez « npm run db:start » ou consultez l’erreur');
  process.exit(1);
} finally {
  await migrationSql.end({ timeout: 5 }).catch(() => undefined);
}

// Connexion de l'API : une requête SQL ne peut pas dépasser 15 s (une base lente ne doit pas figer les spectateurs),
// et une transaction oubliée ouverte est coupée au bout de 30 s (elle bloquerait les autres).
const sql = connect(config.databaseUrl, {
  connection: { statement_timeout: 15_000, idle_in_transaction_session_timeout: 30_000 },
});

// 3. Application et serveur.
const storage = new StorageLayout(config.storageRoot);
const mailer = config.mail.provider === 'resend' && config.mail.apiKey && config.mail.from
  ? createResendMailer({ apiKey: config.mail.apiKey, from: config.mail.from })
  : createLogMailer(logger, { includeBody: !config.isProduction });
if (config.isProduction && config.mail.provider === 'log') {
  logger.warn('MAIL_PROVIDER=log : aucun e-mail n’est envoyé (réinitialisation de mot de passe inutilisable).');
}
const account = createAccountService({ sql, logger, mailer, storage });
const identity = createIdentityService({
  afterAccountDeleted: info => account.afterAccountDeleted(info),
  sql,
  logger,
  mailer: mailer,
  config: {
    registrationMode: config.identity.registrationMode,
    sessionTtlSeconds: config.identity.sessionTtlSeconds,
    publicAppUrl: config.identity.publicAppUrl,
    encryptionKey: config.identity.encryptionKey,
  },
});
const deliverySigner =
  config.delivery.mode === 'bunny' && config.delivery.cdnUrl && config.delivery.tokenKey
    ? createBunnySigner({ cdnUrl: config.delivery.cdnUrl, tokenKey: config.delivery.tokenKey, ttlSeconds: config.mediaTtlSeconds })
    : createOriginSigner({ secret: config.mediaSecrets[0], ttlSeconds: config.mediaTtlSeconds });
logger.info({ mode: config.delivery.mode }, 'mode de diffusion');

// Mux (facultatif) : une vidéo Mux et une vidéo Bunny/origine cohabitent ; le signataire est choisi vidéo par vidéo.
let muxService: ReturnType<typeof createMuxService> | null = null;
let muxSigner = null;
if (config.mux) {
  try {
    muxSigner = createMuxSigner({ ttlSeconds: config.mediaTtlSeconds, signing: config.mux.signing });
  } catch (error) {
    logger.fatal({ err: error }, 'clé de signature Mux illisible : vérifiez MUX_SIGNING_PRIVATE_KEY (base64 du fichier PEM fourni par Mux)');
    process.exit(1);
  }
  muxService = createMuxService({
    sql,
    logger,
    client: createMuxClient({ tokenId: config.mux.tokenId, tokenSecret: config.mux.tokenSecret }),
    config: { playbackPolicy: config.mux.playbackPolicy, videoQuality: config.mux.videoQuality, normalizeAudio: config.mux.normalizeAudio },
  });
  startMuxPoller(muxService, logger);
  logger.info({ playbackPolicy: config.mux.playbackPolicy, videoQuality: config.mux.videoQuality }, 'Mux activé');
  if (config.isProduction && config.mux.playbackPolicy === 'public') {
    logger.warn('MUX_PLAYBACK_POLICY=public en production : les liens de lecture Mux ne sont pas protégés (utilisez « signed »).');
  }
}
if (config.demoPlaybackOverride) logger.warn({ medias: config.demoPlaybackOverride }, 'MODE DÉMO ACTIF : chaque « Regarder » lit un média fixe (DEMO_PLAYBACK_OVERRIDE) — temporaire, jamais en production');
const app = createApp({
  account,
  mailer,
  supportEmail: config.supportEmail,
  ident: config.ident,
  demoPlaybackOverride: config.demoPlaybackOverride,
  deliverySigner: createRoutingSigner({ self: deliverySigner, mux: muxSigner }),
  mux: { service: muxService, defaultProvider: config.videoProvider, playbackPolicy: config.mux?.playbackPolicy ?? 'public' },
  identity,
  cookieSecure: config.identity.cookieSecure,
  sessionTtlSeconds: config.identity.sessionTtlSeconds,
  playbackRequiresLogin: config.identity.playbackRequiresLogin,
  requireAdminTwoFactor: config.identity.requireAdminTwoFactor,
  catalogCacheTtlMs: config.catalogCacheSeconds * 1000,
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

// Entretien horaire : sessions expirées, jetons périmés, mesures et journal au-delà de leur durée de conservation.
const maintain = () => purgeExpired(sql, config.retention).then(
  report => Object.values(report).some(count => count > 0) && logger.info(report, 'entretien : données périmées supprimées'),
  error => logger.error({ err: error }, 'entretien impossible'),
);
setTimeout(() => void maintain(), 30_000).unref(); // un premier passage peu après le démarrage
const purgeTimer = setInterval(() => void maintain(), 60 * 60 * 1000);
purgeTimer.unref();

// Programmation éditoriale : toutes les 30 s, publie/retire les programmes dont la date prévue est arrivée.
// Sortie bloquée (médias non prêts) : trace dans le journal d'audit (faite par runSchedule) + e-mail aux administrateurs.
const alertBlockedRelease = async (item: { slug: string; title: string; missing: string[] }) => {
  logger.warn({ slug: item.slug, missing: item.missing }, 'sortie planifiée BLOQUÉE : médias non prêts');
  for (const to of await listAdminEmails(sql)) {
    void mailer.send({
      to, subject: `ORIGIN — sortie bloquée : ${item.title}`,
      text: `La sortie planifiée de « ${item.title} » (${item.slug}) a été bloquée : médias obligatoires non prêts (${item.missing.join(', ')}).\n\nElle ne sera PAS publiée automatiquement. Quand les médias sont prêts, validez la publication depuis le back-office, ou fixez une nouvelle date.`,
    }).catch(error => logger.error({ err: error }, 'alerte de sortie bloquée non envoyée'));
  }
};
const tickSchedule = () => runSchedule(sql, undefined, alertBlockedRelease).then(
  done => (done.released.length > 0 || done.expired.length > 0 || done.blocked.length > 0) && logger.info({ released: done.released, expired: done.expired, blocked: done.blocked.map(item => item.slug) }, 'programmation : sorties et retraits appliqués'),
  error => logger.error({ err: error }, 'programmation impossible'),
);
setTimeout(() => void tickSchedule(), 5_000).unref();
const scheduleTimer = setInterval(() => void tickSchedule(), 30_000);
scheduleTimer.unref();

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
process.on('uncaughtException', error => {
  logger.fatal({ err: error }, 'exception non interceptée');
  process.exit(1); // l'orchestrateur (Docker, restart: unless-stopped) relance un processus sain
});
process.on('unhandledRejection', reason => {
  logger.fatal({ err: reason }, 'promesse rejetée non gérée');
  process.exit(1);
});
