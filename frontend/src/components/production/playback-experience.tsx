import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { AlertTriangle, ArrowLeft, ListVideo, Maximize, Minimize, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import type { ProductionEpisode, ProductionSeason } from '@/lib/productions';
import { fetchPlayback, isExpired, playbackProgramId, type PlaybackErrorReason, type PlaybackInfo } from '@/lib/origin-api';
import { debugMode, env } from '@/lib/env';
import type { PlaybackFailureKind } from '@/lib/playback-recovery';
import { useHls } from '@/lib/use-hls';
import { useSession } from '@/features/account/session/session';
import { startProgressReporting } from '@/lib/progress-reporter';
import { startPlaybackStats } from '@/lib/playback-stats';
import { tintVars, useVideoTint } from '@/lib/adaptive';

/** Preparing a session follows the real playback service; no timers and no simulated outcomes. */
export type PlaybackState = 'initializing' | 'preparing' | 'ready' | 'player' | 'unavailable' | 'error';

const pad = (n: number) => String(n).padStart(2, '0');
const IDLE_MS = 3000;

/** Retour / avance de 10 secondes : un arc fléché avec le nombre, plus lisible qu'une icône générique. */
function SkipIcon({ forward }: { forward?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={forward ? 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v3.7h-3.7' : 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.7h3.7'} />
    <text x="12" y="15.2" textAnchor="middle" fontSize="7.6" fontWeight="600" fill="currentColor" stroke="none">10</text>
  </svg>;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(total % 60)}` : `${pad(m)}:${pad(total % 60)}`;
}

export function OriginLoader({ label }: { label: string }) {
  return (
    <div className="origin-loader" role="status" aria-live="polite">
      <span className="origin-loader-track" aria-hidden="true"><span /></span>
      <span className="origin-loader-label">{label}</span>
    </div>
  );
}

function SupportLine() {
  if (!env.supportEmail) return null;
  return <p>Besoin d’aide ? <a href={`mailto:${env.supportEmail}`}>{env.supportEmail}</a></p>;
}

export function PlaybackErrorState({ onRetry, onBack, reason = 'network' }: { onRetry: () => void; onBack: () => void; reason?: PlaybackErrorReason }) {
  const notConfigured = reason === 'not_configured';
  return (
    <div className="playback-error" role="alert">
      <AlertTriangle aria-hidden="true" />
      <p className="playback-error-title">{notConfigured ? 'La lecture n’est pas configurée sur cet environnement.' : 'Service momentanément indisponible.'}</p>
      <p>{notConfigured ? 'L’adresse du service de lecture n’est pas renseignée.' : 'Vérifiez votre connexion, puis réessayez.'}</p>
      <SupportLine />
      <div className="playback-row">
        {!notConfigured && <button type="button" className="hud-primary" data-autofocus onClick={onRetry}>Réessayer</button>}
        <button type="button" className="hud-glass" onClick={onBack}>Retour au programme</button>
      </div>
    </div>
  );
}

function PlaybackUnavailable({ onBack }: { onBack: () => void }) {
  return (
    <div className="playback-error" role="status">
      <p className="playback-error-title">Ce programme n’est pas encore disponible à la lecture.</p>
      <div className="playback-row"><button type="button" className="hud-glass" data-autofocus onClick={onBack}>Retour au programme</button></div>
    </div>
  );
}

const FAILURE_COPY: Record<PlaybackFailureKind, string> = {
  expired: 'Le lien de lecture a expiré.',
  network: 'Service momentanément indisponible.',
  media: 'La lecture a rencontré un problème.',
  unsupported: 'La lecture n’a pas pu démarrer sur cet appareil.',
};

function PlayerFailure({ kind, onRetry }: { kind: PlaybackFailureKind; onRetry: () => void }) {
  return (
    <div className="player-failure" role="alert">
      <p>{FAILURE_COPY[kind]}</p>
      {kind !== 'unsupported' && <button type="button" className="hud-primary" data-autofocus onClick={onRetry}>Réessayer</button>}
      <SupportLine />
    </div>
  );
}

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FullscreenVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };
type LockableOrientation = ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> };

interface PlayerShellProps {
  info: PlaybackInfo;
  title: string;
  season: ProductionSeason;
  episode: ProductionEpisode;
  onBack: () => void;
  onPick: (e: ProductionEpisode) => void;
  /** Redemande un lien de lecture (expiration, 403). */
  onRefresh: () => void;
  /** Durée de l'appel /playback, affichée en mode debug. */
  apiMs: number | undefined;
}

function PlayerShell({ info, title, season, episode, onBack, onPick, onRefresh, apiMs }: PlayerShellProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<number | undefined>(undefined);
  const { levels, level, setLevel, activeHeight, failure, timing, retry, engine } = useHls(videoRef, info.manifestUrl, { onExpired: onRefresh, startAt: info.resume?.positionSeconds });
  const sessionUser = useSession();
  // Progression RÉELLE : enregistrée par le serveur pour le compte connecté (un visiteur n'écrit rien).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !sessionUser) return undefined;
    return startProgressReporting(video, info.programId, { fallbackDuration: info.durationSeconds });
  }, [sessionUser?.email, info.programId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Statistiques de lecture ANONYMES (visiteurs compris), autorisées par le jeton de la lecture : une séance par lecture.
  // Les valeurs vivantes passent par une référence ; un nouveau lien d'expiration ne démarre pas une seconde séance.
  const live = useRef({ activeHeight, startupMs: timing.startMs ?? null, fatalError: failure as string | null, engine: (engine ?? 'hlsjs') as 'hlsjs' | 'native' });
  live.current = { activeHeight, startupMs: timing.startMs ?? null, fatalError: failure, engine: engine ?? 'hlsjs' };
  const statsGrant = useRef<{ programId: string; sessionId: string; token: string } | null>(null);
  if (info.analytics && statsGrant.current?.programId !== info.programId) statsGrant.current = { programId: info.programId, ...info.analytics };
  useEffect(() => {
    const video = videoRef.current;
    const grant = statsGrant.current;
    if (!video || !grant || grant.programId !== info.programId) return undefined;
    return startPlaybackStats(video, { playbackId: info.programId, grant: { sessionId: grant.sessionId, token: grant.token }, current: () => live.current });
  }, [info.programId]);
  // Session perdue pendant la lecture (expirée ailleurs) : la vidéo continue, un message discret prévient que la progression n'est plus enregistrée.
  const hadSession = useRef(false);
  const [sessionLost, setSessionLost] = useState(false);
  useEffect(() => {
    if (sessionUser) { hadSession.current = true; setSessionLost(false); }
    else if (hadSession.current) setSessionLost(true);
  }, [sessionUser]);
  const failed = failure !== null;
  const online = useOnline();
  const [announce, setAnnounce] = useState('');

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(info.durationSeconds);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [list, setList] = useState(false);
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Sous-titres : langue affichée (null = désactivés), au départ la piste par défaut de l'API.
  const [subtitle, setSubtitle] = useState<string | null>(() => info.subtitles.find(track => track.default)?.lang ?? null);
  // Fond adaptatif : les dégradés des bandeaux prennent la couleur de la scène (module lib/adaptive).
  const tint = useVideoTint(videoRef, episode.image);

  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  useEffect(() => {
    wake();
    return () => window.clearTimeout(idleTimer.current);
  }, [wake]);

  useEffect(() => {
    const onChange = () => {
      const doc = document as FullscreenDocument;
      const active = Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement);
      setFullscreen(active);
      if (!active) screen.orientation?.unlock?.();
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      // Lien expiré pendant une pause : on en redemande un, la lecture reprend à la même position.
      if (isExpired(info)) { onRefresh(); return; }
      void video.play().catch(() => undefined);
    } else video.pause();
  }, [info, onRefresh]);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
  }, []);

  // Plein écran sur le lecteur (pas sur la page). iPhone ne l'autorise que sur la vidéo elle-même.
  const toggleFullscreen = useCallback(() => {
    const doc = document as FullscreenDocument;
    if (document.fullscreenElement ?? doc.webkitFullscreenElement) {
      if (document.exitFullscreen) void document.exitFullscreen();
      else doc.webkitExitFullscreen?.();
      return;
    }
    const shell = shellRef.current;
    const video = videoRef.current as FullscreenVideo | null;
    if (shell?.requestFullscreen) {
      void shell.requestFullscreen()
        .then(() => (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape').catch(() => undefined))
        .catch(() => undefined);
    } else video?.webkitEnterFullscreen?.();
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  }, []);

  const changeVolume = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.volume = Math.max(0, Math.min(1, Math.round((video.volume + delta) * 10) / 10));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Les champs (curseur de progression) et les boutons gardent leurs touches natives.
      // Télécommande : sur la barre de progression, ◀ ▶ avancent de 10 s (le pas natif, 0,1 s, est inutilisable).
      if (document.documentElement.dataset['tv'] && target?.closest('.player-progress input') && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) { event.preventDefault(); seekBy(event.key === 'ArrowRight' ? 10 : -10); wake(); return; }
      if (target?.closest('input')) return;
      if ((event.key === ' ' || event.key === 'Enter') && target?.closest('button, a')) return;
      if (document.documentElement.dataset['tv']) {
        // Télécommande : OK = lecture/pause ; ◀ ▶ = ±10 s ; ▲ ▼ réveillent les commandes puis les parcourent (navigation spatiale, voir tv-mode.ts).
        const onControl = Boolean(target?.closest('.player-shell button'));
        if (event.key === 'Enter' && !onControl) { event.preventDefault(); togglePlay(); wake(); return; }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          if (onControl) return;
          event.preventDefault(); wake();
          shellRef.current?.querySelector<HTMLElement>('.player-play')?.focus();
          return;
        }
        if (onControl && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) return;
      }
      const actions: Record<string, () => void> = {
        ' ': togglePlay, k: togglePlay, ArrowRight: () => seekBy(10), ArrowLeft: () => seekBy(-10),
        ArrowUp: () => changeVolume(0.1), ArrowDown: () => changeVolume(-0.1), f: toggleFullscreen, m: toggleMute,
      };
      const action = actions[event.key];
      if (action) { event.preventDefault(); action(); wake(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seekBy, changeVolume, toggleFullscreen, toggleMute, wake]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const apply = () => { for (const track of Array.from(video.textTracks)) track.mode = track.language === subtitle ? 'showing' : 'hidden'; };
    apply();
    video.textTracks.addEventListener('addtrack', apply);
    return () => video.textTracks.removeEventListener('addtrack', apply);
  }, [subtitle, info.subtitles]);

  // Sur écran tactile, un premier appui sur l'image réveille les commandes ; l'appui suivant met en pause (comme les apps TV).
  const onVideoTap = useCallback(() => {
    if (idle && window.matchMedia('(pointer: coarse)').matches) { wake(); return; }
    togglePlay();
  }, [idle, wake, togglePlay]);

  const seekTo = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = seconds;
  }, []);

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const qualityLabel = level === -1 ? `Auto${activeHeight ? ` · ${activeHeight}p` : ''}` : levels.find(l => l.index === level)?.label ?? 'Auto';

  const heading = `${season.episodes.length > 1 || season.number > 1 ? `S${season.number} · É${pad(episode.number)} — ` : ''}${episode.title}`;
  const paused = !playing && !waiting && !failure;
  const remaining = Math.max(0, duration - current);

  return (
    <div ref={shellRef} className={`player-shell adaptive-surface ${idle && playing ? 'is-idle' : ''}`} style={tintVars(tint) as CSSProperties | undefined} onMouseMove={wake} onTouchStart={wake}>
      <video
        ref={videoRef}
        className="player-video"
        poster={info.posterUrl || undefined}
        playsInline
        crossOrigin={info.subtitles.length > 0 ? 'anonymous' : undefined}
        onClick={onVideoTap}
        onPlay={() => { setPlaying(true); setAnnounce('Lecture'); }}
        onPause={() => { setPlaying(false); setAnnounce('Pause'); }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration || info.durationSeconds)}
        onTimeUpdate={e => setCurrent(e.currentTarget.currentTime)}
        onVolumeChange={e => { setVolume(e.currentTarget.volume); setMuted(e.currentTarget.muted); }}
        onEnded={() => setPlaying(false)}
      >
        {info.subtitles.map(track => <track key={track.lang} kind="subtitles" srcLang={track.lang} label={track.label} src={track.url} />)}
      </video>

      <div className="player-top">
        <button type="button" className="player-round" aria-label="Retour au programme" onClick={onBack}><ArrowLeft aria-hidden="true" /></button>
        <button type="button" className="player-round" aria-label="Revenir au début" onClick={() => seekTo(0)}><RotateCcw aria-hidden="true" /></button>
        {season.episodes.length > 1 && <button type="button" className="player-round" aria-label="Liste des épisodes" aria-expanded={list} onClick={() => setList(v => !v)}><ListVideo aria-hidden="true" /></button>}
        <div className="player-heading"><span>{title}</span><strong>{heading}</strong></div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      {sessionLost && <div className="player-toast" role="status">
        <span>Votre session a expiré. La lecture continue, mais votre progression n’est plus enregistrée.</span>
        <a href="/connexion" target="_blank" rel="noreferrer">Se reconnecter</a>
        <button type="button" aria-label="Fermer le message" onClick={() => setSessionLost(false)}><X aria-hidden="true" /></button>
      </div>}

      {failure ? (
        <PlayerFailure kind={failure} onRetry={failure === 'expired' ? onRefresh : retry} />
      ) : waiting ? (
        <>
          <span className="player-wait" role="status" aria-label="Chargement" />
          {!online && <p className="player-failure player-offline" role="status">Connexion perdue : la lecture reprendra dès son retour.</p>}
        </>
      ) : null}

      {paused && <button type="button" className="player-center" aria-label="Lecture" onClick={togglePlay}><Play fill="currentColor" aria-hidden="true" /></button>}

      {paused && <div className="player-info">
        <p>{title}</p>
        <h2>{episode.title}</h2>
        <p className="player-info-meta">Saison {season.number} · Épisode {episode.number}{episode.duration ? ` · ${episode.duration}` : ''}</p>
        {episode.synopsis && <p className="player-info-synopsis">{episode.synopsis}</p>}
      </div>}

      {debugMode && (
        <dl className="player-debug" aria-label="Mesures de démarrage">
          <div><dt>API</dt><dd>{apiMs ?? '–'} ms</dd></div>
          <div><dt>Manifeste</dt><dd>{timing.manifestMs ?? '–'} ms</dd></div>
          <div><dt>1re image</dt><dd>{timing.startMs ?? '–'} ms</dd></div>
          <div><dt>Qualité</dt><dd>{activeHeight ? `${activeHeight}p` : '–'}</dd></div>
        </dl>
      )}

      <div className="player-bottom">
        <div className="player-line">
          <button type="button" className="player-play" aria-label={playing ? 'Pause' : 'Lecture'} onClick={togglePlay}>{playing ? <Pause aria-hidden="true" /> : <Play fill="currentColor" aria-hidden="true" />}</button>
          <span className="player-time">{formatTime(current)}</span>
          <div className="player-progress" style={{ '--p': `${progress}%` } as CSSProperties}>
            <span className="player-progress-fill" />
            <i className="player-progress-thumb" aria-hidden="true" />
            <input type="range" min={0} max={duration || 0} step={0.1} value={Math.min(current, duration || 0)} aria-label="Progression" aria-valuetext={`${formatTime(current)} sur ${formatTime(duration)}`}
              onChange={e => seekTo(Number(e.target.value))} />
          </div>
          <span className="player-time" title={`Reste ${formatTime(remaining)}`}>{formatTime(duration)}</span>
          <button type="button" className="player-icon" aria-label={muted || volume === 0 ? 'Activer le son' : 'Couper le son'} onClick={toggleMute}>{muted || volume === 0 ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}</button>
          <button type="button" className="player-icon" aria-label={fullscreen ? 'Quitter le plein écran' : 'Plein écran'} onClick={toggleFullscreen}>{fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}</button>
        </div>

        <div className="player-chips">
          <button type="button" className="player-chip player-skip" aria-label="Reculer de 10 secondes" onClick={() => seekBy(-10)}><SkipIcon /></button>
          <button type="button" className="player-chip player-skip" aria-label="Avancer de 10 secondes" onClick={() => seekBy(10)}><SkipIcon forward /></button>
          {info.subtitles.length > 0 && <div className="player-group" role="group" aria-label="Sous-titres">
            <span className="player-group-label" aria-hidden="true">Sous-titres</span>
            <button type="button" className="player-chip" aria-pressed={subtitle === null} onClick={() => setSubtitle(null)}>Désactivés</button>
            {info.subtitles.map(track => <button key={track.lang} type="button" className="player-chip" aria-pressed={subtitle === track.lang} onClick={() => setSubtitle(track.lang)}>{track.label}</button>)}
          </div>}
          {levels.length > 1 && <div className="player-group" role="group" aria-label={`Qualité : ${qualityLabel}`}>
            <span className="player-group-label" aria-hidden="true">Qualité</span>
            <button type="button" className="player-chip" aria-pressed={level === -1} onClick={() => setLevel(-1)}>{`Auto${level === -1 && activeHeight ? ` · ${activeHeight}p` : ''}`}</button>
            {levels.map(l => <button key={l.index} type="button" className="player-chip" aria-pressed={level === l.index} onClick={() => setLevel(l.index)}>{l.label}</button>)}
          </div>}
        </div>
      </div>

      {list && (
        <div className="player-episodes" role="dialog" aria-label={`Saison ${season.number}`}>
          <div className="player-episodes-head"><span>Saison {season.number}</span><button type="button" aria-label="Fermer la liste" onClick={() => setList(false)}><X aria-hidden="true" /></button></div>
          {season.episodes.map(e => (
            <button key={e.id} type="button" className={e.id === episode.id ? 'is-current' : ''} onClick={() => { setList(false); onPick(e); }}>
              <img src={e.image} alt="" width={1536} height={1024} loading="lazy" /><span><small>Épisode {pad(e.number)}</small>{e.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface PlaybackExperienceProps {
  slug: string;
  title: string;
  season: ProductionSeason;
  episode: ProductionEpisode;
  /** Langue choisie sur la page programme (information seulement). */
  language?: string;
  onClose: () => void;
  onPick: (e: ProductionEpisode) => void;
}

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function PlaybackExperience({ slug, title, season, episode, language, onClose, onPick }: PlaybackExperienceProps) {
  const [state, setState] = useState<PlaybackState>('initializing');
  const [info, setInfo] = useState<PlaybackInfo | null>(null);
  const [errorReason, setErrorReason] = useState<PlaybackErrorReason>('network');
  const [apiMs, setApiMs] = useState<number | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const refreshing = useRef(false);
  const programId = playbackProgramId(slug, episode.id);
  const activeProgram = useRef(programId);

  // Prépare la séance auprès du service de lecture (aucune lecture simulée).
  useEffect(() => {
    activeProgram.current = programId;
    const controller = new AbortController();
    setState('initializing');
    setInfo(null);
    const preparing = window.setTimeout(() => setState(s => (s === 'initializing' ? 'preparing' : s)), 400);
    fetchPlayback(programId, controller.signal)
      .then(result => {
        if (result.status === 'ready') { setInfo(result.info); setApiMs(result.fetchMs); setState('ready'); }
        else if (result.status === 'unavailable') setState('unavailable');
        else { setErrorReason(result.reason); setState('error'); }
      })
      .catch(() => undefined);
    return () => { controller.abort(); window.clearTimeout(preparing); };
  }, [programId, attempt]);

  // Nouveau lien demandé en cours de lecture : le lecteur reste ouvert et reprend à la même position.
  const refresh = useCallback(() => {
    if (refreshing.current) return;
    refreshing.current = true;
    const requested = activeProgram.current;
    void fetchPlayback(requested)
      .then(result => {
        if (activeProgram.current !== requested) return;
        if (result.status === 'ready') { setInfo(result.info); setApiMs(result.fetchMs); }
        else if (result.status === 'unavailable') setState('unavailable');
        else { setErrorReason(result.reason); setState('error'); }
      })
      .catch(() => undefined)
      .finally(() => { refreshing.current = false; });
  }, []);

  const open = useCallback(() => {
    // Page laissée ouverte trop longtemps : le lien est périmé, on en redemande un avant d'ouvrir.
    if (info && isExpired(info)) setAttempt(a => a + 1);
    else setState('player');
  }, [info]);

  // Session prête : le lecteur s'ouvre de lui-même, un seul clic depuis la page jusqu'à l'écran.
  // Le bouton « Ouvrir le lecteur » reste affiché pendant ce court délai (et pour le clavier).
  useEffect(() => {
    if (state !== 'ready') return undefined;
    const fast = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(open, fast ? 0 : 700);
    return () => window.clearTimeout(timer);
  }, [state, open]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, [onClose]);

  // Le focus suit l'état : action principale si elle existe, sinon premier bouton de la scène.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const target = stage.querySelector<HTMLElement>('[data-autofocus]') ?? stage.querySelector<HTMLElement>('button');
    target?.focus();
  }, [state, errorReason]);

  // Piège de focus : Tab reste dans la scène de lecture.
  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null || el === document.activeElement);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return (
    <div ref={stageRef} className={`playback-stage is-${state}`} role="dialog" aria-modal="true" aria-label={`Lecture — ${title}, ${episode.title}`} onKeyDown={trapFocus}>
      {state === 'player' && info ? (
        <PlayerShell info={info} title={title} season={season} episode={episode} onBack={onClose} onPick={onPick} onRefresh={refresh} apiMs={apiMs} />
      ) : (
        <>
          <img className="playback-backdrop" src={episode.image} alt="" aria-hidden="true" width={1536} height={1024} />
          <div className="playback-veil" aria-hidden="true" />
          <button type="button" className="hud-glass playback-back" onClick={onClose}><ArrowLeft aria-hidden="true" />Retour</button>
          <div className="playback-titles">
            <p className="production-label">{title}</p>
            <h2>{episode.title}</h2>
            <p className="playback-sub">Saison {season.number} · Épisode {episode.number}</p>
            {language && <p className="playback-sub">{language}</p>}
          </div>
          <div className="playback-status">
            {state === 'error' && <PlaybackErrorState reason={errorReason} onRetry={() => setAttempt(a => a + 1)} onBack={onClose} />}
            {state === 'unavailable' && <PlaybackUnavailable onBack={onClose} />}
            {(state === 'initializing' || state === 'preparing') && <OriginLoader label="Préparation de votre séance…" />}
            {state === 'ready' && (
              <div className="playback-ready">
                <span className="origin-loader-track is-complete" aria-hidden="true"><span /></span>
                <p role="status">Prêt à regarder</p>
                <button type="button" className="hud-primary" data-autofocus onClick={open}><Play fill="currentColor" aria-hidden="true" />Ouvrir le lecteur</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
