/**
 * Configuration de l'application.
 *
 * Principe : on lit les variables d'environnement UNE SEULE FOIS, ici, on les valide,
 * et le reste du code reçoit un objet typé. Aucun autre fichier ne lit `process.env`.
 * Si la configuration est invalide, le démarrage est refusé avec un message clair :
 * mieux vaut échouer au lancement que découvrir une erreur en pleine lecture.
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Racine du dépôt (le dossier qui contient api/, app/, storage/, docs/). */
const PROJECT_ROOT = path.resolve(here, '..', '..', '..');

/** Valeur de développement uniquement : l'instance locale n'écoute que sur 127.0.0.1. */
export const DEV_DATABASE_URL = 'postgres://origin:origin_dev@127.0.0.1:5433/origin';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1).optional(),
  /** Racine du stockage : vidéos, images, sous-titres. Voir platform/storage/layout.ts. */
  STORAGE_ROOT: z.string().min(1).optional(),
  /** Secret de signature des URLs de lecture. Obligatoire en production (32 caractères minimum). */
  MEDIA_SECRET: z.string().min(32, 'MEDIA_SECRET doit faire au moins 32 caractères').optional(),
  /** Ancien secret, accepté en vérification pendant une rotation (changer MEDIA_SECRET sans couper les lectures en cours). */
  MEDIA_SECRET_PREVIOUS: z.string().min(32, 'MEDIA_SECRET_PREVIOUS doit faire au moins 32 caractères').optional(),
  /** À « true » UNIQUEMENT derrière un proxy de confiance (Caddy, CDN) : l'IP client est lue dans X-Forwarded-For. */
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  /** Requêtes autorisées par minute et par adresse IP : API (/api/*) et fichiers de lecture (/media/*). */
  RATE_LIMIT_API_PER_MIN: z.coerce.number().int().min(1).max(100_000).default(120),
  RATE_LIMIT_MEDIA_PER_MIN: z.coerce.number().int().min(1).max(1_000_000).default(3000),
  /** Inscription : `open` (ouverte à tous) ou `invite` (code d'invitation obligatoire). */
  REGISTRATION_MODE: z.enum(['open', 'invite']).default('open'),
  /** Clé de chiffrement des secrets de double authentification (32 caractères minimum). Obligatoire en production pour l'activer. */
  AUTH_ENCRYPTION_KEY: z.string().min(32, 'AUTH_ENCRYPTION_KEY doit faire au moins 32 caractères').optional(),
  /** À « true » : un administrateur sans double authentification ne peut utiliser aucune route d'administration. */
  REQUIRE_ADMIN_2FA: z.enum(['true', 'false']).default('false'),
  /** Durée d'une session de connexion, en jours. */
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** À « true » : la lecture exige un compte connecté. Par défaut, la lecture reste ouverte. */
  PLAYBACK_REQUIRES_LOGIN: z.enum(['true', 'false']).default('false'),
  /** Adresse publique du site : sert à construire le lien de réinitialisation du mot de passe. */
  PUBLIC_APP_URL: z.string().url().default('http://localhost:3210'),
  /** Tentatives de connexion / inscription par minute et par adresse IP. */
  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().min(1).max(10_000).default(10),
  /** Rapports de mesure de lecture par minute et par adresse IP (un lecteur en envoie ~4 par minute). */
  RATE_LIMIT_METRICS_PER_MIN: z.coerce.number().int().min(1).max(100_000).default(120),
  /** Chemin des outils d'encodage (par défaut : `ffmpeg` et `ffprobe` du PATH). */
  FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
  FFPROBE_PATH: z.string().min(1).default('ffprobe'),
  /** Préréglage x264 : `slow` (meilleure qualité par Mo) … `ultrafast` (tests). */
  ENCODE_PRESET: z.enum(['ultrafast', 'veryfast', 'fast', 'medium', 'slow', 'slower']).default('medium'),
  /** Taille maximale d'un envoi, en octets (défaut : 60 Go). */
  UPLOAD_MAX_BYTES: z.coerce.number().int().min(1).default(60 * 1024 ** 3),
  /** Diffusion : `origin` (l'API sert les fichiers) ou `bunny` (CDN Bunny : stockage + jetons). */
  DELIVERY_MODE: z.enum(['origin', 'bunny']).default('origin'),
  /** Bunny — API : adresse du CDN (Pull Zone) et clé d'authentification par jeton. */
  BUNNY_CDN_URL: z.string().url().optional(),
  BUNNY_TOKEN_KEY: z.string().min(8).optional(),
  /** Bunny — travailleur : zone de stockage, clé d'accès et hôte régional (Europe : storage.bunnycdn.com). */
  BUNNY_STORAGE_ZONE: z.string().min(1).optional(),
  BUNNY_STORAGE_KEY: z.string().min(8).optional(),
  BUNNY_STORAGE_HOST: z.string().min(1).default('storage.bunnycdn.com'),
  /** E-mails : `log` (écrit dans les journaux) ou `resend` (envoi réel). */
  MAIL_PROVIDER: z.enum(['log', 'resend']).default('log'),
  MAIL_API_KEY: z.string().min(8).optional(),
  /** Expéditeur, ex. « ORIGIN <no-reply@origin.example> ». */
  MAIL_FROM: z.string().min(3).optional(),
  /** Exploitation : dossier des sauvegardes (idéalement un AUTRE disque), phrase secrète de chiffrement, seuil d'espace disque. */
  BACKUP_DIR: z.string().min(1).optional(),
  BACKUP_PASSPHRASE: z.string().min(16, 'BACKUP_PASSPHRASE doit faire au moins 16 caractères').optional(),
  MIN_FREE_GB: z.coerce.number().min(0).max(100_000).default(20),
  /** Jeton (Bearer) donnant accès à /metrics pour la supervision. Absent : /metrics est désactivé. */
  METRICS_TOKEN: z.string().min(24, 'METRICS_TOKEN doit faire au moins 24 caractères').optional(),
  /** Adresse d'un webhook (Slack, Discord, ntfy…) où le « chien de garde » envoie les alertes. */
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  /** Ident de marque : quand l'afficher (`title` = une fois par titre, `season` = une fois par saison, `always`, `off`). */
  IDENT_POLICY: z.enum(['title', 'season', 'always', 'off']).default('title'),
  /** Identifiant de lecture du média de l'ident (publié avec `--kind brand`). */
  BRAND_IDENT_PLAYBACK_ID: z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/).default('origin-ident'),
  /** Après combien de secondes le spectateur peut passer l'ident. */
  IDENT_SKIPPABLE_AFTER_SECONDS: z.coerce.number().min(0).max(30).default(2),
  /** Durée de validité d'une URL de lecture, en secondes (1 minute à 24 h). */
  MEDIA_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(4 * 60 * 60),
  /** Origines autorisées pour le navigateur, séparées par des virgules. Vide = localhost uniquement. */
  CORS_ORIGINS: z.string().optional(),
});

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  host: string;
  logLevel: string;
  databaseUrl: string;
  storageRoot: string;
  /** Secrets de signature : le premier signe, tous servent à vérifier (rotation). */
  mediaSecrets: [string, ...string[]];
  /** Vrai si le secret a été généré au lancement (développement) : les jetons expirent au redémarrage. */
  mediaSecretIsEphemeral: boolean;
  mediaTtlSeconds: number;
  corsOrigins: string[] | undefined;
  trustProxy: boolean;
  rateLimits: { apiPerMinute: number; mediaPerMinute: number; authPerMinute: number; metricsPerMinute: number };
  media: { ffmpegPath: string; ffprobePath: string; encodePreset: string; uploadMaxBytes: number };
  ident: { policy: 'title' | 'season' | 'always' | 'off'; playbackId: string; skippableAfterSeconds: number };
  mail: { provider: 'log' | 'resend'; apiKey: string | null; from: string | null };
  ops: {
    backupDir: string;
    backupPassphrase: string | null;
    minFreeBytes: number;
    metricsToken: string | null;
    alertWebhookUrl: string | null;
  };
  delivery: {
    mode: 'origin' | 'bunny';
    cdnUrl: string | null;
    tokenKey: string | null;
    storageZone: string | null;
    storageKey: string | null;
    storageHost: string;
  };
  identity: {
    registrationMode: 'open' | 'invite';
    sessionTtlSeconds: number;
    playbackRequiresLogin: boolean;
    publicAppUrl: string;
    cookieSecure: boolean;
    /** `undefined` : clé de développement ; `null` : double authentification indisponible (production sans clé). */
    encryptionKey: string | null | undefined;
    requireAdminTwoFactor: boolean;
  };
}

export class ConfigError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Configuration invalide :\n - ${problems.join('\n - ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map(issue => `${issue.path.join('.') || 'configuration'} : ${issue.message}`));
  }
  const raw = parsed.data;
  const isProduction = raw.NODE_ENV === 'production';

  // En production, rien n'est deviné : tout doit être fourni explicitement.
  const missing: string[] = [];
  if (isProduction && !raw.DATABASE_URL) missing.push('DATABASE_URL est obligatoire en production');
  if (isProduction && !raw.MEDIA_SECRET) missing.push('MEDIA_SECRET est obligatoire en production');
  if (isProduction && !raw.CORS_ORIGINS) missing.push('CORS_ORIGINS est obligatoire en production');
  if (raw.DELIVERY_MODE === 'bunny' && !raw.BUNNY_CDN_URL) missing.push('BUNNY_CDN_URL est obligatoire quand DELIVERY_MODE=bunny');
  if (raw.DELIVERY_MODE === 'bunny' && !raw.BUNNY_TOKEN_KEY) missing.push('BUNNY_TOKEN_KEY est obligatoire quand DELIVERY_MODE=bunny');
  if (raw.REQUIRE_ADMIN_2FA === 'true' && !raw.AUTH_ENCRYPTION_KEY && isProduction) missing.push('AUTH_ENCRYPTION_KEY est obligatoire quand REQUIRE_ADMIN_2FA=true');
  if (raw.MAIL_PROVIDER === 'resend' && !raw.MAIL_API_KEY) missing.push('MAIL_API_KEY est obligatoire quand MAIL_PROVIDER=resend');
  if (raw.MAIL_PROVIDER === 'resend' && !raw.MAIL_FROM) missing.push('MAIL_FROM est obligatoire quand MAIL_PROVIDER=resend');
  if (missing.length > 0) throw new ConfigError(missing);

  const corsOrigins = raw.CORS_ORIGINS?.split(',').map(origin => origin.trim()).filter(Boolean);

  return {
    env: raw.NODE_ENV,
    isProduction,
    port: raw.PORT,
    host: raw.HOST,
    logLevel: raw.LOG_LEVEL,
    databaseUrl: raw.DATABASE_URL ?? DEV_DATABASE_URL,
    storageRoot: path.resolve(raw.STORAGE_ROOT ?? path.join(PROJECT_ROOT, 'storage')),
    mediaSecrets: [raw.MEDIA_SECRET ?? randomBytes(32).toString('hex'), ...(raw.MEDIA_SECRET_PREVIOUS ? [raw.MEDIA_SECRET_PREVIOUS] : [])],
    mediaSecretIsEphemeral: raw.MEDIA_SECRET === undefined,
    mediaTtlSeconds: raw.MEDIA_TTL_SECONDS,
    corsOrigins: corsOrigins && corsOrigins.length > 0 ? corsOrigins : undefined,
    trustProxy: raw.TRUST_PROXY === 'true',
    rateLimits: {
      apiPerMinute: raw.RATE_LIMIT_API_PER_MIN,
      mediaPerMinute: raw.RATE_LIMIT_MEDIA_PER_MIN,
      authPerMinute: raw.RATE_LIMIT_AUTH_PER_MIN,
      metricsPerMinute: raw.RATE_LIMIT_METRICS_PER_MIN,
    },
    media: {
      ffmpegPath: raw.FFMPEG_PATH,
      ffprobePath: raw.FFPROBE_PATH,
      encodePreset: raw.ENCODE_PRESET,
      uploadMaxBytes: raw.UPLOAD_MAX_BYTES,
    },
    mail: { provider: raw.MAIL_PROVIDER, apiKey: raw.MAIL_API_KEY ?? null, from: raw.MAIL_FROM ?? null },
    ident: { policy: raw.IDENT_POLICY, playbackId: raw.BRAND_IDENT_PLAYBACK_ID, skippableAfterSeconds: raw.IDENT_SKIPPABLE_AFTER_SECONDS },
    ops: {
      backupDir: path.resolve(raw.BACKUP_DIR ?? path.join(PROJECT_ROOT, 'backups')),
      backupPassphrase: raw.BACKUP_PASSPHRASE ?? null,
      minFreeBytes: Math.round(raw.MIN_FREE_GB * 1024 ** 3),
      metricsToken: raw.METRICS_TOKEN ?? null,
      alertWebhookUrl: raw.ALERT_WEBHOOK_URL ?? null,
    },
    delivery: {
      mode: raw.DELIVERY_MODE,
      cdnUrl: raw.BUNNY_CDN_URL?.replace(/\/$/, '') ?? null,
      tokenKey: raw.BUNNY_TOKEN_KEY ?? null,
      storageZone: raw.BUNNY_STORAGE_ZONE ?? null,
      storageKey: raw.BUNNY_STORAGE_KEY ?? null,
      storageHost: raw.BUNNY_STORAGE_HOST,
    },
    identity: {
      registrationMode: raw.REGISTRATION_MODE,
      sessionTtlSeconds: raw.SESSION_TTL_DAYS * 86_400,
      playbackRequiresLogin: raw.PLAYBACK_REQUIRES_LOGIN === 'true',
      publicAppUrl: raw.PUBLIC_APP_URL.replace(/\/$/, ''),
      cookieSecure: isProduction,
      encryptionKey: raw.AUTH_ENCRYPTION_KEY ?? (isProduction ? null : undefined),
      requireAdminTwoFactor: raw.REQUIRE_ADMIN_2FA === 'true',
    },
  };
}
