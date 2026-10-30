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
  /** Qui possède les fichiers : notre pipeline (`self`, défaut) ou Mux. */
  provider?: 'self' | 'mux';
  providerAssetId?: string | null;
  providerPlaybackId?: string | null;
  providerPolicy?: 'public' | 'signed' | null;
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
        (playback_id, program_slug, status, storage_path, duration_seconds, source_width, source_height, renditions, preset, encode_seconds, encoded_at,
         provider, provider_asset_id, provider_playback_id, provider_policy)
      VALUES
        (${input.playbackId}, ${input.programSlug}, 'ready', ${input.storagePath}, ${input.durationSeconds}, ${input.sourceWidth}, ${input.sourceHeight},
         ${tx.json(input.renditions as never)}, ${input.preset}, ${input.encodeSeconds}, ${input.encodedAt},
         ${input.provider ?? 'self'}, ${input.providerAssetId ?? null}, ${input.providerPlaybackId ?? null}, ${input.providerPolicy ?? null})
      ON CONFLICT (playback_id) DO UPDATE SET
        program_slug = EXCLUDED.program_slug, status = 'ready', storage_path = EXCLUDED.storage_path,
        duration_seconds = EXCLUDED.duration_seconds, source_width = EXCLUDED.source_width, source_height = EXCLUDED.source_height,
        renditions = EXCLUDED.renditions, preset = EXCLUDED.preset, encode_seconds = EXCLUDED.encode_seconds,
        encoded_at = EXCLUDED.encoded_at, provider = EXCLUDED.provider, provider_asset_id = EXCLUDED.provider_asset_id,
        provider_playback_id = EXCLUDED.provider_playback_id, provider_policy = EXCLUDED.provider_policy, updated_at = now()`;
  });
}

// ---- Lecture d'un média prêt ---------------------------------------------------------------------------------------
// Le module « ingest » possède la table media_assets : c'est donc lui qui répond à « ce média est-il lisible ? ».
// Les modules playback, media et progress l'utilisent (dépendance à sens unique, sans cycle).

export interface PlayableAsset {
  playbackId: string;
  programSlug: string;
  durationSeconds: number;
  /** Dossier du média à l'intérieur de videos/hls/ (voir platform/storage/layout.ts). */
  storagePath: string;
  renditions: { name: string; height: number; videoKbps: number }[];
  /** `self` : fichiers chez nous (disque ou Bunny) ; `mux` : fichiers chez Mux. */
  provider: 'self' | 'mux';
  providerPlaybackId: string | null;
  providerPolicy: 'public' | 'signed' | null;
}

interface AssetRow {
  playback_id: string;
  program_slug: string;
  duration_seconds: string;
  storage_path: string;
  renditions: PlayableAsset['renditions'];
  provider: 'self' | 'mux';
  provider_playback_id: string | null;
  provider_policy: 'public' | 'signed' | null;
}

/** Retourne le média lisible d'un identifiant de lecture, ou null s'il n'est pas prêt. */
export async function findPlayableAsset(sql: Sql, playbackId: string): Promise<PlayableAsset | null> {
  const [row] = await sql<AssetRow[]>`
    SELECT playback_id, program_slug, duration_seconds::text, storage_path, renditions, provider, provider_playback_id, provider_policy
    FROM media_assets
    WHERE playback_id = ${playbackId} AND status = 'ready'`;
  if (!row) return null;
  return {
    playbackId: row.playback_id,
    programSlug: row.program_slug,
    durationSeconds: Number(row.duration_seconds),
    storagePath: row.storage_path,
    renditions: row.renditions,
    provider: row.provider,
    providerPlaybackId: row.provider_playback_id,
    providerPolicy: row.provider_policy,
  };
}
