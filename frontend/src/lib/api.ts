// Client HTTP de l'API ORIGIN : cookies de session (`credentials: 'include'`), JSON, erreurs typées.
// L'identité de l'utilisateur vient UNIQUEMENT du cookie httpOnly posé par le serveur : ce module ne lit ni n'écrit jamais de jeton.
import { env } from '@/lib/env';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly requestId?: string, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = 'ApiError';
  }
  get isNetwork() { return this.status === 0; }
  get isUnauthorized() { return this.status === 401; }
  /** 429 : trop de demandes, le serveur indique dans `Retry-After` combien de secondes attendre. */
  get isRateLimited() { return this.status === 429; }
}

const TIMEOUT_MS = 12_000;
const unauthorizedListeners = new Set<() => void>();
/** Appelé quand une route protégée répond 401 alors qu'une session était supposée ouverte (session expirée ailleurs). */
export const onUnauthorized = (listener: () => void) => { unauthorizedListeners.add(listener); return () => { unauthorizedListeners.delete(listener); }; };

export async function api<T = unknown>(method: string, path: string, body?: unknown, options: { keepalive?: boolean; /** Un 401 attendu (mot de passe à vérifier) n'est pas une session expirée. */ keepSession?: boolean } = {}): Promise<T> {
  if (!env.apiUrl) throw new ApiError(0, 'not_configured', 'L’adresse du service ORIGIN n’est pas renseignée.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    const init: RequestInit = { method, credentials: 'include', signal: controller.signal, ...(options.keepalive ? { keepalive: true } : {}) };
    if (body !== undefined) { init.headers = { 'content-type': 'application/json' }; init.body = JSON.stringify(body); }
    response = await fetch(`${env.apiUrl}${path}`, init);
  } catch {
    throw new ApiError(0, 'network', 'Service momentanément indisponible. Vérifiez votre connexion, puis réessayez.');
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 204) return undefined as T;
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* corps vide ou illisible */ }
  if (!response.ok) {
    const data = (payload ?? {}) as { error?: string; message?: string; requestId?: string };
    if (response.status === 401 && !options.keepSession) unauthorizedListeners.forEach(listener => listener());
    if (response.status === 429) {
      const wait = Number(response.headers.get('Retry-After'));
      const seconds = Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : undefined;
      throw new ApiError(429, data.error ?? 'rate_limited', seconds ? `Trop de demandes : réessayez dans ${seconds} s.` : 'Trop de demandes : réessayez dans quelques secondes.', data.requestId, seconds);
    }
    throw new ApiError(response.status, data.error ?? 'error', data.message ?? 'Une erreur est survenue.', data.requestId);
  }
  return payload as T;
}
