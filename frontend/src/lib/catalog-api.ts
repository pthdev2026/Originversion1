import { api } from '@/lib/api';
import { withOfflineFallback } from '@/lib/offline-preview';
import { originPrograms } from '@/lib/origin-programs';
import { originTopTen } from '@/lib/origin-top-ten';
import { originSuggestions } from '@/lib/origin-suggestions';
import { originTestimonials } from '@/lib/origin-testimonials';
import { pthEpisodes } from '@/lib/pth-originals';
import { originCatalogs, catalogThemes, catalogContents } from '@/lib/origin-catalogs';
import { originCreators } from '@/lib/origin-creators';
import { env } from '@/lib/env';
import type { CatalogCollection, CatalogContent, CatalogTheme } from '@/lib/origin-catalogs';
import type { OriginCreator } from '@/lib/origin-creators';
import type { OriginProgram } from '@/lib/origin-programs';
import type { SuggestedProgram, SuggestionFontStyle } from '@/lib/origin-suggestions';
import type { PthEpisode } from '@/lib/pth-originals';
import { fullRanking, type RankedProgram } from '@/lib/origin-top-ten';

/**
 * Catalogue RÉEL : `GET /api/home` (accueil complet en un appel) puis adaptation, SANS changer les composants,
 * vers les formes que l'interface attend déjà (hero, classement, rails, suggestions, univers, créateurs, thématiques).
 * Les adaptateurs sont des fonctions pures (testées) ; les images/vidéos relatives du serveur sont rendues absolues.
 */
export interface ServerCard {
  slug: string; kind?: string; title: string; titleLines?: string[]; tagline?: string | null; synopsis?: string | null; category?: string | null;
  durationLabel?: string | null; badges?: string[]; themes?: string[]; playable?: boolean; isDemo?: boolean; rank?: number;
  images?: { poster?: string | null; hero?: string | null; logo?: string | null; alt?: string | null; focus?: string | null };
  heroVideoUrl?: string | null; titleStyle?: string | null;
}
interface ServerCollection { slug: string; title: string; layout: string; badge: string | null; viewAllUrl: string | null; items: ServerCard[] }
interface ServerTheme { slug: string; title: string; image: string | null; programCount: number; subtitle?: string | null; featuredSlug?: string | null; fallbackFeaturedSlug?: string | null; programs?: ServerCard[] }
interface ServerCreator { slug: string; name: string; showTitle: string | null; intro: string | null; themes: string[]; ambience: string | null; image: string | null; imageAlt: string | null; imageFocus: string | null; isProvisional: boolean }
interface ServerEpisode { id: string; number: number; title: string; image: string | null; imageAlt?: string | null; durationLabel: string | null }
interface ServerProgram extends ServerCard { seasons?: { number: number; episodes: ServerEpisode[] }[] }

/** Une URL relative du serveur (`/images/…`) devient absolue ; une URL déjà absolue ne change pas. */
export const absolute = (url: string | null | undefined): string => (!url ? '' : url.startsWith('/') && env.apiUrl ? `${env.apiUrl}${url}` : url);
const optional = (url: string | null | undefined): string | undefined => (url ? absolute(url) : undefined);
const picture = (card: ServerCard) => absolute(card.images?.poster ?? card.images?.hero);

export function toHeroProgram(card: ServerCard): OriginProgram {
  const logo = optional(card.images?.logo); const video = optional(card.heroVideoUrl);
  return {
    id: card.slug, title: card.title, titleLines: card.titleLines?.length ? card.titleLines : [card.title.toUpperCase()],
    tagline: card.tagline ?? '', synopsis: card.synopsis ?? '', category: card.category ?? '',
    heroImage: absolute(card.images?.hero ?? card.images?.poster), imageAlt: card.images?.alt ?? card.title,
    ...(logo ? { titleLogo: logo } : {}), ...(video ? { heroVideo: video } : {}), isDemo: card.isDemo ?? false,
  };
}

export function toRanked(card: ServerCard, position: number): RankedProgram {
  const video = optional(card.heroVideoUrl);
  return {
    id: card.slug, rank: card.rank ?? position + 1, title: card.title, category: card.category ?? '', poster: picture(card),
    imageAlt: card.images?.alt ?? card.title, ...(card.tagline ? { tagline: card.tagline } : {}), ...(video ? { previewVideo: video } : {}), isDemo: card.isDemo ?? false,
  };
}

const FONT_STYLES: SuggestionFontStyle[] = ['condensed', 'serif', 'bebas', 'italic-serif'];
export function toSuggested(card: ServerCard): SuggestedProgram {
  const style = FONT_STYLES.find(item => item === card.titleStyle) ?? 'condensed';
  return {
    id: card.slug, title: card.title, titleLines: card.titleLines?.length ? card.titleLines : [card.title.toUpperCase()],
    ...(card.tagline ? { tagline: card.tagline } : {}), category: card.category ?? '', duration: card.durationLabel ?? '', poster: picture(card),
    imageAlt: card.images?.alt ?? card.title, fontStyle: style, isDemo: card.isDemo ?? false,
  };
}

export function toContent(card: ServerCard): CatalogContent {
  const video = optional(card.heroVideoUrl); const focus = card.images?.focus ?? undefined;
  return {
    id: card.slug, title: card.title, category: card.category ?? '', image: picture(card), imageAlt: card.images?.alt ?? card.title,
    ...(focus ? { focus } : {}), ...(card.synopsis ? { synopsis: card.synopsis } : {}), ...(card.badges?.[0] ? { badge: card.badges[0] } : {}),
    ...(video ? { previewVideo: video } : {}), themes: card.themes ?? [], isDemo: card.isDemo ?? false,
  };
}

export function toCreator(creator: ServerCreator): OriginCreator {
  const ambience = (['ember', 'bordeaux', 'graphite', 'amber', 'night'] as const).find(item => item === creator.ambience) ?? 'night';
  return {
    id: creator.slug, name: creator.name, ...(creator.showTitle ? { showTitle: creator.showTitle } : {}), themes: creator.themes,
    intro: creator.intro ?? '', image: absolute(creator.image), imageAlt: creator.imageAlt ?? creator.name, focus: creator.imageFocus ?? '50% 30%',
    ambience, isProvisional: creator.isProvisional,
  };
}

/** Épisodes PTH de la dernière saison, du plus récent au plus ancien (quatre au plus, comme la maquette). */
export function toPthEpisodes(program: ServerProgram | null): PthEpisode[] {
  if (!program?.seasons?.length) return [];
  const latest = [...program.seasons].sort((a, b) => b.number - a.number)[0]!;
  return [...latest.episodes].sort((a, b) => b.number - a.number).slice(0, 4).map(episode => ({
    id: episode.id, number: episode.number, season: latest.number, title: episode.title, image: absolute(episode.image),
    imageAlt: episode.imageAlt ?? episode.title, ...(episode.durationLabel ? { duration: episode.durationLabel } : {}), isDemo: program.isDemo ?? false,
  }));
}

export interface HomeData {
  hero: OriginProgram[];
  topTen: RankedProgram[];
  suggestions: SuggestedProgram[];
  universes: SuggestedProgram[];
  pthEpisodes: PthEpisode[];
  rails: { newReleases: CatalogCollection; suspense: CatalogCollection; drama: CatalogCollection; couple: CatalogCollection; scienceFiction: CatalogCollection };
  creators: OriginCreator[];
  themes: CatalogTheme[];
  /** Toutes les fiches connues de l'accueil (sans doublon) : base des thématiques et des autres écrans. */
  contents: CatalogContent[];
  /** Cadrage éditorial des thématiques (serveur) : promesse, phare configuré, sinon phare de repli ; ordre des programmes (classement). */
  themeShowcase: Record<string, { subtitle: string; featuredId: string }>;
  themeOrder: Record<string, string[]>;
  /** « Tendances » : identifiants dans l'ordre de `/api/trending` (programmes publiés, réellement regardés, sinon sélection ORIGIN). */
  trending: string[];
}

const rail = (collection: ServerCollection | undefined, fallbackId: string, fallbackTitle: string): CatalogCollection => ({
  id: collection?.slug ?? fallbackId, title: collection?.title ?? fallbackTitle, contents: (collection?.items ?? []).map(toContent),
  ...(collection?.badge ? { badge: collection.badge } : {}), ...(collection?.viewAllUrl ? { viewAllUrl: collection.viewAllUrl } : {}),
  ...(collection?.layout === 'portrait' ? { cardStyle: 'portrait' as const } : {}),
});

export function buildHome(payload: { collections: ServerCollection[]; themes: ServerTheme[]; creators: ServerCreator[] }, pth: ServerProgram | null, trendingCards: ServerCard[] = []): HomeData {
  const by = new Map(payload.collections.map(collection => [collection.slug, collection]));
  const items = (slug: string) => by.get(slug)?.items ?? [];
  const contents = new Map<string, CatalogContent>();
  for (const collection of payload.collections) for (const card of collection.items) if (!contents.has(card.slug)) contents.set(card.slug, toContent(card));
  // Les premiers programmes de chaque thématique (v1.13) complètent le catalogue : un titre qui n'est dans aucune collection de l'accueil
  // (ex. « Tout recommencer ») reste trouvable dans l'explorateur de thématiques, « Ma liste » et « Continuer à regarder ».
  for (const theme of payload.themes) for (const card of theme.programs ?? []) {
    const known = contents.get(card.slug) ?? toContent(card);
    contents.set(card.slug, known.themes.includes(theme.slug) ? known : { ...known, themes: [...known.themes, theme.slug] });
  }
  // Les tendances complètent le catalogue : un programme populaire hors de toute collection reste ouvrable.
  for (const card of trendingCards) if (!contents.has(card.slug)) contents.set(card.slug, toContent(card));
  const themeShowcase: HomeData['themeShowcase'] = {};
  const themeOrder: HomeData['themeOrder'] = {};
  for (const theme of payload.themes) {
    const featured = theme.featuredSlug ?? theme.fallbackFeaturedSlug ?? theme.programs?.[0]?.slug;
    if (theme.subtitle && featured) themeShowcase[theme.slug] = { subtitle: theme.subtitle, featuredId: featured };
    else if (featured) themeShowcase[theme.slug] = { subtitle: '', featuredId: featured };
    themeOrder[theme.slug] = (theme.programs ?? []).map(card => card.slug);
  }
  return {
    hero: items('hero').map(toHeroProgram),
    topTen: items('top-10').map(toRanked),
    suggestions: items('suggestions').map(toSuggested),
    universes: items('universes').map(toSuggested),
    pthEpisodes: toPthEpisodes(pth),
    rails: {
      newReleases: rail(by.get('nouveautes'), 'nouveautes', 'Nouveautés sur ORIGIN'), suspense: rail(by.get('suspense'), 'suspense', 'Suspense'),
      drama: rail(by.get('drama'), 'drama', 'Drama'), couple: rail(by.get('couple'), 'couple', 'Couple'),
      scienceFiction: rail(by.get('science-fiction'), 'science-fiction', 'Science-Fiction'),
    },
    creators: payload.creators.map(toCreator),
    themes: payload.themes.map(theme => ({ id: theme.slug, title: theme.title, image: absolute(theme.image) })),
    contents: [...contents.values()],
    themeShowcase, themeOrder,
    trending: trendingCards.map(card => card.slug),
  };
}

/** Accueil de DÉMONSTRATION (aperçu hors connexion) : les contenus intégrés au code, copiés (jamais la même référence que le catalogue vivant). */
export function offlineHome(): HomeData {
  return {
    hero: [...originPrograms], topTen: [...originTopTen], suggestions: [...originSuggestions], universes: [...originTestimonials] as HomeData['universes'],
    pthEpisodes: [...pthEpisodes],
    rails: { newReleases: originCatalogs.newReleases, suspense: originCatalogs.suspense, drama: originCatalogs.drama, couple: originCatalogs.couple, scienceFiction: originCatalogs.scienceFiction } as HomeData['rails'],
    creators: [...originCreators], themes: [...catalogThemes], contents: [...catalogContents],
    themeShowcase: {}, themeOrder: {}, trending: [],
  };
}

/** Charge l'accueil réel. Une erreur est remontée telle quelle (l'écran affiche « Réessayer » : aucune donnée de remplacement inventée). */
export const fetchHome = (): Promise<HomeData> => withOfflineFallback(fetchHomeOnline, offlineHome);

async function fetchHomeOnline(): Promise<HomeData> {
  const home = await api<{ collections: ServerCollection[]; themes: ServerTheme[]; creators: ServerCreator[] }>('GET', '/api/home');
  // Les épisodes PTH viennent de la fiche du programme (un second appel, tolérant : sans eux, la section PTH reste simplement vide).
  const pthSlug = home.collections.find(collection => collection.slug === 'pth-originals')?.items[0]?.slug;
  const pth = pthSlug ? await api<ServerProgram>('GET', `/api/programs/${encodeURIComponent(pthSlug)}`).catch(() => null) : null;
  // Tendances : route existante, tolérante (en cas d'échec la thématique « Tendances » retombe sur tout le catalogue du serveur).
  const trending = await api<{ items: { program: ServerCard }[] }>('GET', '/api/trending?limit=12').then(result => result.items.map(item => item.program)).catch(() => []);
  return buildHome(home, pth, trending);
}

/** Classement complet réel (`GET /api/ranking`, pages de 200 jusqu'à `total`) ; le rang est celui du serveur. */
export const fetchRanking = (): Promise<RankedProgram[]> => withOfflineFallback(fetchRankingOnline, () => fullRanking);

async function fetchRankingOnline(): Promise<RankedProgram[]> {
  const ranked: RankedProgram[] = [];
  for (let offset = 0; offset < 1000; offset += 200) {
    const page = await api<{ total: number; items: { rank: number; program: ServerCard }[] }>('GET', `/api/ranking?limit=200&offset=${offset}`);
    ranked.push(...page.items.map(item => toRanked({ ...item.program, rank: item.rank }, item.rank - 1)));
    if (offset + 200 >= page.total) break;
  }
  // Un programme publié sans visuel ne peut pas être affiché comme une carte d'affiche : il est écarté ici (il reste ouvrable
  // ailleurs) et la numérotation reste continue. À corriger à la source : lui ajouter une image dans le back-office.
  return ranked.filter(program => program.poster !== '').map((program, index) => ({ ...program, rank: index + 1 }));
}
