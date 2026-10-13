/**
 * Sauvegarde et restauration LOGIQUES de la base (sans pg_dump).
 *
 * Principe : les migrations sont la source de vérité du SCHÉMA ; la sauvegarde ne contient que les DONNÉES,
 * table par table, en CSV compressé (et chiffré si une phrase secrète est fournie), plus un manifeste avec
 * les empreintes SHA-256. La lecture se fait dans UNE transaction « instantané » : la sauvegarde est cohérente
 * même si l'application écrit pendant ce temps.
 *
 * Restauration : on applique les migrations sur une base vide, puis on recharge les tables dans l'ordre
 * des clés étrangères, on vérifie les nombres de lignes, et on recale les séquences.
 * Tout se passe dans une transaction : un échec ne laisse rien à moitié restauré.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import type { Sql } from '../database/client.ts';
import { migrate } from '../database/migrate.ts';
import { decryptFile, encryptStream } from './crypto.ts';

export interface BackupManifest {
  format: 1;
  createdAt: string;
  encrypted: boolean;
  migrations: string[];
  tables: { name: string; rows: number; file: string; bytes: number; sha256: string }[];
}

const quote = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

/** Tables de l'application, parents avant enfants (ordre de chargement valide pour les clés étrangères). */
export async function tablesInDependencyOrder(sql: Sql): Promise<string[]> {
  const tables = (await sql<{ name: string }[]>`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name`).map(row => row.name);
  const edges = await sql<{ child: string; parent: string }[]>`
    SELECT c.relname AS child, p.relname AS parent
    FROM pg_constraint k
    JOIN pg_class c ON c.oid = k.conrelid
    JOIN pg_class p ON p.oid = k.confrelid
    WHERE k.contype = 'f' AND k.connamespace = current_schema()::regnamespace`;

  const remaining = new Set(tables);
  const ordered: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining].filter(table => edges.every(edge => edge.child !== table || edge.parent === table || !remaining.has(edge.parent)));
    if (ready.length === 0) throw new Error('Cycle de clés étrangères : ordre de restauration impossible.');
    for (const table of ready.sort()) { ordered.push(table); remaining.delete(table); }
  }
  return ordered;
}

export async function backupDatabase(sql: Sql, outDir: string, options: { passphrase?: string | undefined } = {}): Promise<BackupManifest> {
  const work = `${outDir}.partial`;
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });

  const manifest: BackupManifest = {
    format: 1,
    createdAt: new Date().toISOString(),
    encrypted: Boolean(options.passphrase),
    migrations: [],
    tables: [],
  };

  await sql.begin('isolation level repeatable read read only', async tx => {
    manifest.migrations = (await tx<{ name: string }[]>`SELECT name FROM schema_migrations ORDER BY name`).map(row => row.name);
    for (const table of await tablesInDependencyOrder(tx as unknown as Sql)) {
      const extension = options.passphrase ? 'csv.gz.enc' : 'csv.gz';
      const file = path.join(work, `${table}.${extension}`);
      const readable = await tx.unsafe(`COPY ${quote(table)} TO STDOUT WITH (FORMAT csv, HEADER true)`).readable();
      await pipeline(
        readable,
        createGzip(),
        ...(options.passphrase ? [encryptStream(options.passphrase)] : []),
        createWriteStream(file, { mode: 0o600 }),
      );
      const [{ count }] = await tx.unsafe(`SELECT count(*)::int AS count FROM ${quote(table)}`) as unknown as [{ count: number }];
      const { size } = await stat(file);
      manifest.tables.push({ name: table, rows: count, file: path.basename(file), bytes: size, sha256: await sha256File(file) });
    }
  });

  await writeFile(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  await rm(outDir, { recursive: true, force: true });
  await rename(work, outDir); // la sauvegarde n'existe sous son vrai nom qu'une fois COMPLÈTE
  return manifest;
}

export async function readManifest(dir: string): Promise<BackupManifest> {
  return JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')) as BackupManifest;
}

/** Vérifie les empreintes des fichiers d'une sauvegarde (sans toucher à la base). */
export async function verifyBackupFiles(dir: string): Promise<BackupManifest> {
  const manifest = await readManifest(dir);
  for (const table of manifest.tables) {
    const actual = await sha256File(path.join(dir, table.file)).catch(() => null);
    if (actual !== table.sha256) throw new Error(`Sauvegarde corrompue ou incomplète : ${table.file}`);
  }
  return manifest;
}

export async function restoreDatabase(sql: Sql, dir: string, options: { passphrase?: string | undefined } = {}): Promise<BackupManifest> {
  const manifest = await verifyBackupFiles(dir);
  if (manifest.encrypted && !options.passphrase) throw new Error('Cette sauvegarde est chiffrée : fournissez BACKUP_PASSPHRASE.');

  await migrate(sql);
  const applied = (await sql<{ name: string }[]>`SELECT name FROM schema_migrations ORDER BY name`).map(row => row.name);
  const unknown = manifest.migrations.filter(name => !applied.includes(name));
  if (unknown.length > 0) throw new Error(`La sauvegarde vient d'une version plus récente du schéma : ${unknown.join(', ')}`);

  const order = await tablesInDependencyOrder(sql);
  for (const table of order) {
    const [{ count }] = await sql.unsafe(`SELECT count(*)::int AS count FROM ${quote(table)}`) as unknown as [{ count: number }];
    if (count > 0 && table !== 'schema_migrations') throw new Error(`La base cible n'est pas vide (table ${table}) : restauration refusée.`);
  }

  await sql.begin(async tx => {
    await tx.unsafe('TRUNCATE schema_migrations');
    const byName = new Map(manifest.tables.map(table => [table.name, table]));
    for (const table of order) {
      const entry = byName.get(table);
      if (!entry) continue; // table ajoutée par une migration plus récente que la sauvegarde
      const file = path.join(dir, entry.file);
      const source = manifest.encrypted ? await decryptFile(file, options.passphrase ?? '') : createReadStream(file);
      const writable = await tx.unsafe(`COPY ${quote(table)} FROM STDIN WITH (FORMAT csv, HEADER true)`).writable();
      await pipeline(source, createGunzip(), writable);

      const [{ count }] = await tx.unsafe(`SELECT count(*)::int AS count FROM ${quote(table)}`) as unknown as [{ count: number }];
      if (count !== entry.rows) throw new Error(`Table ${table} : ${count} lignes restaurées au lieu de ${entry.rows}.`);
    }

    // Recale les compteurs automatiques (identifiants en série) pour que les nouvelles lignes n'entrent pas en collision.
    const serials = await tx<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND column_default LIKE 'nextval(%'`;
    for (const { table_name, column_name } of serials) {
      await tx.unsafe(
        `SELECT setval(pg_get_serial_sequence('${quote(table_name)}', '${column_name}'), COALESCE(max(${quote(column_name)}), 1), max(${quote(column_name)}) IS NOT NULL) FROM ${quote(table_name)}`,
      );
    }
  });
  return manifest;
}
