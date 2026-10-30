/**
 * Livraison : comment fabriquer les URLs signées que reçoit le lecteur.
 *
 * Deux façons, une seule interface (`DeliverySigner`) :
 *  - « origin » : l'API sert elle-même les fichiers (développement, petite échelle) ;
 *  - « bunny »  : les fichiers sont servis par le CDN, qui vérifie lui-même le jeton.
 * Le service de lecture ne sait pas laquelle est utilisée : changer de mode = changer la configuration.
 */
import { AppError } from '../../platform/errors.ts';
import { bunnySignedUrl } from '../media/bunny-token.ts';
import { createMediaToken } from '../media/token.ts';

export interface DeliveryAsset {
  playbackId: string;
  /** Chemin relatif du média dans le stockage (`<playbackId>` ou `<playbackId>/<version>`). */
  storagePath: string;
  /** Qui possède les fichiers : notre pipeline (`self`, défaut) ou Mux. */
  provider?: 'self' | 'mux';
  /** Média Mux : identifiant de lecture Mux et politique d'accès fixée à la création. */
  providerPlaybackId?: string | null;
  providerPolicy?: 'public' | 'signed' | null;
  /** Durée du média (un jeton Mux signé doit durer plus longtemps que la vidéo). */
  durationSeconds?: number;
}

export interface SignedDelivery {
  manifestUrl: string;
  posterUrl: string;
  expiresAt: Date;
}

export interface DeliverySigner {
  sign(asset: DeliveryAsset, context: { publicOrigin: string; now?: number }): SignedDelivery;
}

export function createOriginSigner(options: { secret: string; ttlSeconds: number }): DeliverySigner {
  return {
    sign(asset, context) {
      const { token, expiresAt } = createMediaToken(options.secret, asset.playbackId, options.ttlSeconds, context.now);
      // Le jeton est dans le CHEMIN : les URLs relatives des playlists en héritent.
      const base = `${context.publicOrigin}/media/${token}/${asset.playbackId}`;
      return { manifestUrl: `${base}/master.m3u8`, posterUrl: `${base}/poster.jpg`, expiresAt: new Date(expiresAt * 1000) };
    },
  };
}

/** Préfixe des rendus dans la zone de stockage Bunny (voir BunnyMediaStore). */
export const BUNNY_HLS_PREFIX = 'hls';

export function createBunnySigner(options: { cdnUrl: string; tokenKey: string; ttlSeconds: number }): DeliverySigner {
  return {
    sign(asset, context) {
      const now = context.now ?? Date.now();
      const expires = Math.floor(now / 1000) + options.ttlSeconds;
      const directory = `/${BUNNY_HLS_PREFIX}/${asset.storagePath}/`;
      const tokenOptions = { cdnUrl: options.cdnUrl.replace(/\/$/, ''), tokenKey: options.tokenKey };
      return {
        manifestUrl: bunnySignedUrl(tokenOptions, directory, 'master.m3u8', expires),
        posterUrl: bunnySignedUrl(tokenOptions, directory, 'poster.jpg', expires),
        expiresAt: new Date(expires * 1000),
      };
    },
  };
}

/**
 * Choisit le signataire selon qui possède le média : `self` → notre mode de diffusion (origine ou Bunny), `mux` → Mux.
 * Le service de lecture ne sait pas lequel est utilisé : une vidéo Mux et une vidéo Bunny cohabitent.
 */
export function createRoutingSigner(signers: { self: DeliverySigner; mux?: DeliverySigner | null }): DeliverySigner {
  return {
    sign(asset, context) {
      if (asset.provider === 'mux') {
        if (!signers.mux) throw new AppError('unavailable', 503, 'La diffusion Mux n’est pas configurée sur ce serveur.');
        return signers.mux.sign(asset, context);
      }
      return signers.self.sign(asset, context);
    },
  };
}
