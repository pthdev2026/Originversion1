/**
 * Livraison : comment fabriquer les URLs signées que reçoit le lecteur.
 *
 * Deux façons, une seule interface (`DeliverySigner`) :
 *  - « origin » : l'API sert elle-même les fichiers (développement, petite échelle) ;
 *  - « bunny »  : les fichiers sont servis par le CDN, qui vérifie lui-même le jeton.
 * Le service de lecture ne sait pas laquelle est utilisée : changer de mode = changer la configuration.
 */
import { bunnySignedUrl } from '../media/bunny-token.ts';
import { createMediaToken } from '../media/token.ts';

export interface DeliveryAsset {
  playbackId: string;
  /** Chemin relatif du média dans le stockage (`<playbackId>` ou `<playbackId>/<version>`). */
  storagePath: string;
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
