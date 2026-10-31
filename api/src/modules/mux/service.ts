/**
 * Module « mux » — règles : faire passer une vidéo par Mux, du « j'envoie » au « lisible ».
 *
 *   1. `startUpload`  : demande à Mux une adresse d'envoi à usage limité, la rend au back-office (qui y envoie le fichier directement).
 *   2. `refresh`      : demande à Mux où en est l'envoi, puis la vidéo ; quand elle est prête, l'inscrit en base (elle devient lisible).
 *   3. le « poller »  : refait (2) régulièrement pour les envois actifs — pas besoin d'adresse publique ni de webhook pour démarrer.
 *
 * Toute étape est idempotente : l'appeler deux fois (poller + écran de suivi) ne casse rien.
 * Hypothèses NON confirmées par la documentation lue (statuts d'envoi exotiques, annulation) : traitées avec prudence.
 */
import { randomUUID } from 'node:crypto';
import type { Sql } from '../../platform/database/client.ts';
import { AppError } from '../../platform/errors.ts';
import type { Logger } from '../../platform/logger.ts';
import { registerAsset } from '../ingest/repository.ts';
import { MuxError, type MuxClient, type PlaybackPolicy, type VideoQuality } from './client.ts';
import * as repo from './repository.ts';
import type { MuxUploadRow } from './repository.ts';

export interface MuxServiceConfig {
  playbackPolicy: PlaybackPolicy;
  videoQuality: VideoQuality;
  normalizeAudio: boolean;
  /** Durée de validité de l'adresse d'envoi chez Mux (secondes, 60 à 604 800). */
  uploadTimeoutSeconds?: number;
}

export interface StartUploadInput {
  playbackId: string;
  programSlug: string;
  kind: 'film' | 'serie' | 'documentaire';
  title: string;
  isDemo: boolean;
  /** Origine du navigateur qui enverra le fichier (Mux n'autorise l'envoi que depuis cette origine). */
  corsOrigin: string;
  createdBy: string | null;
}

export type MuxService = ReturnType<typeof createMuxService>;

/** Statuts d'envoi/vidéo que Mux utilise pour dire « c'est fini mal ». Tout statut inconnu est traité comme « en cours » (jamais comme un succès). */
const UPLOAD_FAILED = new Set(['errored', 'timed_out']);
const UPLOAD_CANCELED = new Set(['cancelled', 'canceled']);

const toAppError = (error: unknown): AppError =>
  error instanceof AppError ? error : new AppError('unavailable', 503, error instanceof MuxError ? error.message : 'Mux est momentanément indisponible.');

export function createMuxService(deps: { sql: Sql; client: MuxClient; logger: Logger; config: MuxServiceConfig }) {
  const { sql, client, logger, config } = deps;

  async function finalize(row: MuxUploadRow, assetId: string): Promise<MuxUploadRow> {
    const asset = await client.getAsset(assetId);
    if (asset.status === 'errored') {
      await repo.finish(sql, row.id, 'failed', asset.errorMessage ?? 'Mux n’a pas pu préparer cette vidéo.');
      return (await repo.findUpload(sql, row.id)) ?? row;
    }
    if (asset.status !== 'ready') return row; // « preparing » (ou statut inconnu) : on attend

    const playback = asset.playbackIds.find(entry => entry.policy === config.playbackPolicy) ?? asset.playbackIds[0];
    if (!playback || (playback.policy !== 'public' && playback.policy !== 'signed')) {
      await repo.finish(sql, row.id, 'failed', 'Mux n’a fourni aucun lien de lecture exploitable pour cette vidéo.');
      return (await repo.findUpload(sql, row.id)) ?? row;
    }
    if (!asset.durationSeconds) {
      await repo.finish(sql, row.id, 'failed', 'Mux n’a pas indiqué la durée de la vidéo.');
      return (await repo.findUpload(sql, row.id)) ?? row;
    }

    await registerAsset(sql, {
      playbackId: row.playbackId,
      programSlug: row.programSlug,
      kind: row.kind,
      title: row.title,
      storagePath: playback.id, // information de rangement sans objet pour Mux ; l'identifiant de lecture Mux fait foi (provider_playback_id)
      durationSeconds: asset.durationSeconds,
      sourceWidth: null,
      sourceHeight: null,
      renditions: [],
      preset: null,
      encodeSeconds: null,
      encodedAt: new Date().toISOString(),
      isDemo: row.isDemo,
      publishNewProgram: false,
      provider: 'mux',
      providerAssetId: asset.id,
      providerPlaybackId: playback.id,
      providerPolicy: playback.policy,
    });
    await repo.finish(sql, row.id, 'ready', null);
    logger.info({ playbackId: row.playbackId, muxAssetId: asset.id }, 'vidéo Mux prête et inscrite');
    return (await repo.findUpload(sql, row.id)) ?? row;
  }

  const service = {
    async startUpload(input: StartUploadInput): Promise<{ upload: MuxUploadRow; uploadUrl: string }> {
      if ((await repo.listUploads(sql, 1, { playbackId: input.playbackId })).some(item => item.status === 'waiting' || item.status === 'processing')
        || (await repo.hasActiveEncodeJob(sql, input.playbackId))) {
        throw new AppError('conflict', 409, 'Une préparation est déjà en cours pour ce contenu.');
      }
      try {
        const created = await client.createDirectUpload({
          corsOrigin: input.corsOrigin,
          passthrough: input.playbackId,
          playbackPolicy: config.playbackPolicy,
          videoQuality: config.videoQuality,
          normalizeAudio: config.normalizeAudio,
          timeoutSeconds: config.uploadTimeoutSeconds ?? 3600,
        });
        const upload = await repo.insertUpload(sql, {
          id: randomUUID(), muxUploadId: created.id, playbackId: input.playbackId, programSlug: input.programSlug,
          kind: input.kind, title: input.title, isDemo: input.isDemo, createdBy: input.createdBy,
        });
        return { upload, uploadUrl: created.url as string };
      } catch (error) {
        logger.error({ err: error, playbackId: input.playbackId }, 'création de l’envoi Mux impossible');
        throw toAppError(error);
      }
    },

    /** Fait avancer un envoi : demande l'état à Mux et met la base à jour. Sans effet s'il est déjà terminé. */
    async refresh(row: MuxUploadRow): Promise<MuxUploadRow> {
      if (row.status !== 'waiting' && row.status !== 'processing') return row;
      try {
        const upload = await client.getUpload(row.muxUploadId);
        const assetId = upload.assetId ?? row.muxAssetId;
        if (!assetId) {
          if (UPLOAD_CANCELED.has(upload.status)) await repo.finish(sql, row.id, 'canceled', null);
          else if (UPLOAD_FAILED.has(upload.status)) {
            await repo.finish(sql, row.id, 'failed',
              upload.status === 'timed_out' ? 'L’envoi n’a pas été terminé à temps (l’adresse d’envoi a expiré). Recommencez.' : (upload.error ?? 'Mux a signalé une erreur pendant l’envoi.'));
          } else if (upload.status !== 'waiting') {
            logger.warn({ playbackId: row.playbackId, muxStatus: upload.status }, 'statut d’envoi Mux inconnu : on attend');
          }
          return (await repo.findUpload(sql, row.id)) ?? row;
        }
        if (row.muxAssetId !== assetId || row.status === 'waiting') await repo.setProcessing(sql, row.id, assetId);
        return await finalize({ ...row, muxAssetId: assetId, status: 'processing' }, assetId);
      } catch (error) {
        // Une panne passagère de Mux n'est pas un échec de la vidéo : on réessaiera au prochain passage.
        logger.warn({ err: error, playbackId: row.playbackId }, 'état Mux indisponible : nouvel essai plus tard');
        return row;
      }
    },

    async refreshActive(): Promise<number> {
      const active = await repo.listActiveUploads(sql);
      for (const row of active) {
        await service.refresh(row);
        await new Promise(resolve => setTimeout(resolve, 250)); // reste très en dessous des limites d'appels de Mux
      }
      return active.length;
    },

    async cancel(id: string): Promise<boolean> {
      const row = await repo.findUpload(sql, id);
      if (!row || (row.status !== 'waiting' && row.status !== 'processing')) return false;
      await client.cancelUpload(row.muxUploadId).catch(error => logger.warn({ err: error }, 'annulation côté Mux impossible (non bloquant)'));
      if (row.muxAssetId) await client.deleteAsset(row.muxAssetId).catch(error => logger.warn({ err: error }, 'suppression côté Mux impossible (non bloquant)'));
      return repo.finish(sql, id, 'canceled', null);
    },

    get: (id: string) => repo.findUpload(sql, id),
    list: (limit: number, filter: { playbackId?: string; programSlug?: string } = {}) => repo.listUploads(sql, limit, filter),
  };
  return service;
}

/** Actualise périodiquement les envois actifs. Retourne la fonction d'arrêt. */
export function startMuxPoller(service: MuxService, logger: Logger, intervalMs = 10_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return; // un passage lent ne se superpose pas au suivant
    running = true;
    service.refreshActive().catch(error => logger.error({ err: error }, 'actualisation des envois Mux impossible')).finally(() => { running = false; });
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
