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
  identity: {
    registrationMode: 'open' | 'invite';
    sessionTtlSeconds: number;
    playbackRequiresLogin: boolean;
    publicAppUrl: string;
    cookieSecure: boolean;
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
    identity: {
      registrationMode: raw.REGISTRATION_MODE,
      sessionTtlSeconds: raw.SESSION_TTL_DAYS * 86_400,
      playbackRequiresLogin: raw.PLAYBACK_REQUIRES_LOGIN === 'true',
      publicAppUrl: raw.PUBLIC_APP_URL.replace(/\/$/, ''),
      cookieSecure: isProduction,
    },
  };
}
