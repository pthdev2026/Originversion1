// Client de l'API ORIGIN. Les réponses sont typées ; aucune donnée n'est simulée.
import { env } from '@/lib/env';

export interface PlaybackRendition {
  name: string;
  height: number;
  videoKbps: number;
}

/** Piste de sous-titres WebVTT fournie par l'API (tableau vide s'il n'y en a pas). */
export interface SubtitleTrack {
  lang: string;
  label: string;
  default: boolean;
  /** Absolue : à donner telle quelle à <track src>. */
  url: string;
}

export interface PlaybackInfo {
  programId: string;
  status: 'ready';
  /** Opaque : ne jamais construire ni analyser. Valable jusqu'à `expiresAt`. */
  manifestUrl: string;
  /** Opaque, comme `manifestUrl`. Peut être vide. */
  posterUrl: string;
  durationSeconds: number;
  renditions: PlaybackRendition[];
  subtitles: SubtitleTrack[];
  expiresAt: string;
  /** Où reprendre (compte connecté, contenu commencé et non terminé) ; `null` sinon. */
  resume: { positionSeconds: number } | null;
  /** Autorisation de mesure (contrat v1.15) : un identifiant de session et son jeton, émis avec la lecture. `null` si le serveur n'en fournit pas. */
  analytics: { sessionId: string; token: string } | null;
}

export type PlaybackErrorReason = 'network' | 'server' | 'invalid' | 'forbidden' | 'not_configured';

export type PlaybackResult =
  | { status: 'ready'; info: PlaybackInfo; fetchMs: number }
  | { status: 'unavailable' }
  | { status: 'error'; reason: PlaybackErrorReason };

const REQUEST_TIMEOUT_MS = 10_000;
/** Marge avant `expiresAt` : on redemande plutôt que de tomber sur un 403 en cours de lecture. */
const EXPIRY_MARGIN_MS = 15_000;

/** Vrai si le lien de lecture est expiré (ou le sera dans la marge). Une date illisible n'expire jamais. */
export function isExpired(info: Pick<PlaybackInfo, 'expiresAt'>, now: number = Date.now()): boolean {
  const expiresAt = Date.parse(info.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt - EXPIRY_MARGIN_MS <= now;
}

function parseResume(value: unknown): PlaybackInfo['resume'] {
  if (typeof value !== 'object' || value === null) return null;
  const position = (value as Record<string, unknown>)['positionSeconds'];
  return typeof position === 'number' && Number.isFinite(position) && position > 0 ? { positionSeconds: position } : null;
}

function parseAnalytics(value: unknown): PlaybackInfo['analytics'] {
  if (typeof value !== 'object' || value === null) return null;
  const data = value as Record<string, unknown>;
  return typeof data['sessionId'] === 'string' && typeof data['token'] === 'string' && data['sessionId'] !== '' && data['token'] !== ''
    ? { sessionId: data['sessionId'], token: data['token'] } : null;
}

function parseSubtitles(value: unknown): SubtitleTrack[] {
  if (!Array.isArray(value)) return [];
  const tracks: SubtitleTrack[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const track = item as Record<string, unknown>;
    if (typeof track['lang'] !== 'string' || typeof track['url'] !== 'string' || track['url'] === '') continue;
    tracks.push({ lang: track['lang'], label: typeof track['label'] === 'string' ? track['label'] : track['lang'], default: track['default'] === true, url: track['url'] });
  }
  return tracks;
}

function parsePlayback(payload: unknown): PlaybackInfo | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const data = payload as Record<string, unknown>;
  if (typeof data['manifestUrl'] !== 'string' || data['manifestUrl'] === '') return null;
  if (typeof data['expiresAt'] !== 'string') return null;
  const duration = typeof data['durationSeconds'] === 'number' && Number.isFinite(data['durationSeconds']) ? data['durationSeconds'] : 0;
  return {
    programId: typeof data['programId'] === 'string' ? data['programId'] : '',
    status: 'ready',
    manifestUrl: data['manifestUrl'],
    posterUrl: typeof data['posterUrl'] === 'string' ? data['posterUrl'] : '',
    durationSeconds: duration,
    renditions: Array.isArray(data['renditions']) ? (data['renditions'] as PlaybackRendition[]) : [],
    subtitles: parseSubtitles(data['subtitles']),
    expiresAt: data['expiresAt'],
    resume: parseResume(data['resume']),
    analytics: parseAnalytics(data['analytics']),
  };
}

export async function fetchPlayback(programId: string, signal?: AbortSignal): Promise<PlaybackResult> {
  if (!env.apiUrl) return { status: 'error', reason: 'not_configured' };

  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  const startedAt = performance.now();

  try {
    const response = await fetch(`${env.apiUrl}/api/programs/${encodeURIComponent(programId)}/playback`, { signal: controller.signal, credentials: 'include' });
    if (response.status === 404) return { status: 'unavailable' };
    if (response.status === 403) return { status: 'error', reason: 'forbidden' };
    if (!response.ok) return { status: 'error', reason: 'server' };
    const info = parsePlayback(await response.json());
    if (!info) return { status: 'error', reason: 'invalid' };
    return { status: 'ready', info, fetchMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: 'error', reason: timedOut ? 'network' : error instanceof SyntaxError ? 'invalid' : 'network' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Identifiant de programme côté API pour un contenu du front.
 * Les films et documentaires (entrée unique « feature ») utilisent le slug ;
 * les épisodes de série utilisent « <slug>-<episode> ».
 */
export function playbackProgramId(slug: string, episodeId: string): string {
  return episodeId === 'feature' ? slug : `${slug}-${episodeId}`;
}
