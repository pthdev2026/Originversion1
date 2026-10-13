/**
 * Limitation de débit : au plus N requêtes par fenêtre de temps et par adresse IP.
 *
 * Pourquoi : un script (ou un bug) qui appelle l'API en boucle ne doit pas empêcher les vrais
 * spectateurs de regarder. On répond « 429 Trop de requêtes » avec l'en-tête `Retry-After`.
 *
 * Limite assumée : les compteurs sont gardés EN MÉMOIRE de cette instance. C'est suffisant tant
 * qu'il n'y a qu'une instance ; avec plusieurs instances il faudra un stockage partagé (Redis).
 * La mémoire est bornée (`maxKeys`) : un attaquant ne peut pas la saturer en variant les adresses.
 */
import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { errors } from '../errors.ts';

export interface RateLimitOptions {
  /** Taille de la fenêtre, en millisecondes. */
  windowMs: number;
  /** Nombre maximal de requêtes par fenêtre et par clé. */
  max: number;
  /** Clé de regroupement (par défaut : l'adresse IP). */
  keyOf: (c: Context) => string;
  /** Nombre maximal de clés suivies simultanément. */
  maxKeys?: number;
  /** Horloge injectable (tests). */
  now?: () => number;
}

interface Counter {
  count: number;
  resetAt: number;
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const { windowMs, max, keyOf } = options;
  const maxKeys = options.maxKeys ?? 10_000;
  const now = options.now ?? Date.now;
  const counters = new Map<string, Counter>();

  function evict(at: number): void {
    for (const [key, counter] of counters) {
      if (counter.resetAt <= at) counters.delete(key);
    }
    // Toujours trop de clés : on retire les plus anciennes (la Map conserve l'ordre d'insertion).
    for (const key of counters.keys()) {
      if (counters.size <= maxKeys * 0.9) break;
      counters.delete(key);
    }
  }

  return async (c, next) => {
    const at = now();
    const key = keyOf(c);
    let counter = counters.get(key);
    if (!counter || counter.resetAt <= at) {
      if (counters.size >= maxKeys) evict(at);
      counter = { count: 0, resetAt: at + windowMs };
      counters.set(key, counter);
    }
    counter.count += 1;

    const remaining = Math.max(0, max - counter.count);
    const resetSeconds = Math.ceil((counter.resetAt - at) / 1000);
    c.header('RateLimit-Limit', String(max));
    c.header('RateLimit-Remaining', String(remaining));
    c.header('RateLimit-Reset', String(resetSeconds));

    if (counter.count > max) {
      c.header('Retry-After', String(resetSeconds));
      throw errors.rateLimited();
    }
    await next();
  };
}

/**
 * Adresse IP du client.
 * Derrière un proxy de confiance (`trustProxy`), on lit le premier élément de `X-Forwarded-For`.
 * Sinon on ignore cet en-tête : n'importe quel client pourrait y écrire ce qu'il veut.
 */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? 'inconnue';
  } catch {
    return 'inconnue'; // hors serveur réseau (tests)
  }
}
