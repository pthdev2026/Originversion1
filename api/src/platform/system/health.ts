/**
 * Santé du système : base de données, stockage, espace disque, fraîcheur des sauvegardes.
 * Fonctions pures et injectables : les tests peuvent simuler un disque plein sans remplir un disque.
 */
import { randomBytes } from 'node:crypto';
import { readdir, readFile, rm, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Sql } from '../database/client.ts';
import { parseBackupDate } from '../backup/files.ts';

export type FreeBytes = (directory: string) => Promise<number>;

export const freeBytesOf: FreeBytes = async directory => {
  const stats = await statfs(directory);
  return stats.bavail * stats.bsize;
};

export interface Check {
  ok: boolean;
  detail: string;
}

export interface Readiness {
  ok: boolean;
  checks: { database: Check; storage: Check; disk: Check };
}

export async function checkReadiness(options: {
  sql: Sql;
  storageRoot: string;
  minFreeBytes: number;
  freeBytes?: FreeBytes;
}): Promise<Readiness> {
  const freeBytes = options.freeBytes ?? freeBytesOf;

  const database: Check = await options.sql`SELECT 1`.then(
    () => ({ ok: true, detail: 'joignable' }),
    () => ({ ok: false, detail: 'injoignable' }),
  );

  // Le stockage doit être inscriptible : on écrit puis on supprime un petit fichier.
  const probe = path.join(options.storageRoot, `.ready-${randomBytes(4).toString('hex')}`);
  const storage: Check = await writeFile(probe, 'ok').then(() => rm(probe)).then(
    () => ({ ok: true, detail: 'inscriptible' }),
    () => ({ ok: false, detail: 'non inscriptible' }),
  );

  const disk: Check = await freeBytes(options.storageRoot).then(
    free => ({ ok: free >= options.minFreeBytes, detail: `${(free / 1024 ** 3).toFixed(1)} Go libres (minimum ${(options.minFreeBytes / 1024 ** 3).toFixed(0)} Go)` }),
    () => ({ ok: false, detail: 'espace disque illisible' }),
  );

  return { ok: database.ok && storage.ok && disk.ok, checks: { database, storage, disk } };
}

/** Date de la dernière sauvegarde de base complète, ou null s'il n'y en a aucune. */
export async function latestBackup(backupDir: string): Promise<{ name: string; createdAt: Date } | null> {
  const names = await readdir(backupDir).catch(() => [] as string[]);
  const dated = names
    .map(name => ({ name, createdAt: parseBackupDate(name) }))
    .filter((item): item is { name: string; createdAt: Date } => item.createdAt !== null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const candidate of dated) {
    // Une sauvegarde n'est valable que si son manifeste existe (il est écrit en dernier).
    if (await readFile(path.join(backupDir, candidate.name, 'manifest.json')).then(() => true, () => false)) return candidate;
  }
  return null;
}
