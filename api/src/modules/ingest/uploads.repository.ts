/** Envois de fichiers (SQL uniquement). L'état « où en est l'envoi » vit ici et dans la taille du fichier. */
import type { Sql } from '../../platform/database/client.ts';

export interface UploadMetadata {
  playbackId: string;
  programSlug: string;
  kind: 'film' | 'serie' | 'documentaire' | 'brand';
  title: string;
  isDemo: boolean;
}

export interface Upload {
  id: string;
  userId: string | null;
  filename: string;
  sizeBytes: number;
  offsetBytes: number;
  status: 'uploading' | 'complete' | 'aborted';
  metadata: UploadMetadata;
}

interface UploadRow {
  id: string;
  user_id: string | null;
  filename: string;
  size_bytes: string;
  offset_bytes: string;
  status: Upload['status'];
  metadata: UploadMetadata;
}

const toUpload = (row: UploadRow): Upload => ({
  id: row.id,
  userId: row.user_id,
  filename: row.filename,
  sizeBytes: Number(row.size_bytes),
  offsetBytes: Number(row.offset_bytes),
  status: row.status,
  metadata: row.metadata,
});

export async function insertUpload(
  sql: Sql,
  input: { id: string; userId: string | null; filename: string; sizeBytes: number; metadata: UploadMetadata },
): Promise<void> {
  await sql`
    INSERT INTO uploads (id, user_id, filename, size_bytes, metadata)
    VALUES (${input.id}, ${input.userId}, ${input.filename}, ${input.sizeBytes}, ${sql.json(input.metadata as never)})`;
}

export async function findUpload(sql: Sql, id: string): Promise<Upload | null> {
  const [row] = await sql<UploadRow[]>`SELECT * FROM uploads WHERE id = ${id}`;
  return row ? toUpload(row) : null;
}

export async function setUploadOffset(sql: Sql, id: string, offsetBytes: number): Promise<void> {
  await sql`UPDATE uploads SET offset_bytes = ${offsetBytes}, updated_at = now() WHERE id = ${id}`;
}

export async function setUploadStatus(sql: Sql, id: string, status: Upload['status']): Promise<void> {
  await sql`UPDATE uploads SET status = ${status}, updated_at = now() WHERE id = ${id}`;
}
