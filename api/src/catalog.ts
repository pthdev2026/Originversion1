import type { Sql } from './db/client.ts';

export interface PlayableAsset {
  playbackId: string;
  programSlug: string;
  durationSeconds: number;
  storagePath: string;
  renditions: { name: string; height: number; videoKbps: number }[];
}

export interface CatalogProgram {
  slug: string;
  kind: 'film' | 'serie' | 'documentaire';
  title: string;
  isDemo: boolean;
  playableCount: number;
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

/** Programmes ayant au moins un média prêt. */
export async function listPlayablePrograms(sql: Sql): Promise<CatalogProgram[]> {
  const rows = await sql<{ slug: string; kind: CatalogProgram['kind']; title: string; is_demo: boolean; playable: string }[]>`
    SELECT p.slug, p.kind, p.title, p.is_demo, count(m.playback_id)::text AS playable
    FROM programs p
    JOIN media_assets m ON m.program_slug = p.slug AND m.status = 'ready'
    GROUP BY p.slug
    ORDER BY p.title`;
  return rows.map(row => ({ slug: row.slug, kind: row.kind, title: row.title, isDemo: row.is_demo, playableCount: Number(row.playable) }));
}

export interface IngestInput {
  playbackId: string;
  programSlug: string;
  kind: CatalogProgram['kind'];
  title: string;
  storagePath: string;
  durationSeconds: number;
  sourceWidth: number | null;
  sourceHeight: number | null;
  renditions: PlayableAsset['renditions'];
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
      ON CONFLICT (slug) DO UPDATE SET kind = EXCLUDED.kind, title = EXCLUDED.title, is_demo = EXCLUDED.is_demo, updated_at = now()`;
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
