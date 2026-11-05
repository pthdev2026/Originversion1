import presenter from '@/assets/pth-presentatrice-bordeaux.jpg';
import studio from '@/assets/pth-chantal.jpg';
import episode7 from '@/assets/pth-episode-7.jpg';
import episode6 from '@/assets/pth-episode-6.jpg';
import episode5 from '@/assets/pth-episode-5.jpg';
import type { EpisodeWatchProgress } from '@/lib/episode-progress';

export interface ProductionEpisode {
  id: string;
  number: number;
  title: string;
  synopsis: string;
  image: string;
  imageAlt: string;
  duration?: string;
  /** Filled by the future video service; absent means not playable yet. */
  playbackUrl?: string;
  /** Un média est prêt côté serveur ; `false` = pas encore disponible (l'épisode est grisé). Absent = non précisé (fiches locales). */
  playable?: boolean;
  /** Actual playback position supplied by the video service; never inferred from selecting an episode. */
  watchProgress?: EpisodeWatchProgress;
  isDemo: boolean;
}

export interface ProductionSeason {
  number: number;
  title?: string;
  episodes: ProductionEpisode[];
}

export type ContentKind = 'film' | 'serie' | 'documentaire';

export interface Production {
  slug: string;
  /** Films and documentaries hold one season with a single feature entry; series hold real seasons. */
  kind: ContentKind;
  title: string;
  label: string;
  status: string[];
  synopsis: string;
  presenter?: string;
  heroImage: string;
  heroAlt: string;
  titleLogo?: string;
  trailerUrl?: string;
  meta: { year?: number; genres: string[]; language?: string; averageDuration?: string; rating?: string };
  seasons: ProductionSeason[];
  isDemo: boolean;
}

const ep = (season: number, number: number, title: string, synopsis: string, image: string, imageAlt: string, duration?: string): ProductionEpisode => ({
  id: `s${season}-e${number}`, number, title, synopsis, image, imageAlt, isDemo: true,
  ...(duration ? { duration } : {}),
});

// Demonstration content only — final titles, synopses and durations will be supplied separately.
export const productions: Production[] = [
  {
    slug: 'les-secrets-du-ministere',
    kind: 'serie',
    title: 'Les secrets du ministère',
    label: 'PTH ORIGINALS',
    status: ['Nouvelle saison', 'Exclusivité ORIGIN'],
    synopsis: 'Chantal reçoit celles et ceux qui servent, loin des projecteurs comme sous la lumière. Des conversations sincères sur les parcours, les épreuves et les réalités du ministère.',
    presenter: 'Chantal',
    heroImage: presenter,
    heroAlt: 'La présentatrice en tenue bordeaux au micro sur le plateau PTH.',
    meta: { year: 2026, genres: ['Podcast', 'Interview'], language: 'Français', averageDuration: '50 min' },
    isDemo: true,
    seasons: [
      { number: 1, episodes: [
        ep(1, 1, 'Le premier appel', 'Aux origines d’une vocation : le moment où tout a basculé.', episode5, 'Portrait illustratif d’un invité en costume au micro.', '47 min'),
        ep(1, 2, 'Servir dans l’ombre', 'Ceux qui portent le ministère sans jamais monter sur scène.', episode6, 'Portrait illustratif d’un invité en chemise noire au micro.', '44 min'),
        ep(1, 3, 'Tenir bon', 'Traverser le doute sans renoncer à l’essentiel.', episode7, 'Portrait illustratif d’un invité en veste claire au micro.', '51 min'),
      ] },
      { number: 2, episodes: [
        ep(2, 8, 'Les coulisses du ministère', 'Une conversation autour des réalités et des défis du ministère.', presenter, 'La présentatrice en tenue bordeaux au micro.', '52 min'),
        ep(2, 7, 'L’épreuve et l’appel', 'Quand l’épreuve devient le lieu même de l’appel.', episode7, 'Portrait illustratif d’un invité en veste claire au micro.', '49 min'),
        ep(2, 6, 'La fidélité', 'Rester constant quand plus personne ne regarde.', episode6, 'Portrait illustratif d’un invité en chemise noire au micro.', '46 min'),
        ep(2, 5, 'L’impact', 'Mesurer ce qu’une vie transformée laisse derrière elle.', episode5, 'Portrait illustratif d’un invité en costume au micro.', '50 min'),
        ep(2, 4, 'Le plateau', 'Derrière les micros : la préparation d’une rencontre.', studio, 'Le plateau d’enregistrement PTH.', '41 min'),
      ] },
    ],
  },
];

export const getProduction = (slug: string) => productions.find(p => p.slug === slug);
export const episodeCount = (p: Production) => p.seasons.reduce((n, s) => n + s.episodes.length, 0);
export function findEpisode(p: Production, episodeId?: string) {
  for (const season of p.seasons) {
    const episode = season.episodes.find(e => e.id === episodeId);
    if (episode) return { season, episode };
  }
  return undefined;
}

/** Last season's first episode — the entry point when nothing is selected yet. */
export function defaultEpisode(p: Production) {
  const season = p.seasons.at(-1);
  const episode = season?.episodes[0];
  return season && episode ? { season, episode } : undefined;
}
