/**
 * Jetons d'authentification du CDN Bunny (« Token Authentication » d'une Pull Zone).
 *
 * Pourquoi un jeton de RÉPERTOIRE placé dans le chemin : une playlist HLS référence ses segments par des URLs
 * relatives, qui perdent la partie `?token=...`. Un jeton valable pour tout un répertoire, écrit dans le chemin
 * (`/bcdn_token=…&expires=…&token_path=…/fichier`), se propage naturellement à tous les segments.
 *
 * Algorithme (documentation Bunny) :
 *   empreinte = SHA-256( clé de sécurité + répertoire autorisé + expiration + « token_path=<répertoire> » )
 *   jeton     = base64 URL-safe de l'empreinte, sans « = »
 *
 * ⚠️ À valider sur la vraie zone avec `npm run cdn:check` avant toute mise en ligne : le CDN est le seul juge.
 */
import { createHash } from 'node:crypto';

export interface BunnyTokenOptions {
  /** Ex. https://origin-videos.b-cdn.net (sans / final). */
  cdnUrl: string;
  /** « URL Token Authentication Key » de la Pull Zone. Secret. */
  tokenKey: string;
}

const base64Url = (buffer: Buffer): string => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Retourne le jeton pour un répertoire donné (avec « / » initial et final). */
export function bunnyDirectoryToken(tokenKey: string, directory: string, expires: number): string {
  const hashable = `${tokenKey}${directory}${expires}token_path=${directory}`;
  return base64Url(createHash('sha256').update(hashable).digest());
}

/** URL signée d'un fichier : le jeton couvre tout le répertoire `directory`, donc aussi les segments relatifs. */
export function bunnySignedUrl(options: BunnyTokenOptions, directory: string, file: string, expires: number): string {
  if (!directory.startsWith('/') || !directory.endsWith('/')) throw new Error('Le répertoire doit commencer et finir par « / ».');
  const token = bunnyDirectoryToken(options.tokenKey, directory, expires);
  return `${options.cdnUrl}/bcdn_token=${token}&expires=${expires}&token_path=${encodeURIComponent(directory)}${directory}${file}`;
}
