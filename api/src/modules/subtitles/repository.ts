/** Module « subtitles » — accès aux pistes de sous-titres (SQL uniquement). */
import type { Sql } from '../../platform/database/client.ts';

export interface SubtitleTrack {
  lang: string;
  label: string;
  isDefault: boolean;
}

export async function listTracks(sql: Sql, playbackId: string): Promise<SubtitleTrack[]> {
  const rows = await sql<{ lang: string; label: string; is_default: boolean }[]>`
    SELECT lang, label, is_default FROM subtitle_tracks WHERE playback_id = ${playbackId} ORDER BY is_default DESC, lang`;
  return rows.map(row => ({ lang: row.lang, label: row.label, isDefault: row.is_default }));
}

export async function trackExists(sql: Sql, playbackId: string, lang: string): Promise<boolean> {
  return (await sql`SELECT 1 FROM subtitle_tracks WHERE playback_id = ${playbackId} AND lang = ${lang}`).length > 0;
}

/** Enregistre la piste ; une seule piste par défaut par média. Retourne false si le média n'existe pas. */
export async function upsertTrack(
  sql: Sql,
  input: { playbackId: string; lang: string; label: string; isDefault: boolean; byteSize: number },
): Promise<boolean> {
  return sql.begin(async tx => {
    const [asset] = await tx`SELECT 1 FROM media_assets WHERE playback_id = ${input.playbackId}`;
    if (!asset) return false;
    if (input.isDefault) await tx`UPDATE subtitle_tracks SET is_default = false WHERE playback_id = ${input.playbackId}`;
    await tx`
      INSERT INTO subtitle_tracks (playback_id, lang, label, is_default, byte_size)
      VALUES (${input.playbackId}, ${input.lang}, ${input.label}, ${input.isDefault}, ${input.byteSize})
      ON CONFLICT (playback_id, lang) DO UPDATE SET
        label = EXCLUDED.label, is_default = EXCLUDED.is_default, byte_size = EXCLUDED.byte_size, updated_at = now()`;
    return true;
  });
}

export async function deleteTrack(sql: Sql, playbackId: string, lang: string): Promise<boolean> {
  return (await sql`DELETE FROM subtitle_tracks WHERE playback_id = ${playbackId} AND lang = ${lang} RETURNING lang`).length > 0;
}
