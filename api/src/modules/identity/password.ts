/**
 * Mots de passe : hachage et règles.
 *
 * On ne stocke JAMAIS un mot de passe : on stocke une empreinte (hash) obtenue avec argon2id,
 * un algorithme lent et gourmand en mémoire, conçu pour rendre le calcul de masse très coûteux.
 * Chaque empreinte contient son propre sel et ses paramètres : on pourra les renforcer plus tard
 * sans casser les anciens comptes.
 */
import * as nodeCrypto from 'node:crypto';
import { randomBytes, timingSafeEqual } from 'node:crypto';

// `crypto.argon2` existe depuis Node 24.7 ; les types de @types/node 22 ne le déclarent pas encore.
type Argon2Params = { message: Buffer; nonce: Buffer; parallelism: number; tagLength: number; memory: number; passes: number };
const argon2Native = (nodeCrypto as unknown as {
  argon2: (algorithm: 'argon2id', params: Argon2Params, callback: (error: Error | null, key: Buffer) => void) => void;
}).argon2;
const argon2Raw = (algorithm: 'argon2id', params: Argon2Params): Promise<Buffer> =>
  new Promise((resolve, reject) => argon2Native(algorithm, params, (error, key) => (error ? reject(error) : resolve(key))));

/**
 * Limiteur de concurrence : au plus `max` tâches en même temps, les autres attendent leur tour.
 *
 * Pourquoi : le hachage argon2 est volontairement lent et gourmand. Sans limite, une vague de connexions
 * (première d'un film) occuperait tous les fils d'exécution de Node, et la lecture des fichiers vidéo
 * (qui utilise les mêmes fils) serait mise en attente. Avec la limite, les connexions font la queue,
 * mais la lecture des vidéos continue.
 */
export function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async task => {
    if (running >= max) await new Promise<void>(resolve => waiting.push(resolve));
    running += 1;
    try {
      return await task();
    } finally {
      running -= 1;
      waiting.shift()?.();
    }
  };
}

/** Au plus 2 hachages simultanés (voir `createLimiter`). */
const hashLimiter = createLimiter(2);
const argon2Async = (algorithm: 'argon2id', params: Argon2Params): Promise<Buffer> => hashLimiter(() => argon2Raw(algorithm, params));

/** Paramètres argon2id recommandés par l'OWASP (mémoire 19 Mio, 2 passes, 1 voie). */
const PARAMS = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 } as const;

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

async function derive(password: string, salt: Buffer, params: { memory: number; passes: number; parallelism: number }): Promise<Buffer> {
  const key = await argon2Async('argon2id', {
    message: Buffer.from(password, 'utf8'),
    nonce: salt,
    parallelism: params.parallelism,
    tagLength: PARAMS.tagLength,
    memory: params.memory,
    passes: params.passes,
  });
  return Buffer.from(key);
}

/** Produit une empreinte au format `$argon2id$m=…,t=…,p=…$<sel>$<empreinte>` (base64). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return `$argon2id$m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = /^\$argon2id\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/.exec(stored);
  if (!match) return false;
  const [, memory, passes, parallelism, saltB64, keyB64] = match;
  const expected = Buffer.from(keyB64 ?? '', 'base64');
  const actual = await derive(password, Buffer.from(saltB64 ?? '', 'base64'), {
    memory: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Empreinte factice : sert à dépenser le même temps quand l'adresse est inconnue (voir service de connexion). */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}

// Mots de passe les plus fréquents (extrait) : refusés quelle que soit leur longueur.
const COMMON = new Set([
  'password', 'password1', 'password123', 'motdepasse', 'motdepasse1', 'azertyuiop', 'azerty1234', 'azerty123456',
  'qwertyuiop', 'qwerty123456', '1234567890', '12345678910', '0123456789', 'iloveyou12', 'bonjour123', 'bonjour1234',
  'doudou1234', 'soleil1234', 'marseille13', 'football123', 'changeme123', 'welcome123', 'abcdefghij', 'passw0rd123',
]);

/** Retourne un message d'erreur lisible, ou null si le mot de passe est acceptable. */
export function checkPasswordPolicy(password: string, email: string): string | null {
  if (password.length < PASSWORD_MIN) return `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`;
  if (password.length > PASSWORD_MAX) return `Le mot de passe ne doit pas dépasser ${PASSWORD_MAX} caractères.`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return 'Ce mot de passe est trop courant. Choisissez-en un autre.';
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (lower === email.toLowerCase() || (local.length >= 4 && lower.includes(local))) {
    return 'Le mot de passe ne doit pas contenir votre adresse e-mail.';
  }
  if (new Set(lower).size < 4) return 'Le mot de passe est trop répétitif.';
  return null;
}
