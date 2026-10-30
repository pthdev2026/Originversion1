/** Module « contact » — messages du formulaire « Nous contacter » (SQL uniquement). */
import type { Sql } from '../../platform/database/client.ts';

export type ContactTopic = 'general' | 'account' | 'playback' | 'content' | 'press' | 'other';

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  userId: string | null;
  status: 'new' | 'handled';
  createdAt: Date;
  handledAt: Date | null;
}

interface Row {
  id: string; name: string; email: string; topic: ContactTopic; message: string; user_id: string | null;
  status: 'new' | 'handled'; created_at: Date; handled_at: Date | null;
}

const toMessage = (row: Row): ContactMessage => ({
  id: row.id, name: row.name, email: row.email, topic: row.topic, message: row.message, userId: row.user_id,
  status: row.status, createdAt: row.created_at, handledAt: row.handled_at,
});

export async function insertContactMessage(sql: Sql, input: { id: string; name: string; email: string; topic: ContactTopic; message: string; userId: string | null }): Promise<void> {
  await sql`
    INSERT INTO contact_messages (id, name, email, topic, message, user_id)
    VALUES (${input.id}, ${input.name}, ${input.email}, ${input.topic}, ${input.message}, ${input.userId})`;
}

export async function listContactMessages(sql: Sql, limit: number, status?: 'new' | 'handled'): Promise<ContactMessage[]> {
  const filter = status ? sql`WHERE status = ${status}` : sql``;
  const rows = await sql<Row[]>`SELECT * FROM contact_messages ${filter} ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map(toMessage);
}

export async function markHandled(sql: Sql, id: string): Promise<boolean> {
  const rows = await sql`UPDATE contact_messages SET status = 'handled', handled_at = now() WHERE id = ${id} AND status = 'new' RETURNING id`;
  return rows.length > 0;
}
