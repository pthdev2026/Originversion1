/** Module « mux » — suivi des envois vers Mux (SQL uniquement). */
import type { Sql } from '../../platform/database/client.ts';

export type MuxUploadStatus = 'waiting' | 'processing' | 'ready' | 'failed' | 'canceled';

export interface MuxUploadRow {
  id: string;
  muxUploadId: string;
  muxAssetId: string | null;
  playbackId: string;
  programSlug: string;
  kind: 'film' | 'serie' | 'documentaire';
  title: string;
  isDemo: boolean;
  status: MuxUploadStatus;
  error: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
}

interface Row {
  id: string; mux_upload_id: string; mux_asset_id: string | null; playback_id: string; program_slug: string;
  kind: MuxUploadRow['kind']; title: string; is_demo: boolean; status: MuxUploadStatus; error: string | null;
  created_by: string | null; created_at: Date; updated_at: Date; finished_at: Date | null;
}

const toRow = (row: Row): MuxUploadRow => ({
  id: row.id, muxUploadId: row.mux_upload_id, muxAssetId: row.mux_asset_id, playbackId: row.playback_id, programSlug: row.program_slug,
  kind: row.kind, title: row.title, isDemo: row.is_demo, status: row.status, error: row.error, createdBy: row.created_by,
  createdAt: row.created_at, updatedAt: row.updated_at, finishedAt: row.finished_at,
});

export async function insertUpload(sql: Sql, input: {
  id: string; muxUploadId: string; playbackId: string; programSlug: string; kind: MuxUploadRow['kind']; title: string; isDemo: boolean; createdBy: string | null;
}): Promise<MuxUploadRow> {
  const [row] = await sql<Row[]>`
    INSERT INTO mux_uploads (id, mux_upload_id, playback_id, program_slug, kind, title, is_demo, created_by)
    VALUES (${input.id}, ${input.muxUploadId}, ${input.playbackId}, ${input.programSlug}, ${input.kind}, ${input.title}, ${input.isDemo}, ${input.createdBy})
    RETURNING *`;
  return toRow(row as Row);
}

export async function findUpload(sql: Sql, id: string): Promise<MuxUploadRow | null> {
  const [row] = await sql<Row[]>`SELECT * FROM mux_uploads WHERE id = ${id}`;
  return row ? toRow(row) : null;
}

export async function listUploads(sql: Sql, limit: number, filter: { playbackId?: string; programSlug?: string } = {}): Promise<MuxUploadRow[]> {
  const byPlayback = filter.playbackId ? sql`AND playback_id = ${filter.playbackId}` : sql``;
  const byProgram = filter.programSlug ? sql`AND program_slug = ${filter.programSlug}` : sql``;
  const rows = await sql<Row[]>`SELECT * FROM mux_uploads WHERE true ${byPlayback} ${byProgram} ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map(toRow);
}

export async function listActiveUploads(sql: Sql, limit = 50): Promise<MuxUploadRow[]> {
  const rows = await sql<Row[]>`SELECT * FROM mux_uploads WHERE status IN ('waiting', 'processing') ORDER BY created_at LIMIT ${limit}`;
  return rows.map(toRow);
}

export async function setProcessing(sql: Sql, id: string, assetId: string): Promise<void> {
  await sql`UPDATE mux_uploads SET status = 'processing', mux_asset_id = ${assetId}, updated_at = now() WHERE id = ${id} AND status IN ('waiting', 'processing')`;
}

/** Termine un envoi (réussi, échoué ou annulé). Sans effet s'il est déjà terminé : plusieurs actualisations simultanées sont sans danger. */
export async function finish(sql: Sql, id: string, status: 'ready' | 'failed' | 'canceled', error: string | null): Promise<boolean> {
  const rows = await sql`
    UPDATE mux_uploads SET status = ${status}, error = ${error}, finished_at = now(), updated_at = now()
    WHERE id = ${id} AND status IN ('waiting', 'processing') RETURNING id`;
  return rows.length > 0;
}

/** Une préparation FFmpeg est-elle active pour ce contenu ? (un même contenu n'a qu'une seule préparation à la fois, quelle que soit la voie) */
export async function hasActiveEncodeJob(sql: Sql, playbackId: string): Promise<boolean> {
  return (await sql`SELECT 1 FROM media_jobs WHERE playback_id = ${playbackId} AND status IN ('queued', 'running') LIMIT 1`).length > 0;
}
