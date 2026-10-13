/**
 * Chiffrement des sauvegardes (AES-256-GCM, clé dérivée d'une phrase secrète par scrypt).
 *
 * Pourquoi : une sauvegarde contient des adresses e-mail et des empreintes de mots de passe. Si le disque ou le
 * fichier est volé ou envoyé par erreur, il doit être inutilisable sans la phrase secrète.
 * GCM authentifie aussi les données : un fichier modifié est détecté et la restauration s'arrête.
 *
 * Format : "ORGB1" (5 o) + sel (16 o) + IV (12 o) + données chiffrées + étiquette d'authentification (16 o).
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { Transform, type Readable } from 'node:stream';

const MAGIC = Buffer.from('ORGB1');
const HEADER_LENGTH = MAGIC.length + 16 + 12;
const TAG_LENGTH = 16;

const deriveKey = (passphrase: string, salt: Buffer): Buffer => scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });

export function encryptStream(passphrase: string): Transform {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  const header = Buffer.concat([MAGIC, salt, iv]);
  let headerSent = false;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      if (!headerSent) { this.push(header); headerSent = true; }
      callback(null, cipher.update(chunk));
    },
    flush(callback) {
      if (!headerSent) this.push(header);
      this.push(cipher.final());
      this.push(cipher.getAuthTag());
      callback();
    },
  });
}

/** Ouvre un fichier chiffré et retourne le flux en clair. Une altération provoque une erreur en fin de flux. */
export async function decryptFile(file: string, passphrase: string): Promise<Readable> {
  const { size } = await stat(file);
  if (size < HEADER_LENGTH + TAG_LENGTH) throw new Error('Fichier chiffré invalide (trop court).');
  const handle = await open(file, 'r');
  try {
    const header = Buffer.alloc(HEADER_LENGTH);
    await handle.read(header, 0, HEADER_LENGTH, 0);
    const tag = Buffer.alloc(TAG_LENGTH);
    await handle.read(tag, 0, TAG_LENGTH, size - TAG_LENGTH);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Ce fichier n’est pas une sauvegarde ORIGIN chiffrée.');
    const salt = header.subarray(MAGIC.length, MAGIC.length + 16);
    const iv = header.subarray(MAGIC.length + 16);
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
    decipher.setAuthTag(tag);
    const raw = createReadStream(file, { start: HEADER_LENGTH, end: size - TAG_LENGTH - 1 });
    // Si le consommateur s'arrête (erreur en aval), on libère le fichier ; une erreur d'authentification tardive,
    // émise après coup, ne doit pas faire planter le processus : elle est déjà rapportée via le flux principal.
    raw.on('error', error => decipher.destroy(error));
    decipher.on('close', () => raw.destroy());
    decipher.on('error', () => undefined);
    return raw.pipe(decipher);
  } finally {
    await handle.close();
  }
}
