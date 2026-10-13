/**
 * Module « playback » — règles métier.
 *
 * Le service orchestre : « trouver le média, vérifier qu'il est lisible, fabriquer l'URL signée ».
 * Il ne connaît ni HTTP (pas de Context Hono) ni SQL (il passe par le repository).
 * C'est ce qui le rend simple à tester et à réutiliser (futur droit d'accès par compte, par exemple).
 */
import type { Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';
import { isValidId } from '../../platform/storage/layout.ts';
import { createMediaToken } from '../media/token.ts';
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

export interface PlaybackServiceConfig {
  mediaSecret: string;
  ttlSeconds: number;
}

export async function createPlaybackSession(
  sql: Sql,
  config: PlaybackServiceConfig,
  playbackId: string,
  publicOrigin: string,
): Promise<PlaybackSession> {
  const asset = isValidId(playbackId) ? await findPlayableAsset(sql, playbackId) : null;
  if (!asset) throw errors.notAvailable();

  const { token, expiresAt } = createMediaToken(config.mediaSecret, asset.playbackId, config.ttlSeconds);
  // Le jeton est dans le CHEMIN (pas dans la query) : les playlists HLS utilisent des URLs relatives
  // qui héritent ainsi automatiquement de l'autorisation.
  const base = `${publicOrigin}/media/${token}/${asset.playbackId}`;

  return {
    programId: asset.playbackId,
    status: 'ready',
    manifestUrl: `${base}/master.m3u8`,
    posterUrl: `${base}/poster.jpg`,
    durationSeconds: asset.durationSeconds,
    renditions: asset.renditions,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}
