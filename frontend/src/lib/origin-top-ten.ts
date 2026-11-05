import gladiator from '@/assets/top-gladiator.jpg';
import damnes from '@/assets/top-damnes.jpg';
import acteurs from '@/assets/top-acteurs.jpg';
import auDela from '@/assets/top-au-dela.jpg';
import { originPrograms } from './origin-programs';
import { catalogContents } from './origin-catalogs';

/** Three colours of a film's universe: main glow, deep shade, light accent. They tint the section while the title is lit. */
export type UniversePalette = readonly [string, string, string];

export interface RankedProgram {
  id: string;
  rank: number;
  title: string;
  category: string;
  poster: string;
  imageAlt: string;
  /** One line shown on the lit card. */
  tagline?: string;
  /** Colours of the film's universe; derived deterministically when the catalog does not supply them. */
  palette?: UniversePalette;
  /** Muted teaser shown while the poster is lit; absent when no clip is supplied. */
  previewVideo?: string;
  isDemo: boolean;
}

// Colours picked from each key visual (demonstration values, to be supplied by the catalog).
const palettes: Record<string, UniversePalette> = {
  gladiator: ['#c9822e', '#7a2a14', '#f0b85a'],
  damnes: ['#c01a22', '#4a0a30', '#ff5a3c'],
  acteurs: ['#b8381a', '#5a1018', '#f08a3a'],
  'au-dela': ['#d9722a', '#5a2a7a', '#ffb066'],
  'le-silence': ['#3f86a8', '#1a2f7a', '#7fe0f0'],
  'les-passagers': ['#1f9aa8', '#12407a', '#56f0c8'],
  'derniere-sortie': ['#c98a3c', '#3a1f6a', '#ff8a4a'],
  'teaser-origin': ['#7a6ad0', '#2a2a8a', '#e08ae0'],
  'un-nouveau-matin': ['#d08a5a', '#8a3a4a', '#f6c888'],
  'le-trone': ['#c29a3e', '#5a3a1a', '#f6d878'],
};
const fallbackPalettes: UniversePalette[] = [
  ['#c5562e', '#5a1a1a', '#f0a060'], ['#58b2c6', '#16405a', '#9bf8ff'], ['#c66156', '#4a1f22', '#ff9a9d'], ['#4f8fb0', '#1d3550', '#a8e0f0'],
  ['#8a6ad0', '#2e2a7a', '#d9b0ff'], ['#c2a23e', '#4a3a14', '#f6e08a'], ['#3fa88a', '#123f40', '#8af0c8'], ['#c0507a', '#4a1236', '#ff9ac0'],
];
/** Universe colours of a program: supplied by the catalog, else one of a curated set picked from its id so the choice stays stable. */
export function paletteFor(program: Pick<RankedProgram, 'id' | 'palette'>): UniversePalette {
  if (program.palette) return program.palette;
  const known = palettes[program.id];
  if (known) return known;
  let hash = 0;
  for (const char of program.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return fallbackPalettes[hash % fallbackPalettes.length] ?? fallbackPalettes[0]!;
}

export type RankingKind = 'film' | 'serie' | 'documentaire' | 'bande-annonce';
export const rankingKinds: { id: RankingKind; label: string }[] = [
  { id: 'film', label: 'Films' }, { id: 'serie', label: 'Séries' }, { id: 'documentaire', label: 'Documentaires' }, { id: 'bande-annonce', label: 'Bandes-annonces' },
];
/** Family of a program, from its category label. */
export function rankingKind(category: string): RankingKind {
  const value = category.toLowerCase();
  if (value.includes('documentaire') || value.includes('témoignage')) return 'documentaire';
  if (value.includes('série')) return 'serie';
  if (value.includes('bande-annonce') || value.includes('teaser')) return 'bande-annonce';
  return 'film';
}

// Editorial demonstration order; replace with the independently managed catalog.
// Four demonstration posters + the six hero programs keep the ranking at ten.
export const originTopTen: RankedProgram[] = [
  { id: 'gladiator', rank: 1, title: 'Gladiator', tagline: 'Dans l’arène, un homme se bat pour ce qui compte vraiment.', category: 'Film original', poster: gladiator, imageAlt: 'Un gladiateur dans une arène antique.', isDemo: true },
  { id: 'damnes', rank: 2, title: 'Damnés du Namibao', tagline: 'Une enquête sur la nuit, ses légendes et ce qu’elles cachent.', category: 'Série documentaire', poster: damnes, imageAlt: 'Un personnage fantastique devant une lune et un ciel rouge.', isDemo: true },
  { id: 'acteurs', rank: 3, title: 'Acteurs de l’ombre', tagline: 'Un détective suit une piste qui le dépasse.', category: 'Série originale', poster: acteurs, imageAlt: 'Un détective devant un homard géant.', isDemo: true },
  { id: 'au-dela', rank: 4, title: 'Au-delà', tagline: 'Au bord d’une autre planète, une astronaute fait un choix.', category: 'Série originale', poster: auDela, imageAlt: 'Une astronaute devant une planète orangée.', isDemo: true },
  ...originPrograms.slice(0, 6).map((program, index) => ({ id: program.id, rank: index + 5, title: program.title, category: program.category, tagline: program.tagline, poster: program.heroImage, imageAlt: program.imageAlt, ...(program.heroVideo ? { previewVideo: program.heroVideo } : {}), isDemo: true })),
];

/**
 * Full demonstration ranking shown by « Voir le classement complet »: the Top 10 first, then the
 * homepage catalog in its editorial order. Demo only, to be replaced by the real ranking service.
 */
export const fullRanking: RankedProgram[] = (() => {
  const seen = new Set(originTopTen.map(program => program.id));
  const rest = catalogContents
    .map(content => ({ id: content.productionSlug ?? content.id, title: content.title, category: content.category, poster: content.image, imageAlt: content.imageAlt }))
    .filter(content => !seen.has(content.id) && seen.add(content.id));
  return [...originTopTen, ...rest.map((content, index) => ({ ...content, rank: originTopTen.length + index + 1, isDemo: true }))];
})();
