/**
 * Module « playback » — règles métier.
 *
 * Le service orchestre : « trouver le média, vérifier qu'il est lisible, décider de l'ident de marque, fabriquer
 * les URLs signées ». Il ne connaît ni HTTP, ni SQL (repository), ni la façon de signer (DeliverySigner).
 */
import type { Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';
import { isValidId } from '../../platform/storage/layout.ts';
import { isHistoryEnabled } from '../account/repository.ts';
import { findProgress, hasProgressInProgram, hasProgressInSeason, listProgramProgress } from '../progress/repository.ts';
import type { DeliveryAsset, DeliverySigner } from './delivery.ts';
import { decideIdent, parsePlaybackId, type IdentPolicy, type IdentReason } from './ident-policy.ts';
import { describeContent, describeProgram, findPlayableAsset, listPlayableEpisodes, type Markers, type PlayableAsset } from '../ingest/repository.ts';
import { listTracks } from '../subtitles/repository.ts';

export interface IdentSession {
  /** Faut-il jouer l'ident avant le programme ? Le front suit cette valeur sans la réinterpréter. */
  show: boolean;
  reason: IdentReason;
  manifestUrl: string | null;
  durationSeconds: number | null;
  /** Secondes après lesquelles le spectateur peut passer l'ident (null = non passable). */
  skippableAfterSeconds: number | null;
}

export interface PlaybackSession {
  programId: string;
  status: 'ready';
  manifestUrl: string;
  posterUrl: string;
  durationSeconds: number;
  renditions: { name: string; height: number; videoKbps: number }[];
  expiresAt: string;
  /** Pistes de sous-titres WebVTT (vide si aucune). `url` est absolue, à donner telle quelle à `<track src>`. */
  subtitles: { lang: string; label: string; default: boolean; url: string }[];
  ident: IdentSession;
  /** Ce qui est lu (titre du programme, épisode) : de quoi afficher la barre du lecteur sans second appel. */
  content: { programSlug: string; title: string; kind: 'film' | 'serie' | 'documentaire'; episode: { season: number; number: number; title: string } | null };
  /** Où reprendre (compte connecté, historique activé, contenu commencé et non terminé) ; `null` sinon. */
  resume: { positionSeconds: number } | null;
  /** Repères éditoriaux en secondes (`null` = non renseigné) : « Passer l'intro » entre `introStart` et `introEnd`, « Épisode suivant » dès `creditsStart`. */
  markers: { introStart: number | null; introEnd: number | null; creditsStart: number | null };
  /** Épisode suivant lisible (séries) ; `null` pour un film ou le dernier épisode. */
  next: { playbackId: string; season: number; number: number; title: string } | null;
}

export interface IdentConfig {
  policy: IdentPolicy;
  playbackId: string;
  skippableAfterSeconds: number;
}

export interface PlaybackContext {
  /** Compte connecté, ou null (visiteur anonyme). */
  userId: string | null;
  publicOrigin: string;
  /** Le navigateur a déjà joué l'ident pour ce titre. */
  identSeen: boolean;
  /** L'épisode est enchaîné automatiquement après le précédent. */
  autoplayNext: boolean;
}

const deliveryOf = (asset: PlayableAsset): DeliveryAsset => ({
  playbackId: asset.playbackId,
  storagePath: asset.storagePath,
  provider: asset.provider,
  providerPlaybackId: asset.providerPlaybackId,
  providerPolicy: asset.providerPolicy,
  durationSeconds: asset.durationSeconds,
});

export async function createPlaybackSession(
  sql: Sql,
  signer: DeliverySigner,
  ident: IdentConfig,
  playbackId: string,
  context: PlaybackContext,
): Promise<PlaybackSession> {
  const asset = isValidId(playbackId) ? await findPlayableAsset(sql, playbackId) : null;
  if (!asset) throw errors.notAvailable();

  const signed = signer.sign(deliveryOf(asset), { publicOrigin: context.publicOrigin });

  // --- Ident de marque -----------------------------------------------------------------------------------
  const identAsset = ident.policy === 'off' || asset.playbackId === ident.playbackId ? null : await findPlayableAsset(sql, ident.playbackId);
  let hasProgressInTitle = false;
  let hasProgressInSeasonValue = false;
  let resumeSeconds = 0;
  let resumeAt: number | null = null;
  if (context.userId) {
    const season = parsePlaybackId(asset.playbackId).seasonPrefix;
    hasProgressInTitle = await hasProgressInProgram(sql, context.userId, asset.programSlug);
    hasProgressInSeasonValue = season ? await hasProgressInSeason(sql, context.userId, season) : hasProgressInTitle;
    const progress = await findProgress(sql, context.userId, asset.playbackId);
    resumeSeconds = progress && !progress.completed ? progress.positionSeconds : 0;
    if (resumeSeconds > 0 && (await isHistoryEnabled(sql, context.userId))) resumeAt = resumeSeconds;
  }
  const info = await describeContent(sql, asset.playbackId);
  const episodes = info?.episode ? await listPlayableEpisodes(sql, asset.programSlug) : [];
  const upcoming = episodes[episodes.findIndex(item => item.playbackId === asset.playbackId) + 1];
  const decision = decideIdent({
    policy: ident.policy,
    identAvailable: identAsset !== null,
    isBrandAsset: asset.playbackId === ident.playbackId,
    hasProgressInTitle,
    hasProgressInSeason: hasProgressInSeasonValue,
    resumeSeconds,
    clientSeen: context.identSeen,
    autoplayNext: context.autoplayNext,
  });
  const identSigned = decision.show && identAsset
    ? signer.sign(deliveryOf(identAsset), { publicOrigin: context.publicOrigin })
    : null;

  return {
    programId: asset.playbackId,
    status: 'ready',
    manifestUrl: signed.manifestUrl,
    posterUrl: signed.posterUrl,
    durationSeconds: asset.durationSeconds,
    renditions: asset.renditions,
    expiresAt: signed.expiresAt.toISOString(),
    subtitles: (await listTracks(sql, asset.playbackId)).map(track => ({
      lang: track.lang, label: track.label, default: track.isDefault,
      url: `${context.publicOrigin}/subtitles/${asset.playbackId}/${track.lang}.vtt`,
    })),
    content: { programSlug: asset.programSlug, title: info?.programTitle ?? asset.programSlug, kind: info?.kind ?? 'film', episode: info?.episode ?? null },
    resume: resumeAt === null ? null : { positionSeconds: resumeAt },
    markers: { introStart: asset.markers.introStartSeconds, introEnd: asset.markers.introEndSeconds, creditsStart: asset.markers.creditsStartSeconds },
    next: upcoming ? { playbackId: upcoming.playbackId, season: upcoming.season, number: upcoming.number, title: upcoming.title } : null,
    ident: {
      show: decision.show,
      reason: decision.reason,
      manifestUrl: identSigned?.manifestUrl ?? null,
      durationSeconds: decision.show && identAsset ? identAsset.durationSeconds : null,
      skippableAfterSeconds: decision.show ? ident.skippableAfterSeconds : null,
    },
  };
}

// ---- « Lecture » / « Reprendre » : quoi lancer pour ce programme ? ---------------------------------------------------

export interface PlayTarget {
  /** `start` : première lecture · `resume` : reprise en cours · `next` : épisode suivant du dernier terminé · `rewatch` : tout vu, on recommence. */
  state: 'start' | 'resume' | 'next' | 'rewatch';
  playbackId: string;
  /** Épisode visé (séries). `key` = identifiant d'épisode de la fiche (ex. « s2-e8 ») ; `seasonNumber` = `season` (deux noms, même valeur). */
  episode: { key: string; season: number; seasonNumber: number; number: number; title: string } | null;
  resumeSeconds: number;
}

/**
 * Le bouton principal d'une fiche programme : un seul appel dit quel contenu lancer et où reprendre.
 * Visiteur anonyme (ou historique désactivé) : toujours le début.
 */
export async function resolvePlayTarget(sql: Sql, userId: string | null, programSlug: string): Promise<PlayTarget> {
  const program = isValidId(programSlug) ? await describeProgram(sql, programSlug) : null;
  if (!program) throw errors.notFound('Programme introuvable.');
  const isSeries = program.kind === 'serie';
  const episodes = isSeries ? await listPlayableEpisodes(sql, programSlug) : [];
  const playable = isSeries ? episodes.map(item => item.playbackId) : (await findPlayableAsset(sql, programSlug)) ? [programSlug] : [];
  if (playable.length === 0) throw errors.notAvailable();
  const describe = (playbackId: string) => {
    const found = episodes.find(item => item.playbackId === playbackId);
    // `key` = identifiant d'épisode de la fiche (le playbackId sans le préfixe « <programme>- »).
    return found ? { key: found.playbackId.slice(programSlug.length + 1), season: found.season, seasonNumber: found.season, number: found.number, title: found.title } : null;
  };
  const target = (state: PlayTarget['state'], playbackId: string, resumeSeconds = 0): PlayTarget => ({ state, playbackId, episode: describe(playbackId), resumeSeconds });

  const first = playable[0] as string;
  if (!userId || !(await isHistoryEnabled(sql, userId))) return target('start', first);
  const seen = (await listProgramProgress(sql, userId, programSlug)).filter(item => playable.includes(item.playbackId));
  const latest = seen[0]; // récents d'abord
  if (!latest) return target('start', first);
  if (!latest.completed) return target(latest.positionSeconds > 0 ? 'resume' : 'start', latest.playbackId, latest.positionSeconds);
  const following = playable[playable.indexOf(latest.playbackId) + 1];
  return following ? target('next', following) : target('rewatch', first);
}
