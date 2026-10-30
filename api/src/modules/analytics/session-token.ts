/**
 * Autorisation légère des rapports de lecture.
 *
 * Constat : `POST /api/playback-sessions` était ouvert à tous ; n'importe qui pouvait fabriquer des « lectures »
 * pour un média et fausser le Top 10 (`loadTrending` compte les sessions de plus de 10 s).
 *
 * Mécanisme : la réponse de `GET /api/programs/:id/playback` (anonyme ou connecté, média signé ou non) contient
 * `analytics: { sessionId, token }`. Le jeton est un HMAC (clé dérivée du secret des médias) qui lie l'identifiant
 * de session, le média et l'heure d'émission. Le rapport doit le renvoyer dans son corps (compatible `sendBeacon`
 * en text/plain, donc sans en-tête ni cookie). Le serveur refuse alors : jeton absent/falsifié/expiré, session ou
 * média différents de ceux du jeton, et un temps regardé supérieur au temps réellement écoulé depuis l'émission.
 * Un jeton = une session : les envois répétés mettent à jour la même ligne (maximum des compteurs).
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/** Une session de lecture peut durer longtemps (film de 2 h avec pauses) mais pas indéfiniment. */
export const SESSION_TOKEN_TTL_SECONDS = 24 * 3600;
/** Tolérance d'horloge entre serveurs (jeton daté du futur). */
const CLOCK_SKEW_SECONDS = 30;
/** Arrondis et latence : le temps regardé peut dépasser de peu le temps écoulé. Volontairement court (seuil d'une « vue » : 10 s). */
const WATCH_SLACK_SECONDS = 2;

const keyOf = (secret: string): Buffer => createHmac('sha256', secret).update('origin-analytics-session-v1').digest();
const mac = (secret: string, payload: string): string => createHmac('sha256', keyOf(secret)).update(payload).digest('base64url');

export interface SessionGrant {
  sessionId: string;
  token: string;
}

export function issueSessionGrant(secret: string, playbackId: string, now = Date.now()): SessionGrant {
  return signSessionGrant(secret, randomUUID(), playbackId, now);
}

export function signSessionGrant(secret: string, sessionId: string, playbackId: string, now = Date.now()): SessionGrant {
  const issuedAt = Math.floor(now / 1000);
  const payload = `${sessionId}.${playbackId}.${issuedAt}`;
  return { sessionId, token: `${issuedAt}.${mac(secret, payload)}` };
}

export type GrantCheck = { ok: true; elapsedSeconds: number } | { ok: false; reason: 'malformed' | 'invalid' | 'expired' | 'future' };

export function verifySessionGrant(secrets: readonly string[], sessionId: string, playbackId: string, token: unknown, now = Date.now()): GrantCheck {
  if (typeof token !== 'string' || token.length > 200) return { ok: false, reason: 'malformed' };
  const [issued, signature, ...extra] = token.split('.');
  const issuedAt = Number(issued);
  if (!signature || extra.length > 0 || !Number.isInteger(issuedAt) || issuedAt <= 0) return { ok: false, reason: 'malformed' };
  const payload = `${sessionId}.${playbackId}.${issuedAt}`;
  const given = Buffer.from(signature);
  const valid = secrets.some(secret => {
    const expected = Buffer.from(mac(secret, payload));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
  if (!valid) return { ok: false, reason: 'invalid' };
  const elapsed = Math.floor(now / 1000) - issuedAt;
  if (elapsed < -CLOCK_SKEW_SECONDS) return { ok: false, reason: 'future' };
  if (elapsed > SESSION_TOKEN_TTL_SECONDS) return { ok: false, reason: 'expired' };
  return { ok: true, elapsedSeconds: Math.max(elapsed, 0) };
}

/** Le temps regardé ne peut pas dépasser le temps écoulé depuis l'émission du jeton (plus une courte tolérance). */
export const maxWatchSeconds = (elapsedSeconds: number): number => elapsedSeconds + WATCH_SLACK_SECONDS;
