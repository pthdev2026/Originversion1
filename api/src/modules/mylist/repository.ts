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

/** Idempotent : ajouter deux fois ne crée pas de doublon. */
export async function addEntry(sql: Sql, userId: string, slug: string): Promise<void> {
  await sql`INSERT INTO my_list (user_id, slug) VALUES (${userId}, ${slug}) ON CONFLICT DO NOTHING`;
}

export async function removeEntry(sql: Sql, userId: string, slug: string): Promise<void> {
  await sql`DELETE FROM my_list WHERE user_id = ${userId} AND slug = ${slug}`;
}

/** Limite par compte : évite qu'un script remplisse la base. */
export async function countEntries(sql: Sql, userId: string): Promise<number> {
  const [row] = await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM my_list WHERE user_id = ${userId}`;
  return Number(row?.count ?? 0);
}
