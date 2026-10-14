/**
 * Module « ingest » — enregistrement d'un média déjà encodé.
 *
 * L'encodage lui-même est fait par video-pipeline/ ; ce module inscrit le résultat en base
 * (programme + média) de façon atomique : tout est enregistré, ou rien.
 */
import type { Sql } from '../../platform/database/client.ts';

export interface IngestInput {
  playbackId: string;
  programSlug: string;
  kind: 'film' | 'serie' | 'documentaire' | 'brand';
  title: string;
  storagePath: string;
  durationSeconds: number;
  sourceWidth: number | null;
  sourceHeight: number | null;
  renditions: { name: string; height: number; videoKbps: number }[];
  preset: string | null;
  encodeSeconds: number | null;
  encodedAt: string | null;
  isDemo: boolean;
}

/** Enregistre (ou met à jour) un programme et son média encodé, de façon atomique. */
export async function registerAsset(sql: Sql, input: IngestInput): Promise<void> {
  await sql.begin(async tx => {
    await tx`
      INSERT INTO programs (slug, kind, title, is_demo)
      VALUES (${input.programSlug}, ${input.kind}, ${input.title}, ${input.isDemo})
      -- Un programme déjà présent garde sa fiche éditoriale (type, titre) : l'encodage n'écrase jamais le catalogue.
      ON CONFLICT (slug) DO UPDATE SET updated_at = now()`;
    await tx`
      INSERT INTO media_assets
        (playback_id, program_slug, status, storage_path, duration_seconds, source_width, source_height, renditions, preset, encode_seconds, encoded_at)
      VALUES
        (${input.playbackId}, ${input.programSlug}, 'ready', ${input.storagePath}, ${input.durationSeconds}, ${input.sourceWidth}, ${input.sourceHeight},
         ${tx.json(input.renditions as never)}, ${input.preset}, ${input.encodeSeconds}, ${input.encodedAt})
      ON CONFLICT (playback_id) DO UPDATE SET
        program_slug = EXCLUDED.program_slug, status = 'ready', storage_path = EXCLUDED.storage_path,
        duration_seconds = EXCLUDED.duration_seconds, source_width = EXCLUDED.source_width, source_height = EXCLUDED.source_height,
        renditions = EXCLUDED.renditions, preset = EXCLUDED.preset, encode_seconds = EXCLUDED.encode_seconds,
        encoded_at = EXCLUDED.encoded_at, updated_at = now()`;
  });
}
