/**
 * Module « playback » — accès aux médias lisibles.
 *
 * Règle métier centrale : un média n'est lisible que si son statut est « ready ».
 * (La base garantit en plus qu'un média « ready » a une durée : voir migrations/001_init.sql.)
 */
import type { Sql } from '../../platform/database/client.ts';

export interface PlayableAsset {
  playbackId: string;
  programSlug: string;
  durationSeconds: number;
  /** Dossier du média à l'intérieur de videos/hls/ (voir platform/storage/layout.ts). */
  storagePath: string;
  renditions: { name: string; height: number; videoKbps: number }[];
}

interface AssetRow {
  playback_id: string;
  program_slug: string;
  duration_seconds: string;
  storage_path: string;
  renditions: PlayableAsset['renditions'];
}

/** Retourne le média lisible d'un identifiant de lecture, ou null s'il n'est pas prêt. */
export async function findPlayableAsset(sql: Sql, playbackId: string): Promise<PlayableAsset | null> {
  const [row] = await sql<AssetRow[]>`
    SELECT playback_id, program_slug, duration_seconds::text, storage_path, renditions
    FROM media_assets
    WHERE playback_id = ${playbackId} AND status = 'ready'`;
  if (!row) return null;
  return {
    playbackId: row.playback_id,
    programSlug: row.program_slug,
    durationSeconds: Number(row.duration_seconds),
    storagePath: row.storage_path,
    renditions: row.renditions,
  };
}
