/**
 * Module « playback » — règles métier.
 *
 * Le service orchestre : « trouver le média, vérifier qu'il est lisible, fabriquer l'URL signée ».
 * Il ne connaît ni HTTP (pas de Context Hono) ni SQL (il passe par le repository), ni la façon de signer
 * (origine ou CDN : c'est le `DeliverySigner` qui le sait).
 */
import type { Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';
import { isValidId } from '../../platform/storage/layout.ts';
import type { DeliverySigner } from './delivery.ts';
import { findPlayableAsset } from './repository.ts';

export interface PlaybackSession {
  programId: string;
  status: 'ready';
  manifestUrl: string;
  posterUrl: string;
  durationSeconds: number;
  renditions: { name: string; height: number; videoKbps: number }[];
  expiresAt: string;
}

export async function createPlaybackSession(
  sql: Sql,
  signer: DeliverySigner,
  playbackId: string,
  publicOrigin: string,
): Promise<PlaybackSession> {
  const asset = isValidId(playbackId) ? await findPlayableAsset(sql, playbackId) : null;
  if (!asset) throw errors.notAvailable();

  const signed = signer.sign({ playbackId: asset.playbackId, storagePath: asset.storagePath }, { publicOrigin });
  return {
    programId: asset.playbackId,
    status: 'ready',
    manifestUrl: signed.manifestUrl,
    posterUrl: signed.posterUrl,
    durationSeconds: asset.durationSeconds,
    renditions: asset.renditions,
    expiresAt: signed.expiresAt.toISOString(),
  };
}
