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
  /**
   * Si le programme n'existe pas encore, doit-il naître PUBLIÉ ? Vrai par défaut (outils de développement et tests).
   * Le pipeline d'administration (encodage, Mux) passe `false` : un envoi vidéo ne publie jamais seul un programme que personne n'a créé ;
   * la publication reste une décision éditoriale (règle de publication du 30/10). Un programme déjà présent n'est jamais modifié.
   */
  publishNewProgram?: boolean;
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
      INSERT INTO programs (slug, kind, title, is_demo, published)
      VALUES (${input.programSlug}, ${input.kind}, ${input.title}, ${input.isDemo}, ${input.publishNewProgram ?? true})
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
  /** Repères éditoriaux (secondes) ; `null` = non renseigné. */
  markers: Markers;
}

export interface Markers {
  introStartSeconds: number | null;
  introEndSeconds: number | null;
  creditsStartSeconds: number | null;
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
  intro_start_seconds: string | null;
  intro_end_seconds: string | null;
  credits_start_seconds: string | null;
}

const num = (value: string | null): number | null => (value === null ? null : Number(value));

/** Retourne le média lisible d'un identifiant de lecture, ou null s'il n'est pas prêt. */
export async function findPlayableAsset(sql: Sql, playbackId: string): Promise<PlayableAsset | null> {
  const [row] = await sql<AssetRow[]>`
    SELECT playback_id, program_slug, duration_seconds::text, storage_path, renditions, provider, provider_playback_id, provider_policy,
           intro_start_seconds::text, intro_end_seconds::text, credits_start_seconds::text
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
    markers: { introStartSeconds: num(row.intro_start_seconds), introEndSeconds: num(row.intro_end_seconds), creditsStartSeconds: num(row.credits_start_seconds) },
  };
}

/** Enregistre les repères d'un média (tout `null` = les effacer). `false` si le média n'existe pas. */
export async function setMarkers(sql: Sql, playbackId: string, markers: Markers): Promise<boolean> {
  const rows = await sql`
    UPDATE media_assets SET intro_start_seconds = ${markers.introStartSeconds}, intro_end_seconds = ${markers.introEndSeconds},
                            credits_start_seconds = ${markers.creditsStartSeconds}, updated_at = now()
    WHERE playback_id = ${playbackId} RETURNING playback_id`;
  return rows.length > 0;
}

export interface PlayableEpisode { playbackId: string; season: number; number: number; title: string }

/** Épisodes d'une série qui ont un média prêt, dans l'ordre de lecture (saison puis numéro). */
export async function listPlayableEpisodes(sql: Sql, programSlug: string): Promise<PlayableEpisode[]> {
  const rows = await sql<{ playback_id: string; season_number: number; number: number; title: string }[]>`
    SELECT m.playback_id, e.season_number, e.number, e.title
    FROM episodes e JOIN media_assets m ON m.playback_id = e.program_slug || '-' || e.key AND m.status = 'ready'
    WHERE e.program_slug = ${programSlug}
    ORDER BY e.season_number, e.number`;
  return rows.map(row => ({ playbackId: row.playback_id, season: row.season_number, number: row.number, title: row.title }));
}

export interface ContentInfo {
  programSlug: string;
  programTitle: string;
  kind: 'film' | 'serie' | 'documentaire';
  published: boolean;
  /** Renseigné pour un épisode de série. */
  episode: { season: number; number: number; title: string } | null;
}

/** Programme (et épisode éventuel) derrière un identifiant de lecture. */
export async function describeContent(sql: Sql, playbackId: string): Promise<ContentInfo | null> {
  const [row] = await sql<{ slug: string; title: string; kind: ContentInfo['kind']; published: boolean; season_number: number | null; number: number | null; episode_title: string | null }[]>`
    SELECT p.slug, p.title, p.kind, p.published, e.season_number, e.number, e.title AS episode_title
    FROM media_assets m JOIN programs p ON p.slug = m.program_slug
    LEFT JOIN episodes e ON e.program_slug = p.slug AND m.playback_id = e.program_slug || '-' || e.key
    WHERE m.playback_id = ${playbackId}`;
  if (!row) return null;
  return {
    programSlug: row.slug, programTitle: row.title, kind: row.kind, published: row.published,
    episode: row.season_number !== null && row.number !== null && row.episode_title !== null ? { season: row.season_number, number: row.number, title: row.episode_title } : null,
  };
}

/** Fiche minimale d'un programme (existe, publié, type) pour décider quoi lancer. */
export async function describeProgram(sql: Sql, slug: string): Promise<{ kind: ContentInfo['kind']; title: string } | null> {
  const [row] = await sql<{ kind: ContentInfo['kind']; title: string }[]>`SELECT kind, title FROM programs WHERE slug = ${slug} AND published AND kind <> 'brand'`;
  return row ?? null;
}
