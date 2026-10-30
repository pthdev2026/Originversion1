/** Module « mylist » — « Ma liste » : contenus mis de côté par un compte (SQL uniquement). */
import type { Sql } from '../../platform/database/client.ts';

export interface ListEntry {
  slug: string;
  addedAt: Date;
}

export async function listEntries(sql: Sql, userId: string): Promise<ListEntry[]> {
  const rows = await sql<{ slug: string; added_at: Date }[]>`
    SELECT slug, added_at FROM my_list WHERE user_id = ${userId} ORDER BY added_at DESC`;
  return rows.map(row => ({ slug: row.slug, addedAt: row.added_at }));
}

/**
 * Idempotent : ajouter deux fois ne crée pas de doublon (`present`). La limite par compte est vérifiée DANS la même
 * transaction que l'insertion, sous un verrou propre au compte : deux ajouts simultanés ne peuvent pas la dépasser.
 */
export async function addEntry(sql: Sql, userId: string, slug: string, max: number): Promise<'added' | 'present' | 'full'> {
  return sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${'mylist:' + userId}))`;
    const [existing] = await tx`SELECT 1 FROM my_list WHERE user_id = ${userId} AND slug = ${slug}`;
    if (existing) return 'present' as const;
    const [row] = await tx<{ count: string }[]>`SELECT count(*)::text AS count FROM my_list WHERE user_id = ${userId}`;
    if (Number(row?.count ?? 0) >= max) return 'full' as const;
    await tx`INSERT INTO my_list (user_id, slug) VALUES (${userId}, ${slug})`;
    return 'added' as const;
  });
}

export async function removeEntry(sql: Sql, userId: string, slug: string): Promise<void> {
  await sql`DELETE FROM my_list WHERE user_id = ${userId} AND slug = ${slug}`;
}

