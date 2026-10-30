/**
 * Module « mux » — jetons de lecture signés (JWT RS256), sans dépendance (`node:crypto`).
 *
 * Un média Mux « signé » n'est lisible qu'avec un jeton que NOTRE serveur fabrique avec une clé privée qui ne quitte jamais le serveur.
 * Claims : `sub` = identifiant de lecture Mux, `aud` = `v` (vidéo) ou `t` (vignette), `exp` = expiration (secondes Unix),
 * `kid` = identifiant de la clé de signature. La documentation montre `kid` tantôt dans l'en-tête, tantôt dans les claims :
 * on le met aux DEUX endroits (sans effet néfaste, et compatible avec les deux lectures).
 */
import { createPrivateKey, createSign } from 'node:crypto';

const base64url = (value: Buffer | string): string => Buffer.from(value).toString('base64url');

/** Clé privée fournie par Mux : « base64 d'un fichier PEM » (documentation). On accepte aussi un PEM brut. */
export function loadPrivateKey(value: string): ReturnType<typeof createPrivateKey> {
  const trimmed = value.trim();
  const pem = trimmed.startsWith('-----BEGIN') ? trimmed : Buffer.from(trimmed, 'base64').toString('utf8');
  return createPrivateKey(pem);
}

export function signMuxToken(input: {
  key: ReturnType<typeof createPrivateKey>;
  keyId: string;
  playbackId: string;
  audience: 'v' | 't';
  expiresAtSeconds: number;
}): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: input.keyId }));
  const payload = base64url(JSON.stringify({ sub: input.playbackId, aud: input.audience, exp: input.expiresAtSeconds, kid: input.keyId }));
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(input.key);
  return `${header}.${payload}.${base64url(signature)}`;
}
