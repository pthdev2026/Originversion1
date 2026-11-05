import { api, ApiError } from '@/lib/api';
import { absolute, type ServerCard } from '@/lib/catalog-api';
import type { EpisodeWatchProgress } from '@/lib/episode-progress';
import { withOfflineFallback } from '@/lib/offline-preview';
import { originTopTen } from '@/lib/origin-top-ten';
import type { ContentKind, Production, ProductionEpisode } from '@/lib/productions';
import { resolveWatchable, similarTo } from '@/lib/watch-catalog';
import type { WatchSuggestion } from '@/lib/watch-catalog';

/**
 * Fiche programme RÉELLE : `GET /api/programs/:slug` (saisons, épisodes), `/similar` (« Vous pourriez aussi aimer »),
 * `/api/collections/top-10` (rang) et, pour un compte connecté, `/api/me/progress?program=` (états « Vu » / « En cours »).
 * Les adaptateurs sont des fonctions pures testées contre une vraie réponse de l'API.
 */
interface ServerEpisode { id: string; number: number; title: string; synopsis: string | null; durationLabel: string | null; image: string | null; imageAlt: string | null; playbackId: string; playable: boolean }
export interface ServerProgram extends ServerCard {
  trailerUrl?: string | null; presenter?: string | null;
  meta?: { year?: number | null; language?: string | null; rating?: string | null; genres?: string[] };
  seasons?: { number: number; title: string | null; episodes: ServerEpisode[] }[];
}

const PLACEHOLDER = 'Présentation à venir — contenu de démonstration.';
const KINDS: ContentKind[] = ['film', 'serie', 'documentaire'];
const kindOf = (kind: string | undefined): ContentKind => KINDS.find(item => item === kind) ?? 'film';

/** Fiche complète (saisons et épisodes compris). */
export function toProduction(program: ServerProgram): Production {
  const image = absolute(program.images?.hero ?? program.images?.poster);
  const logo = program.images?.logo ? absolute(program.images.logo) : undefined;
  const trailer = program.trailerUrl ? absolute(program.trailerUrl) : undefined;
  const meta = program.meta ?? {};
  const episodes = (episode: ServerEpisode): ProductionEpisode => ({
    id: episode.id, number: episode.number, title: episode.title, synopsis: episode.synopsis ?? program.synopsis ?? PLACEHOLDER,
    image: absolute(episode.image ?? program.images?.poster), imageAlt: episode.imageAlt ?? program.images?.alt ?? episode.title,
    ...(episode.durationLabel ? { duration: episode.durationLabel } : {}), playable: episode.playable, isDemo: program.isDemo ?? false,
  });
  return {
    slug: program.slug, kind: kindOf(program.kind), title: program.title, label: program.category ?? '', status: program.badges ?? [],
    synopsis: program.synopsis ?? program.tagline ?? PLACEHOLDER, ...(program.presenter ? { presenter: program.presenter } : {}),
    heroImage: image, heroAlt: program.images?.alt ?? program.title, ...(logo ? { titleLogo: logo } : {}), ...(trailer ? { trailerUrl: trailer } : {}),
    meta: {
      genres: meta.genres?.length ? meta.genres : program.category ? [program.category] : [],
      ...(meta.year ? { year: meta.year } : {}), ...(meta.language ? { language: meta.language } : {}),
      ...(program.durationLabel ? { averageDuration: program.durationLabel } : {}), ...(meta.rating ? { rating: meta.rating } : {}),
    },
    seasons: (program.seasons ?? []).map(season => ({ number: season.number, ...(season.title ? { title: season.title } : {}), episodes: season.episodes.map(episodes) })),
    isDemo: program.isDemo ?? false,
  };
}

/** Fiche légère d'un titre de la rangée « Similaires » (aperçu au survol) : un film a son épisode unique, une série n'a pas d'épisode inventé. */
export function toPreviewProduction(card: ServerCard): Production {
  const kind = kindOf(card.kind);
  const image = absolute(card.images?.hero ?? card.images?.poster);
  const synopsis = card.synopsis ?? card.tagline ?? PLACEHOLDER;
  return {
    slug: card.slug, kind, title: card.title, label: card.category ?? '', status: card.badges ?? [], synopsis,
    heroImage: image, heroAlt: card.images?.alt ?? card.title, isDemo: card.isDemo ?? false,
    meta: { genres: card.category ? [card.category] : [], ...(card.durationLabel ? { averageDuration: card.durationLabel } : {}) },
    seasons: kind === 'serie' ? [] : [{ number: 1, episodes: [{ id: 'feature', number: 1, title: card.title, synopsis, image, imageAlt: card.images?.alt ?? card.title, isDemo: card.isDemo ?? false, ...(card.durationLabel ? { duration: card.durationLabel } : {}) }] }],
  };
}

export const toSuggestion = (card: ServerCard): WatchSuggestion => ({
  id: card.slug, title: card.title, category: card.category ?? '', image: absolute(card.images?.poster ?? card.images?.hero), imageAlt: card.images?.alt ?? card.title, kind: kindOf(card.kind),
});

export interface ProductionPage {
  production: Production;
  similar: WatchSuggestion[];
  /** Rang dans le Top 10, par programme (le badge « n° X au classement »). */
  ranks: Record<string, number>;
  /** Fiches légères des titres similaires, par programme (aperçu au survol). */
  previews: Record<string, Production>;
}

/** `null` si le programme n'existe pas (ou n'est pas publié) ; toute autre erreur remonte (écran d'erreur, jamais de fiche inventée). */
/** Fiche de DÉMONSTRATION (aperçu hors connexion) : tout contenu de l'accueil se résout en fiche, avec des similaires de démonstration. */
function offlineProductionPage(slug: string): ProductionPage | null {
  const production = resolveWatchable(slug);
  return production ? { production, similar: similarTo(production), ranks: Object.fromEntries(originTopTen.map(program => [program.id, program.rank])), previews: {} } : null;
}

export const fetchProductionPage = (slug: string): Promise<ProductionPage | null> => withOfflineFallback(() => fetchProductionPageOnline(slug), () => offlineProductionPage(slug));

async function fetchProductionPageOnline(slug: string): Promise<ProductionPage | null> {
  let program: ServerProgram;
  try { program = await api<ServerProgram>('GET', `/api/programs/${encodeURIComponent(slug)}`); }
  catch (error) { if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null; throw error; }
  // Similaires et classement : confort, jamais bloquants.
  const [similar, top] = await Promise.all([
    api<{ items: { program: ServerCard; reason?: string }[] }>('GET', `/api/programs/${encodeURIComponent(slug)}/similar`).catch(() => null),
    api<{ items: ServerCard[] }>('GET', '/api/collections/top-10').catch(() => null),
  ]);
  const cards = (similar?.items ?? []).map(item => item.program);
  return {
    production: toProduction(program),
    similar: cards.map(toSuggestion),
    ranks: Object.fromEntries((top?.items ?? []).map((card, index) => [card.slug, card.rank ?? index + 1])),
    previews: Object.fromEntries(cards.map(card => [card.slug, toPreviewProduction(card)])),
  };
}

interface ServerProgress { playbackId: string; positionSeconds: number; durationSeconds: number | null; completed: boolean }

/** États « Vu » / « En cours » des épisodes d'un programme pour le compte connecté (`playbackId` → progression). */
export async function fetchProgramProgress(slug: string): Promise<Record<string, EpisodeWatchProgress>> {
  const data = await api<{ items: ServerProgress[] }>('GET', `/api/me/progress?program=${encodeURIComponent(slug)}`);
  return Object.fromEntries(data.items.map(item => [item.playbackId, { positionSeconds: item.positionSeconds, durationSeconds: item.durationSeconds ?? 0, completed: item.completed }]));
}

/** Identifiant de lecture d'un épisode (le film unique `feature` porte le slug). */
export const playbackIdOf = (slug: string, episodeId: string) => (episodeId === 'feature' ? slug : `${slug}-${episodeId}`);

/** Applique la progression du serveur aux épisodes de la fiche (copie : la fiche chargée n'est jamais modifiée). */
export function withProgress(production: Production, progress: Record<string, EpisodeWatchProgress>): Production {
  return { ...production, seasons: production.seasons.map(season => ({ ...season, episodes: season.episodes.map(episode => {
    const known = progress[playbackIdOf(production.slug, episode.id)];
    return known ? { ...episode, watchProgress: known } : episode;
  }) })) };
}

/** « Marquer comme vu » / « Pas vu » : enregistré par le serveur (terminé = position à la durée ; pas vu = progression oubliée). */
export async function setEpisodeWatched(slug: string, episode: ProductionEpisode, watched: boolean, knownDuration: number): Promise<void> {
  const id = encodeURIComponent(playbackIdOf(slug, episode.id));
  if (!watched) { await api('DELETE', `/api/me/progress/${id}`); return; }
  let duration = knownDuration;
  if (!(duration > 0)) duration = (await api<{ durationSeconds: number }>('GET', `/api/programs/${id}/playback`)).durationSeconds;
  await api('PUT', `/api/me/progress/${id}`, { positionSeconds: duration, durationSeconds: duration, sentAt: Date.now() });
}
