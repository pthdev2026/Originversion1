import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from './client.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, '..', '..', '..', 'migrations');

/** Clé du verrou consultatif PostgreSQL qui sérialise les migrations (valeur arbitraire, propre à ORIGIN). */
const MIGRATION_LOCK_KEY = 7_281_904_551;

/**
 * Applique les migrations SQL non encore passées, dans l'ordre des noms de fichiers, chacune dans une transaction.
 *
 * Robustesse : deux instances qui démarrent en même temps (déploiement, redémarrage automatique) ne doivent pas
 * appliquer la même migration deux fois. Chaque migration prend donc un VERROU consultatif de transaction, puis
 * revérifie, une fois le verrou obtenu, qu'elle n'a pas été appliquée entre-temps par l'autre instance.
 */
export async function migrate(sql: Sql, dir = MIGRATIONS_DIR): Promise<string[]> {
  // Même la création de la table de suivi doit être sérialisée : deux « CREATE TABLE IF NOT EXISTS » simultanés
  // peuvent s'entrecroiser et échouer sur le catalogue interne de PostgreSQL.
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`;
    await tx`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  });
  const files = (await readdir(dir)).filter(name => name.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    const content = await readFile(path.join(dir, file), 'utf8');
    const didApply = await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`;
      await tx`SET LOCAL statement_timeout = 0`;     // une migration légitime peut dépasser la limite des requêtes courantes
      const [already] = await tx`SELECT 1 FROM schema_migrations WHERE name = ${file}`;
      if (already) return false;
      await tx.unsafe(content);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
      return true;
    });
    if (didApply) applied.push(file);
  }
  return applied;
}
