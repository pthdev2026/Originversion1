import { api, ApiError } from '@/lib/api';
import { env } from '@/lib/env';
import { refreshContinue } from '@/features/account/session/continue-store';

/**
 * Enregistre RÉELLEMENT la progression de lecture (PUT /api/me/progress/:playbackId) — aucun second mécanisme dans le navigateur.
 *  - toutes les 12 s pendant la lecture, à la pause, après un saut, à la fin du programme ;
 *  - à la fermeture de la page / mise en arrière-plan : requête `keepalive` (elle survit au déchargement) ;
 *  - à la sortie du lecteur (démontage) ;
 *  - ordre : un horodatage `sentAt` strictement croissant et une file d'envoi → jamais d'écriture « dans le mauvais ordre » ;
 *  - 401 (session expirée) : l'envoi s'arrête proprement ; erreur réseau : le prochain envoi réessaie avec la position du moment.
 */
export const REPORT_EVERY_MS = 12_000;
const MIN_POSITION_SECONDS = 1;
const SEEK_DEBOUNCE_MS = 800;
const REFRESH_EVERY_MS = 10_000;

export interface ReporterOptions {
  /** Durée annoncée par le serveur, si le lecteur ne la connaît pas encore. */
  fallbackDuration: number;
}

export function startProgressReporting(video: HTMLVideoElement, playbackId: string, options: ReporterOptions): () => void {
  let lastSentAt = 0;
  let disabled = false;
  let queue: Promise<void> = Promise.resolve();
  let lastRefresh = 0;
  let seekTimer: number | undefined;
  let known = 0;                                   // dernière position lue (currentTime retombe à 0 quand le lecteur est démonté)
  const onTime = () => { if (video.currentTime >= MIN_POSITION_SECONDS) known = video.currentTime; };
  const path = `/api/me/progress/${encodeURIComponent(playbackId)}`;

  const snapshot = (): { positionSeconds: number; durationSeconds: number } | null => {
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : options.fallbackDuration;
    const position = video.ended ? duration : video.currentTime >= MIN_POSITION_SECONDS ? video.currentTime : known;
    if (!Number.isFinite(position) || position < MIN_POSITION_SECONDS) return null;   // pas encore vraiment commencé : on n'écrase rien
    return { positionSeconds: Math.round(Math.min(position, duration) * 10) / 10, durationSeconds: duration > 0 ? Math.round(duration * 10) / 10 : options.fallbackDuration };
  };
  const stamp = () => { lastSentAt = Math.max(Date.now(), lastSentAt + 1); return lastSentAt; };
  const afterSaved = (force: boolean) => {
    const now = Date.now();
    if (force || now - lastRefresh > REFRESH_EVERY_MS) { lastRefresh = now; void refreshContinue(); }
  };

  /** Envoi ordinaire : file d'attente (jamais deux envois en parallèle), la position est relue AU MOMENT de l'envoi. */
  const send = (refresh: boolean) => {
    if (disabled) return;
    queue = queue.then(async () => {
      if (disabled) return;
      const current = snapshot();
      if (!current) return;
      try {
        await api('PUT', path, { ...current, sentAt: stamp() });
        afterSaved(refresh);
      } catch (cause) {
        if (cause instanceof ApiError && cause.isUnauthorized) disabled = true;     // session expirée : on arrête, rien n'est inventé
        // réseau coupé / 5xx : le prochain envoi (12 s) repartira avec la position du moment
      }
    });
  };

  /** Envoi pendant le déchargement de la page : `keepalive`, sans file (la page peut disparaître à tout instant). */
  const sendOnLeave = () => {
    if (disabled || !env.apiUrl) return;
    const current = snapshot();
    if (!current) return;
    void fetch(`${env.apiUrl}${path}`, {
      method: 'PUT', credentials: 'include', keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...current, sentAt: stamp() }),
    }).catch(() => undefined);
  };

  const timer = window.setInterval(() => { if (!video.paused && !video.seeking) send(false); }, REPORT_EVERY_MS);
  const onPause = () => send(true);
  const onEnded = () => send(true);
  const onSeeked = () => { window.clearTimeout(seekTimer); seekTimer = window.setTimeout(() => send(false), SEEK_DEBOUNCE_MS); };
  const onVisibility = () => { if (document.visibilityState === 'hidden') sendOnLeave(); };
  video.addEventListener('timeupdate', onTime);
  video.addEventListener('pause', onPause);
  video.addEventListener('ended', onEnded);
  video.addEventListener('seeked', onSeeked);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', sendOnLeave);

  return () => {
    window.clearInterval(timer);
    window.clearTimeout(seekTimer);
    video.removeEventListener('timeupdate', onTime);
    video.removeEventListener('pause', onPause);
    video.removeEventListener('ended', onEnded);
    video.removeEventListener('seeked', onSeeked);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', sendOnLeave);
    // Sortie du lecteur : dernier envoi (file d'abord, puis rafraîchissement de « Continuer à regarder »).
    if (!disabled) {
      const current = snapshot();
      if (current) {
        void fetch(`${env.apiUrl ?? ''}${path}`, { method: 'PUT', credentials: 'include', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...current, sentAt: stamp() }) })
          .then(() => refreshContinue()).catch(() => undefined);
      }
    }
  };
}
