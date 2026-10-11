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

export function verifyMediaToken(secret: string, programId: string, token: string, now = Date.now()): boolean {
  const [expRaw, signature, ...rest] = token.split('.');
  if (!expRaw || !signature || rest.length > 0) return false;
  const expiresAt = Number(expRaw);
  if (!Number.isInteger(expiresAt) || expiresAt < Math.floor(now / 1000)) return false;
  const expected = Buffer.from(sign(secret, programId, expiresAt));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
