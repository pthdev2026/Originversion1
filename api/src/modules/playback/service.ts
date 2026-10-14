/**
 * Module « playback » — règles métier.
 *
 * Le service orchestre : « trouver le média, vérifier qu'il est lisible, décider de l'ident de marque, fabriquer
 * les URLs signées ». Il ne connaît ni HTTP, ni SQL (repository), ni la façon de signer (DeliverySigner).
 */
import type { Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';
import { isValidId } from '../../platform/storage/layout.ts';
import { findProgress, hasProgressInProgram, hasProgressInSeason } from '../progress/repository.ts';
import type { DeliverySigner } from './delivery.ts';
import { decideIdent, parsePlaybackId, type IdentPolicy, type IdentReason } from './ident-policy.ts';
import { findPlayableAsset } from './repository.ts';

export interface IdentSession {
  /** Faut-il jouer l'ident avant le programme ? Le front suit cette valeur sans la réinterpréter. */
  show: boolean;
  reason: IdentReason;
  manifestUrl: string | null;
  durationSeconds: number | null;
  /** Secondes après lesquelles le spectateur peut passer l'ident (null = non passable). */
  skippableAfterSeconds: number | null;
}

export interface PlaybackSession {
  programId: string;
  status: 'ready';
  manifestUrl: string;
  posterUrl: string;
  durationSeconds: number;
  renditions: { name: string; height: number; videoKbps: number }[];
  expiresAt: string;
  ident: IdentSession;
}

export interface IdentConfig {
  policy: IdentPolicy;
  playbackId: string;
  skippableAfterSeconds: number;
}

export interface PlaybackContext {
  /** Compte connecté, ou null (visiteur anonyme). */
  userId: string | null;
  publicOrigin: string;
  /** Le navigateur a déjà joué l'ident pour ce titre. */
  identSeen: boolean;
  /** L'épisode est enchaîné automatiquement après le précédent. */
  autoplayNext: boolean;
}

export async function createPlaybackSession(
  sql: Sql,
  signer: DeliverySigner,
  ident: IdentConfig,
  playbackId: string,
  context: PlaybackContext,
): Promise<PlaybackSession> {
  const asset = isValidId(playbackId) ? await findPlayableAsset(sql, playbackId) : null;
  if (!asset) throw errors.notAvailable();

  const signed = signer.sign({ playbackId: asset.playbackId, storagePath: asset.storagePath }, { publicOrigin: context.publicOrigin });

  // --- Ident de marque -----------------------------------------------------------------------------------
  const identAsset = ident.policy === 'off' || asset.playbackId === ident.playbackId ? null : await findPlayableAsset(sql, ident.playbackId);
  let hasProgressInTitle = false;
  let hasProgressInSeasonValue = false;
  let resumeSeconds = 0;
  if (context.userId) {
    const season = parsePlaybackId(asset.playbackId).seasonPrefix;
    hasProgressInTitle = await hasProgressInProgram(sql, context.userId, asset.programSlug);
    hasProgressInSeasonValue = season ? await hasProgressInSeason(sql, context.userId, season) : hasProgressInTitle;
    const progress = await findProgress(sql, context.userId, asset.playbackId);
    resumeSeconds = progress && !progress.completed ? progress.positionSeconds : 0;
  }
  const decision = decideIdent({
    policy: ident.policy,
    identAvailable: identAsset !== null,
    isBrandAsset: asset.playbackId === ident.playbackId,
    hasProgressInTitle,
    hasProgressInSeason: hasProgressInSeasonValue,
    resumeSeconds,
    clientSeen: context.identSeen,
    autoplayNext: context.autoplayNext,
  });
  const identSigned = decision.show && identAsset
    ? signer.sign({ playbackId: identAsset.playbackId, storagePath: identAsset.storagePath }, { publicOrigin: context.publicOrigin })
    : null;

  return {
    programId: asset.playbackId,
    status: 'ready',
    manifestUrl: signed.manifestUrl,
    posterUrl: signed.posterUrl,
    durationSeconds: asset.durationSeconds,
    renditions: asset.renditions,
    expiresAt: signed.expiresAt.toISOString(),
    ident: {
      show: decision.show,
      reason: decision.reason,
      manifestUrl: identSigned?.manifestUrl ?? null,
      durationSeconds: decision.show && identAsset ? identAsset.durationSeconds : null,
      skippableAfterSeconds: decision.show ? ident.skippableAfterSeconds : null,
    },
  };
}
