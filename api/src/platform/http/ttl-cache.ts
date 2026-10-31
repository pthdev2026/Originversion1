/**
 * Petit cache en mémoire avec durée de vie, borné, qui REGROUPE les chargements simultanés.
 *
 * Pourquoi : le catalogue public est identique pour tous les visiteurs. Sans cache, 1 000 personnes qui ouvrent l'accueil
 * provoquent 1 000 lectures de la base ; avec lui, une seule toutes les N secondes (« ruée » évitée : les requêtes qui
 * arrivent pendant un chargement attendent le MÊME résultat).
 *
 * Limites assumées : cache propre à CE processus (chaque instance a le sien) ; une erreur de chargement n'est jamais
 * mémorisée ; `ttlMs = 0` désactive tout (utile en test).
 */
export interface TtlCache<T> {
  /** `cacheIf` : une valeur refusée (ex. « introuvable ») est rendue mais jamais mémorisée, pour qu'on ne puisse pas remplir le cache d'inconnus. */
  getOrLoad(key: string, loader: () => Promise<T>, cacheIf?: (value: T) => boolean): Promise<T>;
  /** Lecture / écriture directes (zone des « introuvables »). */
  has(key: string): boolean;
  set(key: string, value: T): void;
  clear(): void;
  readonly size: number;
}

export function createTtlCache<T>(options: { ttlMs: number; maxEntries?: number; now?: () => number }): TtlCache<T> {
  const { ttlMs } = options;
  const maxEntries = options.maxEntries ?? 1000;
  const now = options.now ?? Date.now;
  const done = new Map<string, { at: number; value: T }>();
  const pending = new Map<string, Promise<T>>();

  return {
    async getOrLoad(key, loader, cacheIf) {
      if (ttlMs <= 0) return loader();
      const hit = done.get(key);
      if (hit && now() - hit.at < ttlMs) return hit.value;
      const inFlight = pending.get(key);
      if (inFlight) return inFlight;

      const promise = loader().then(
        value => {
          if (cacheIf && !cacheIf(value)) return value;
          if (done.size >= maxEntries) done.delete(done.keys().next().value as string); // la plus ancienne sort
          done.set(key, { at: now(), value });
          return value;
        },
      ).finally(() => pending.delete(key));
      pending.set(key, promise);
      return promise;
    },
    has(key) {
      const hit = done.get(key);
      return ttlMs > 0 && hit !== undefined && now() - hit.at < ttlMs;
    },
    set(key, value) {
      if (ttlMs <= 0) return;
      if (!done.has(key) && done.size >= maxEntries) done.delete(done.keys().next().value as string);
      done.set(key, { at: now(), value });
    },
    clear() {
      done.clear();
    },
    get size() {
      return done.size;
    },
  };
}
