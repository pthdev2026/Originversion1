/**
 * Module « mux » — client de l'API Mux Video (HTTPS + JSON, sans SDK).
 *
 * Principes :
 *  - authentification HTTP Basic (identifiant du jeton + secret) : le secret ne sort JAMAIS de ce fichier
 *    (ni dans les messages d'erreur, ni dans les journaux) ;
 *  - on n'envoie que des champs CONFIRMÉS par la documentation officielle ; le reste est lu de façon défensive ;
 *  - 429 et erreurs 5xx sont réessayés avec un délai croissant ; les autres erreurs 4xx ne le sont jamais.
 *  Les hypothèses non confirmées (statuts d'envoi exotiques, annulation) sont isolées ici et dans `service.ts`.
 */
export class MuxError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'MuxError';
    this.status = status;
  }
}

export type PlaybackPolicy = 'public' | 'signed';
export type VideoQuality = 'basic' | 'plus' | 'premium';

export interface MuxClientOptions {
  tokenId: string;
  tokenSecret: string;
  baseUrl?: string;
  /** Injectable pour les tests. */
  fetch?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
}

export interface MuxUpload {
  id: string;
  /** Adresse d'envoi à usage limité : à donner au navigateur, jamais à conserver. */
  url: string | null;
  status: string;
  assetId: string | null;
  error: string | null;
}

export interface MuxAsset {
  id: string;
  status: string;
  durationSeconds: number | null;
  playbackIds: { id: string; policy: string }[];
  errorMessage: string | null;
}

export interface MuxClient {
  createDirectUpload(input: {
    corsOrigin: string;
    passthrough: string;
    playbackPolicy: PlaybackPolicy;
    videoQuality: VideoQuality;
    normalizeAudio: boolean;
    timeoutSeconds: number;
  }): Promise<MuxUpload>;
  getUpload(uploadId: string): Promise<MuxUpload>;
  getAsset(assetId: string): Promise<MuxAsset>;
  cancelUpload(uploadId: string): Promise<void>;
  deleteAsset(assetId: string): Promise<void>;
}

const asRecord = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {});
const asString = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

/** Message d'erreur lisible extrait d'une réponse d'erreur Mux, sans jamais répéter de secret. */
function errorDetail(body: unknown): string | null {
  const root = asRecord(body);
  const error = asRecord(root['error']);
  const messages = Array.isArray(error['messages']) ? error['messages'].filter((m): m is string => typeof m === 'string') : [];
  const list = Array.isArray(root['errors']) ? root['errors'].filter((m): m is string => typeof m === 'string') : [];
  const text = [...messages, ...list].join(' ; ') || asString(error['message']) || null;
  return text ? text.slice(0, 200) : null;
}

export function createMuxClient(options: MuxClientOptions): MuxClient {
  const base = (options.baseUrl ?? 'https://api.mux.com').replace(/\/$/, '');
  const doFetch = options.fetch ?? fetch;
  const retries = options.retries ?? 3;
  const authorization = `Basic ${Buffer.from(`${options.tokenId}:${options.tokenSecret}`).toString('base64')}`;

  async function request(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<Record<string, unknown>> {
    let last: MuxError = new MuxError('Mux injoignable.');
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const response = await doFetch(`${base}${path}`, {
          method,
          headers: { Authorization: authorization, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
        });
        if (response.status === 401 || response.status === 403) {
          throw new MuxError('Mux a refusé l’accès : vérifiez MUX_TOKEN_ID et MUX_TOKEN_SECRET (droits « Mux Video » en lecture et écriture, bon environnement).', response.status);
        }
        const text = await response.text();
        let parsed: unknown = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { /* corps non JSON : géré ci-dessous */ }
        if (response.status === 429 || response.status >= 500) {
          last = new MuxError(`Mux est momentanément indisponible (HTTP ${response.status}).`, response.status);
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
            continue;
          }
          throw last;
        }
        if (!response.ok) {
          throw new MuxError(`Mux a refusé la demande (HTTP ${response.status})${errorDetail(parsed) ? ` : ${errorDetail(parsed)}` : '.'}`, response.status);
        }
        return asRecord(parsed);
      } catch (error) {
        if (error instanceof MuxError && error.status !== null && error.status < 500 && error.status !== 429) throw error; // refus définitif
        last = error instanceof MuxError ? error : new MuxError('Mux injoignable (réseau ou délai dépassé).');
        if (attempt >= retries) throw last;
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
      }
    }
    throw last;
  }

  const toUpload = (raw: Record<string, unknown>): MuxUpload => {
    const data = asRecord(raw['data']);
    const id = asString(data['id']);
    if (!id) throw new MuxError('Réponse inattendue de Mux (identifiant d’envoi absent).');
    const error = asRecord(data['error']);
    return {
      id,
      url: asString(data['url']),
      status: asString(data['status']) ?? 'unknown',
      assetId: asString(data['asset_id']),
      error: asString(error['message']) ?? asString(error['type']),
    };
  };

  const toAsset = (raw: Record<string, unknown>): MuxAsset => {
    const data = asRecord(raw['data']);
    const id = asString(data['id']);
    if (!id) throw new MuxError('Réponse inattendue de Mux (identifiant de vidéo absent).');
    const duration = Number(data['duration']);
    const errors = asRecord(data['errors']);
    const messages = Array.isArray(errors['messages']) ? errors['messages'].filter((m): m is string => typeof m === 'string') : [];
    return {
      id,
      status: asString(data['status']) ?? 'unknown',
      durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
      playbackIds: (Array.isArray(data['playback_ids']) ? data['playback_ids'] : []).flatMap(entry => {
        const item = asRecord(entry);
        const playbackId = asString(item['id']);
        return playbackId ? [{ id: playbackId, policy: asString(item['policy']) ?? 'public' }] : [];
      }),
      errorMessage: messages.length > 0 ? messages.join(' ; ').slice(0, 200) : asString(errors['type']),
    };
  };

  return {
    async createDirectUpload(input) {
      const raw = await request('POST', '/video/v1/uploads', {
        cors_origin: input.corsOrigin,
        timeout: input.timeoutSeconds,
        new_asset_settings: {
          playback_policies: [input.playbackPolicy],
          video_quality: input.videoQuality,
          passthrough: input.passthrough.slice(0, 255),
          // `normalize_audio` n'est confirmé que pour la création d'asset : on ne l'envoie que si on le demande explicitement.
          ...(input.normalizeAudio ? { normalize_audio: true } : {}),
        },
      });
      const upload = toUpload(raw);
      if (!upload.url) throw new MuxError('Réponse inattendue de Mux (adresse d’envoi absente).');
      return upload;
    },
    async getUpload(uploadId) {
      return toUpload(await request('GET', `/video/v1/uploads/${encodeURIComponent(uploadId)}`));
    },
    async getAsset(assetId) {
      return toAsset(await request('GET', `/video/v1/assets/${encodeURIComponent(assetId)}`));
    },
    async cancelUpload(uploadId) {
      // Chemin d'annulation non confirmé par la documentation lue : l'appelant tolère l'échec.
      await request('PUT', `/video/v1/uploads/${encodeURIComponent(uploadId)}/cancel`);
    },
    async deleteAsset(assetId) {
      await request('DELETE', `/video/v1/assets/${encodeURIComponent(assetId)}`);
    },
  };
}
