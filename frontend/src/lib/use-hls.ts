import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type Hls from 'hls.js';
import { nextRecovery, type PlaybackFailureKind } from '@/lib/playback-recovery';

export interface QualityLevel {
  index: number;
  label: string;
}

/** Mesures de démarrage, en millisecondes depuis le début du chargement du manifeste. */
export interface PlaybackTiming {
  manifestMs?: number;
  startMs?: number;
}

interface UseHlsOptions {
  /** Appelé quand le lien semble expiré : l'appelant redemande /playback et fournit un nouveau `manifestUrl`. */
  onExpired?: (() => void) | undefined;
  /** Position de départ en secondes (reprise d'un contenu commencé). */
  startAt?: number | undefined;
}

/**
 * Attache un flux HLS à un élément <video> : hls.js (chargé à la demande) partout où MSE existe,
 * lecture native sinon (Safari / iOS). Lance la lecture dès que le manifeste est prêt.
 * Les erreurs fatales suivent `nextRecovery` : nouveau lien (403), reprises réseau bornées, reprise média.
 * Si `manifestUrl` change en cours de lecture, la position courante est conservée.
 */
export function useHls(videoRef: RefObject<HTMLVideoElement | null>, manifestUrl: string, options: UseHlsOptions = {}) {
  const hlsRef = useRef<Hls | null>(null);
  const expiredRef = useRef(options.onExpired);
  const refreshedRef = useRef(false);
  // Dernière position lue : relue à chaque rechargement (detachMedia remet currentTime à 0).
  const positionRef = useRef(options.startAt ?? 0);
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [level, setLevelState] = useState(-1);
  const [activeHeight, setActiveHeight] = useState<number | null>(null);
  const [failure, setFailure] = useState<PlaybackFailureKind | null>(null);
  const [timing, setTiming] = useState<PlaybackTiming>({});
  const [attempt, setAttempt] = useState(0);
  const [engine, setEngine] = useState<'hlsjs' | 'native' | null>(null);

  useEffect(() => {
    expiredRef.current = options.onExpired;
  }, [options.onExpired]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    let cancelled = false;
    let networkRetries = 0;
    let mediaRecoveries = 0;
    let retryTimer: number | undefined;
    let startMeasured = false;
    const resumeAt = positionRef.current;
    const startedAt = performance.now();
    let cleanupSource = () => {};

    setFailure(null);
    setLevels([]);
    setLevelState(-1);
    setActiveHeight(null);
    setTiming({});

    const fail = (kind: PlaybackFailureKind) => { if (!cancelled) setFailure(kind); };
    const requestRefresh = () => {
      refreshedRef.current = true;
      if (expiredRef.current) expiredRef.current();
      else fail('expired');
    };

    const onPlaying = () => {
      networkRetries = 0;
      mediaRecoveries = 0;
      refreshedRef.current = false;
      if (!startMeasured) {
        startMeasured = true;
        setTiming(previous => ({ ...previous, startMs: Math.round(performance.now() - startedAt) }));
      }
    };
    const onOnline = () => { hlsRef.current?.startLoad(); };
    const onTime = () => { if (video.currentTime > 0) positionRef.current = video.currentTime; };
    video.addEventListener('playing', onPlaying);
    video.addEventListener('timeupdate', onTime);
    window.addEventListener('online', onOnline);

    const startHls = (HlsClass: typeof Hls) => {
      const hls = new HlsClass({
        capLevelToPlayerSize: true,
        startLevel: 1,
        maxBufferLength: 30,
        startPosition: resumeAt > 0 ? resumeAt : -1,
      });
      hlsRef.current = hls;
      setEngine('hlsjs');
      hls.loadSource(manifestUrl);
      hls.attachMedia(video);
      hls.on(HlsClass.Events.MANIFEST_PARSED, (_event, data) => {
        setTiming(previous => ({ ...previous, manifestMs: Math.round(performance.now() - startedAt) }));
        setLevels(
          data.levels
            .map((item, index) => ({ index, label: `${item.height}p`, height: item.height }))
            .sort((a, b) => b.height - a.height)
            .map(({ index, label }) => ({ index, label })),
        );
        void video.play().catch(() => undefined);
      });
      hls.on(HlsClass.Events.LEVEL_SWITCHED, (_event, data) => setActiveHeight(hls.levels[data.level]?.height ?? null));
      hls.on(HlsClass.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        const type = data.type === HlsClass.ErrorTypes.NETWORK_ERROR ? 'network' : data.type === HlsClass.ErrorTypes.MEDIA_ERROR ? 'media' : 'other';
        const decision = nextRecovery({ type, httpStatus: data.response?.code, networkRetries, mediaRecoveries, refreshed: refreshedRef.current });
        if (decision.action === 'refresh') requestRefresh();
        else if (decision.action === 'retry') {
          networkRetries += 1;
          retryTimer = window.setTimeout(() => hls.startLoad(), decision.delayMs);
        } else if (decision.action === 'recover-media') {
          mediaRecoveries += 1;
          hls.recoverMediaError();
        } else fail(decision.kind);
      });
      cleanupSource = () => {
        hls.destroy();
        hlsRef.current = null;
      };
    };

    const startNative = () => {
      setEngine('native');
      const onMetadata = () => {
        if (resumeAt > 0) video.currentTime = resumeAt;
        void video.play().catch(() => undefined);
      };
      const onError = () => {
        const code = video.error?.code;
        if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) fail('unsupported');
        else if (code === MediaError.MEDIA_ERR_NETWORK && !refreshedRef.current) requestRefresh();
        else fail(code === MediaError.MEDIA_ERR_NETWORK ? 'network' : 'media');
      };
      video.addEventListener('loadedmetadata', onMetadata, { once: true });
      video.addEventListener('error', onError);
      video.src = manifestUrl;
      cleanupSource = () => {
        video.removeEventListener('loadedmetadata', onMetadata);
        video.removeEventListener('error', onError);
        video.removeAttribute('src');
        video.load();
      };
    };

    const hasMse = 'MediaSource' in window || 'ManagedMediaSource' in window;
    void (async () => {
      if (hasMse) {
        const { default: HlsClass } = await import('hls.js');
        if (cancelled) return;
        if (HlsClass.isSupported()) {
          startHls(HlsClass);
          return;
        }
      }
      if (video.canPlayType('application/vnd.apple.mpegurl')) startNative();
      else fail('unsupported');
    })().catch(() => fail('network'));

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('timeupdate', onTime);
      window.removeEventListener('online', onOnline);
      cleanupSource();
    };
  }, [manifestUrl, videoRef, attempt]);

  const setLevel = useCallback((index: number) => {
    if (hlsRef.current) hlsRef.current.currentLevel = index;
    setLevelState(index);
  }, []);

  /** Nouvelle tentative manuelle : recharge le même lien (l'appelant redemande un lien si besoin). */
  const retry = useCallback(() => {
    refreshedRef.current = false;
    setAttempt(value => value + 1);
  }, []);

  return { levels, level, setLevel, activeHeight, failure, failed: failure !== null, timing, retry, engine };
}
