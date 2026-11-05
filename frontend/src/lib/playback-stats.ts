import { env } from '@/lib/env';

/**
 * Statistiques de lecture ANONYMES (qualité d'expérience) : `POST /api/playback-sessions`, le seul mécanisme de mesure.
 * Distinct de la progression PERSONNELLE (`progress-reporter.ts`, PUT /api/me/progress/…, réservée aux comptes connectés) :
 * ici ni compte ni position, seulement des compteurs cumulatifs d'une séance (démarrage, coupures, qualité, temps réellement regardé).
 *
 * Autorisation (contrat v1.15) : l'identifiant de séance ET le jeton viennent de la réponse de lecture (`analytics`) ;
 * sans eux, rien n'est envoyé. Une séance = une lecture : un nouveau lien demandé en cours de lecture (expiration) ne crée pas
 * de seconde séance. Pas de double comptage : le temps n'avance que lorsque la vidéo joue réellement (jamais en pause, pendant
 * un saut, en attente de données ou après la fin) ; les rapports sont CUMULATIFS (le serveur garde le maximum) et ne sont
 * renvoyés que si quelque chose a changé.
 */
export const STATS_EVERY_MS = 15_000;
const MAX_TICK_SECONDS = 1.5;      // un `timeupdate` espacé de plus que cela = saut ou gel : jamais compté comme du temps regardé

export interface StatsGrant { sessionId: string; token: string }
export interface StatsContext {
  playbackId: string;
  grant: StatsGrant;
  /** Lus au moment de chaque calcul : le lecteur les met à jour sans relancer la mesure. */
  current: () => { activeHeight: number | null; startupMs: number | null; fatalError: string | null; engine: 'hlsjs' | 'native' };
}

export function deviceKind(width = window.innerWidth, userAgent = navigator.userAgent, coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false): 'mobile' | 'tablet' | 'desktop' {
  if (/iPad|Tablet/i.test(userAgent) || (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent))) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(userAgent)) return 'mobile';
  // Une fenêtre d'ordinateur rétrécie reste un ordinateur : seul un écran tactile étroit est compté comme un téléphone.
  return coarsePointer && width < 768 ? 'mobile' : 'desktop';
}

export function browserName(userAgent = navigator.userAgent): string {
  if (/Edg\//.test(userAgent)) return 'Edge';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Chrome\/|CriOS\//.test(userAgent)) return 'Chrome';
  if (/Safari\//.test(userAgent)) return 'Safari';
  return 'Autre';
}

export function startPlaybackStats(video: HTMLVideoElement, context: StatsContext): () => void {
  const url = env.apiUrl ? `${env.apiUrl}/api/playback-sessions` : null;
  if (!url) return () => undefined;
  let watchSeconds = 0;
  const levelSeconds: Record<string, number> = {};
  let maxHeight: number | null = null;
  let rebufferCount = 0;
  let rebufferMs = 0;
  let stalledSince: number | null = null;
  let lastTime: number | null = null;
  let lastSentSignature = '';
  let hasPlayed = false;

  const reading = () => !video.paused && !video.ended && !video.seeking && video.readyState >= 3;
  const onTime = () => {
    const now = video.currentTime;
    if (lastTime !== null && reading()) {
      const delta = now - lastTime;
      if (delta > 0 && delta <= MAX_TICK_SECONDS) {
        watchSeconds += delta;
        const height = context.current().activeHeight;
        if (height) levelSeconds[String(height)] = (levelSeconds[String(height)] ?? 0) + delta;
      }
    }
    lastTime = now;
    const height = context.current().activeHeight;
    if (height && (maxHeight === null || height > maxHeight)) maxHeight = height;
  };
  const onPlaying = () => {
    hasPlayed = true;
    lastTime = video.currentTime;
    if (stalledSince !== null) { rebufferMs += performance.now() - stalledSince; stalledSince = null; }
  };
  // Une coupure = l'attente de données PENDANT une lecture commencée (ni le chargement initial, ni un saut voulu par la personne).
  const onWaiting = () => { if (hasPlayed && !video.seeking && stalledSince === null) { stalledSince = performance.now(); rebufferCount += 1; } };
  const onSeeking = () => { lastTime = null; if (stalledSince !== null) { rebufferMs += performance.now() - stalledSince; stalledSince = null; } };
  const onSeeked = () => { lastTime = video.currentTime; };
  const onPause = () => { lastTime = null; };

  const report = () => {
    const state = context.current();
    const openStall = stalledSince !== null ? performance.now() - stalledSince : 0;
    const body = {
      id: context.grant.sessionId, token: context.grant.token, playbackId: context.playbackId,
      startupMs: state.startupMs, rebufferCount, rebufferMs: Math.round(rebufferMs + openStall),
      watchSeconds: Math.round(watchSeconds * 10) / 10,
      levelSeconds: Object.fromEntries(Object.entries(levelSeconds).map(([height, seconds]) => [height, Math.round(seconds * 10) / 10])),
      maxHeight, fatalError: state.fatalError, device: deviceKind(), browser: browserName(), engine: state.engine,
      connection: (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType ?? null,
    };
    const signature = JSON.stringify([body.startupMs, body.rebufferCount, body.rebufferMs, body.watchSeconds, body.maxHeight, body.fatalError]);
    if (signature === lastSentSignature || (!hasPlayed && !body.fatalError)) return null;      // rien de nouveau, ou la lecture n'a jamais démarré
    lastSentSignature = signature;
    return JSON.stringify(body);
  };
  /** Envoi ordinaire. `text/plain` : requête « simple », identique à l'envoi de fermeture de page. */
  const send = () => {
    const body = report();
    if (body) void fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body, keepalive: true }).catch(() => undefined);
  };
  /** Fermeture de page / mise en arrière-plan : `sendBeacon` (sans attente), repli `keepalive`. */
  const sendOnLeave = () => {
    const body = report();
    if (!body) return;
    if (navigator.sendBeacon?.(url, new Blob([body], { type: 'text/plain' }))) return;
    void fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body, keepalive: true }).catch(() => undefined);
  };

  const timer = window.setInterval(() => { if (!video.paused) send(); }, STATS_EVERY_MS);
  const onEnded = () => send();
  const onVisibility = () => { if (document.visibilityState === 'hidden') sendOnLeave(); };
  video.addEventListener('timeupdate', onTime);
  video.addEventListener('playing', onPlaying);
  video.addEventListener('waiting', onWaiting);
  video.addEventListener('seeking', onSeeking);
  video.addEventListener('seeked', onSeeked);
  video.addEventListener('pause', onPause);
  video.addEventListener('ended', onEnded);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', sendOnLeave);
  return () => {
    window.clearInterval(timer);
    video.removeEventListener('timeupdate', onTime);
    video.removeEventListener('playing', onPlaying);
    video.removeEventListener('waiting', onWaiting);
    video.removeEventListener('seeking', onSeeking);
    video.removeEventListener('seeked', onSeeked);
    video.removeEventListener('pause', onPause);
    video.removeEventListener('ended', onEnded);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', sendOnLeave);
    sendOnLeave();                                   // sortie du lecteur : dernier rapport cumulatif
  };
}
