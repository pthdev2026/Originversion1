/**
 * Module « media » — jetons de lecture.
 *
 * Un jeton prouve « cette URL a été autorisée pour CE média jusqu'à CETTE date ». Il est signé avec
 * un secret du serveur (HMAC) : impossible à fabriquer ou à modifier sans ce secret.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

// Jeton de lecture : "<expiration>.<signature>", signé sur "<programId>.<expiration>".
// Il est placé dans le chemin (et non dans la query) pour que les URLs relatives
// des playlists HLS héritent automatiquement de l'autorisation.

function sign(secret: string, programId: string, expiresAt: number): string {
  return createHmac('sha256', secret).update(`${programId}.${expiresAt}`).digest('base64url');
}

export function createMediaToken(secret: string, programId: string, ttlSeconds: number, now = Date.now()): { token: string; expiresAt: number } {
  const expiresAt = Math.floor(now / 1000) + ttlSeconds;
  return { token: `${expiresAt}.${sign(secret, programId, expiresAt)}`, expiresAt };
}

/**
 * Vérifie un jeton. `secrets` peut contenir plusieurs secrets : le courant et l'ancien, le temps d'une rotation.
 * Pour changer de secret sans couper les lectures en cours : mettre le nouveau dans MEDIA_SECRET, l'ancien dans
 * MEDIA_SECRET_PREVIOUS, redéployer, puis retirer l'ancien après la durée de validité des jetons.
 */
export function verifyMediaToken(secrets: string | readonly string[], programId: string, token: string, now = Date.now()): boolean {
  const [expRaw, signature, ...rest] = token.split('.');
  if (!expRaw || !signature || rest.length > 0) return false;
  const expiresAt = Number(expRaw);
  if (!Number.isInteger(expiresAt) || expiresAt < Math.floor(now / 1000)) return false;
  const received = Buffer.from(signature);
  const candidates = typeof secrets === 'string' ? [secrets] : secrets;
  // Comparaison en temps constant : ne révèle rien par le temps de réponse.
  return candidates.some(secret => {
    const expected = Buffer.from(sign(secret, programId, expiresAt));
    return expected.length === received.length && timingSafeEqual(expected, received);
  });
}
