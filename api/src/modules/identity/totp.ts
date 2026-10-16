/**
 * Module « identity » — mots de passe à usage unique basés sur le temps (TOTP, RFC 6238), sans dépendance.
 *
 * Compatible avec Google Authenticator, Microsoft Authenticator, 1Password, Authy… : 6 chiffres, pas de 30 s, SHA-1.
 * Fonctions pures (aucune base, aucune horloge cachée) pour être testées avec les vecteurs officiels de la RFC.
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_SECONDS = 30;

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('base32 invalide');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const generateSecret = (): string => base32Encode(randomBytes(20));

/** Code TOTP pour un « pas » de temps donné (digits = 6 par défaut). */
export function totpAtStep(secret: Buffer, step: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', secret).update(counter).digest();
  const offset = (hmac[hmac.length - 1] as number) & 15;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(binary).padStart(digits, '0');
}

export const stepAt = (nowMs: number): number => Math.floor(nowMs / 1000 / STEP_SECONDS);

/**
 * Vérifie un code en tolérant ±1 pas (horloge du téléphone légèrement décalée).
 * Retourne le pas qui correspond, ou null. Comparaison à temps constant sur chaque candidat.
 */
export function verifyTotp(secretBase32: string, code: string, nowMs: number, window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const current = stepAt(nowMs);
  let match: number | null = null;
  for (let offset = -window; offset <= window; offset += 1) {
    const step = current + offset;
    const expected = totpAtStep(secret, step);
    let diff = 0;
    for (let i = 0; i < 6; i += 1) diff |= expected.charCodeAt(i) ^ code.charCodeAt(i);
    if (diff === 0) match = step;
  }
  return match;
}

export function otpauthUrl(input: { secret: string; email: string; issuer: string }): string {
  const label = encodeURIComponent(`${input.issuer}:${input.email}`);
  return `otpauth://totp/${label}?secret=${input.secret}&issuer=${encodeURIComponent(input.issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

// ---- Chiffrement du secret au repos (AES-256-GCM, clé dérivée par HKDF) ---------------------------------------------

const keyOf = (masterKey: string): Buffer =>
  Buffer.from(hkdfSync('sha256', masterKey, 'origin-auth', 'totp-secret-v1', 32));

export function sealSecret(masterKey: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyOf(masterKey), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64url')).join('.');
}

export function openSecret(masterKey: string, sealed: string): string {
  const [iv, tag, data] = sealed.split('.').map(part => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !data) throw new Error('secret chiffré illisible');
  const decipher = createDecipheriv('aes-256-gcm', keyOf(masterKey), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Codes de secours : 10 caractères lisibles, groupés (xxxxx-xxxxx). */
export function newRecoveryCode(): string {
  const raw = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase();
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}
