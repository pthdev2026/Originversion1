/**
 * Middlewares HTTP transverses : identifiant de requête, journal d'accès, CORS, en-têtes de sécurité.
 *
 * Un middleware est une fonction qui s'exécute AVANT et APRÈS chaque route.
 * L'ordre d'enregistrement compte : voir `createApp`.
 */
import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { errors } from '../errors.ts';
import type { Logger } from '../logger.ts';

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Donne un identifiant unique à chaque requête (en-tête `X-Request-Id`), repris dans les journaux. */
export const withRequestId: MiddlewareHandler = requestId();

/** En-têtes de sécurité raisonnables pour une API (pas de page HTML servie ici). */
export const withSecurityHeaders: MiddlewareHandler = secureHeaders({
  crossOriginResourcePolicy: 'cross-origin', // le front et la vidéo sont sur d'autres origines
  referrerPolicy: 'no-referrer',
});

export function withCors(allowedOrigins: string[] | undefined): MiddlewareHandler {
  return cors({
    origin: origin => (allowedOrigins ? (allowedOrigins.includes(origin) ? origin : null) : LOCAL_ORIGIN.test(origin) ? origin : null),
    allowHeaders: ['Range', 'Content-Type', 'Tus-Resumable', 'Upload-Length', 'Upload-Offset', 'Upload-Metadata'],
    credentials: true, // le navigateur peut joindre le cookie de session (origines explicitement autorisées seulement)
    exposeHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'X-Request-Id', 'Upload-Offset', 'Upload-Length', 'Location', 'Tus-Resumable', 'Tus-Version'],
    maxAge: 600,
  });
}

/** Les URLs de lecture contiennent un jeton : on ne le journalise jamais. */
export function redactPath(pathname: string): string {
  return pathname.replace(/^\/media\/[^/]+\//, '/media/:jeton/');
}

/** Une ligne de journal par requête : méthode, chemin (sans secret), statut, durée. */
export function accessLog(logger: Logger): MiddlewareHandler {
  return async (c, next) => {
    const started = performance.now();
    await next();
    const status = c.res.status;
    const entry = {
      requestId: c.get('requestId'),
      method: c.req.method,
      path: redactPath(new URL(c.req.url).pathname),
      status,
      durationMs: Math.round(performance.now() - started),
    };
    if (status >= 500) logger.error(entry, 'requête');
    else if (status >= 400) logger.warn(entry, 'requête');
    else logger.info(entry, 'requête');
  };
}

/**
 * Les réponses de l'API contiennent des URLs signées ou des données de compte : elles ne doivent être mises en cache
 * par personne. Exception volontaire : une route qui a explicitement posé son propre `Cache-Control`
 * (le catalogue public, identique pour tous) le garde.
 */
export const noStore: MiddlewareHandler = async (c, next) => {
  await next();
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
};

/**
 * Coupe les requêtes API qui traînent : au-delà de `ms`, le client reçoit une erreur claire
 * plutôt que d'attendre indéfiniment (une base lente ne doit pas figer les spectateurs).
 * Non appliqué aux fichiers vidéo, dont le téléchargement peut légitimement durer.
 */
export function requestTimeout(ms: number): MiddlewareHandler {
  return async (c, next) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(errors.unavailable('Le service a mis trop de temps à répondre.')), ms);
    });
    try {
      await Promise.race([next(), expired]);
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Protection contre le CSRF (requête forgée depuis un autre site) pour les actions qui modifient des données.
 * Un navigateur envoie l'en-tête `Origin` sur ces requêtes : s'il n'est pas dans la liste autorisée, on refuse.
 * Sans en-tête `Origin` (script, curl), la requête ne peut pas utiliser le cookie d'un navigateur : on laisse passer.
 */
export function requireTrustedOrigin(allowedOrigins: string[] | undefined): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method;
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const origin = c.req.header('origin');
      const trusted = !origin || (allowedOrigins ? allowedOrigins.includes(origin) : LOCAL_ORIGIN.test(origin));
      if (!trusted) throw errors.forbidden('Origine non autorisée.');
    }
    await next();
  };
}
