/** Module « mux » — fabrique les adresses de lecture d'un média hébergé chez Mux (voir `playback/delivery.ts`). */
import { createPrivateKey } from 'node:crypto';
import { AppError } from '../../platform/errors.ts';
import type { DeliverySigner } from '../playback/delivery.ts';
import { loadPrivateKey, signMuxToken } from './jwt.ts';

export function createMuxSigner(options: { ttlSeconds: number; signing?: { keyId: string; privateKey: string } | null }): DeliverySigner {
  const key: ReturnType<typeof createPrivateKey> | null = options.signing ? loadPrivateKey(options.signing.privateKey) : null;
  return {
    sign(asset, context) {
      const playbackId = asset.providerPlaybackId;
      if (!playbackId) throw new AppError('unavailable', 503, 'Ce média Mux n’a pas d’identifiant de lecture.');
      const now = context.now ?? Date.now();
      const manifest = `https://stream.mux.com/${playbackId}.m3u8`;
      const poster = `https://image.mux.com/${playbackId}/thumbnail.jpg`;

      if (asset.providerPolicy !== 'signed') {
        // Lien public : aucune expiration côté Mux. On indique tout de même l'échéance habituelle au lecteur (il redemande un lien ensuite).
        return { manifestUrl: manifest, posterUrl: poster, expiresAt: new Date(now + options.ttlSeconds * 1000) };
      }
      if (!key || !options.signing) {
        throw new AppError('unavailable', 503, 'Lecture sécurisée Mux non configurée (MUX_SIGNING_KEY_ID et MUX_SIGNING_PRIVATE_KEY).');
      }
      // Mux exige que le jeton dure PLUS longtemps que la vidéo : on garde la durée habituelle, ou la durée du film + 1 h si c'est plus long.
      const lifetime = Math.max(options.ttlSeconds, Math.ceil((asset.durationSeconds ?? 0) + 3600));
      const expires = Math.floor(now / 1000) + lifetime;
      const token = (audience: 'v' | 't') => signMuxToken({ key, keyId: options.signing!.keyId, playbackId, audience, expiresAtSeconds: expires });
      return {
        manifestUrl: `${manifest}?token=${token('v')}`,
        posterUrl: `${poster}?token=${token('t')}`,
        expiresAt: new Date(expires * 1000),
      };
    },
  };
}
