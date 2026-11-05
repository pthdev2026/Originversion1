import { originPrograms } from './origin-programs';
import { productions } from './productions';
import plusQuunReve from '@/assets/sugg-plus-quun-reve.jpg';
import briserLeCycle from '@/assets/sugg-briser-le-cycle.jpg';
import seRelever from '@/assets/sugg-se-relever.jpg';
import toutRecommencer from '@/assets/tout-recommencer.jpg';
import apresLaTempete from '@/assets/apres-la-tempete.jpg';
import retrouverSaVoix from '@/assets/retrouver-sa-voix.jpg';
import suspense1 from '@/assets/genre-suspense-1.jpg';
import suspense2 from '@/assets/genre-suspense-2.jpg';
import suspense3 from '@/assets/genre-suspense-3.jpg';
import suspense4 from '@/assets/genre-suspense-4.jpg';
import scifi1 from '@/assets/genre-scifi-1.jpg';
import scifi2 from '@/assets/genre-scifi-2.jpg';
import scifi3 from '@/assets/genre-scifi-3.jpg';
import scifi4 from '@/assets/genre-scifi-4.jpg';
import scifi5 from '@/assets/genre-scifi-5.jpg';

export interface CatalogContent {
  id: string;
  title: string;
  category: string;
  image: string;
  imageAlt: string;
  /** CSS object-position of the subject (e.g. « 62% 30% »): keeps the face in frame when the still is cropped to a portrait format. */
  focus?: string;
  synopsis?: string;
  productionSlug?: string;
  badge?: string;
  /** Aperçu vidéo muet (annoncé par le catalogue serveur) ; absent = l'image seule. */
  previewVideo?: string;
  themes: string[];
  isDemo: boolean;
}

export interface CatalogCollection {
  id: string;
  title: string;
  contents: CatalogContent[];
  badge?: string;
  viewAllUrl?: string;
  cardStyle?: 'standard' | 'portrait';
}

export interface CatalogTheme { id: string; title: string; image: string }

// Editorial demonstration only. No release dates, real guest associations or playback claims.
// The CMS can replace these collections and topic assignments independently of the UI.
const programThemes: Record<string, string[]> = {
  'un-nouveau-matin': ['couple', 'mariage', 'famille', 'reconstruction', 'temoignages'],
  'le-trone': ['leadership', 'foi', 'societe'],
  'les-choisis': ['foi', 'relations', 'temoignages'],
  'la-reine-guerriere': ['leadership', 'identite', 'societe'],
  'lintervention': ['societe', 'relations'],
  'ligne-rouge': ['societe', 'reconstruction'],
};

export const catalogContents: CatalogContent[] = [
  ...originPrograms.map(program => ({
    id: program.id, title: program.title, category: program.category,
    image: program.heroImage, imageAlt: program.imageAlt, synopsis: program.synopsis,
    themes: programThemes[program.id] ?? [], isDemo: true,
  })),
  { id: 'plus-quun-reve', title: 'Plus qu’un rêve', category: 'Film original', image: plusQuunReve, imageAlt: 'Un jeune homme devant une ville au coucher du soleil.', synopsis: 'Un rêve d’enfant, une ville qui n’y croit pas. Le parcours d’un jeune homme qui apprend qui il est.', themes: ['identite', 'leadership', 'societe'], isDemo: true },
  { id: 'briser-le-cycle', title: 'Briser le cycle', category: 'Série originale', image: briserLeCycle, imageAlt: 'Portrait d’une femme dans une lumière chaude.', synopsis: 'Quand le doute serre le cœur, l’espérance apprend à tenir. Une série sur ce que coûte et ce que libère le pardon.', themes: ['famille', 'pardon', 'reconstruction', 'temoignages'], isDemo: true },
  { id: 'se-relever-en-silence', title: 'Se relever en silence', category: 'Documentaire', image: seRelever, imageAlt: 'Un homme recueilli dans une lumière chaude.', synopsis: 'Il a tout perdu sans un bruit. Des années plus tard, il raconte ce qui l’a remis debout.', themes: ['reconstruction', 'foi', 'temoignages'], isDemo: true },
  { id: 'tout-recommencer', title: 'Tout recommencer', category: 'Film original', image: toutRecommencer, imageAlt: 'Un homme pensif face à une ville illuminée au crépuscule.', synopsis: 'Après un effondrement, il part à la recherche d’un nouveau départ. Un voyage intime vers la guérison et l’espoir.', themes: ['reconstruction', 'pardon', 'temoignages'], isDemo: true },
  { id: 'apres-la-tempete', title: 'Après la tempête', category: 'Film original', image: apresLaTempete, imageAlt: 'Un randonneur seul face à une vallée de montagnes au soleil couchant.', synopsis: 'Seul face aux montagnes, un homme apprend à faire la paix avec ce qu’il a traversé.', themes: ['reconstruction', 'foi'], isDemo: true },
  { id: 'retrouver-sa-voix', title: 'Retrouver sa voix', category: 'Témoignage', image: retrouverSaVoix, imageAlt: 'Une jeune femme pensive regardant par la fenêtre d’un train.', synopsis: 'Longtemps, elle a laissé les autres parler pour elle. Le récit d’une femme qui ose enfin dire qui elle est.', themes: ['identite', 'temoignages', 'relations'], isDemo: true },
  // Genre demonstrations for the Suspense and Science-Fiction collections. Demo only.
  { id: 'ombre-du-secret', title: 'L’Ombre du secret', category: 'Série originale', image: suspense1, imageAlt: 'Une femme en pleine lumière dans un couloir sombre.', themes: [], isDemo: true },
  { id: 'le-dernier-temoin', title: 'Le Dernier Témoin', category: 'Film original', image: suspense2, imageAlt: 'Une silhouette sous un lampadaire dans une rue nocturne.', themes: [], isDemo: true },
  { id: 'nuit-blanche', title: 'Nuit blanche', category: 'Série originale', image: suspense3, imageAlt: 'Une porte entrouverte laissant passer un faisceau de lumière.', themes: [], isDemo: true },
  { id: 'a-decouvert', title: 'À découvert', category: 'Film original', image: suspense4, imageAlt: 'Un visage tendu, éclairé par un écran dans le noir.', themes: [], isDemo: true },
  { id: 'nouvelle-terre', title: 'Nouvelle Terre', category: 'Série originale', image: scifi1, imageAlt: 'Une silhouette sur un toit face à une ville futuriste.', themes: [], isDemo: true },
  { id: 'signal-perdu', title: 'Signal perdu', category: 'Film original', image: scifi2, imageAlt: 'Un casque d’astronaute reflétant les étoiles.', themes: [], isDemo: true },
  { id: 'leveil', title: 'L’Éveil', category: 'Série originale', image: scifi3, imageAlt: 'Une structure mystérieuse illuminée dans le désert.', themes: [], isDemo: true },
  { id: 'protocole-minuit', title: 'Protocole Minuit', category: 'Série originale', image: scifi4, imageAlt: 'Un couloir de serveurs baigné de lumière froide.', themes: [], isDemo: true },
  { id: 'hors-du-temps', title: 'Hors du temps', category: 'Film original', image: scifi5, imageAlt: 'Un poste de pilotage spatial aux instruments ambrés.', themes: [], isDemo: true },
  ...productions.map(production => ({
    id: production.slug, title: production.title, category: 'PTH Originals · Interview',
    image: production.heroImage, imageAlt: production.heroAlt, synopsis: production.synopsis,
    productionSlug: production.slug, themes: ['ministere', 'foi', 'leadership', 'temoignages'], isDemo: true,
  })),
];

const select = (...ids: string[]) => ids.flatMap(id => {
  const content = catalogContents.find(item => item.id === id);
  return content ? [content] : [];
});

export const originCatalogs = {
  newReleases: { id: 'nouveautes', title: 'Nouveautés sur ORIGIN', badge: 'NOUVEAU', contents: select('les-secrets-du-ministere', 'un-nouveau-matin', 'le-trone', 'les-choisis', 'la-reine-guerriere', 'lintervention', 'ligne-rouge') },
  suspense: { id: 'suspense', title: 'Suspense', contents: select('ombre-du-secret', 'le-dernier-temoin', 'nuit-blanche', 'a-decouvert', 'lintervention', 'briser-le-cycle') },
  drama: { id: 'drama', title: 'Drama', contents: select('un-nouveau-matin', 'le-trone', 'les-choisis', 'la-reine-guerriere', 'briser-le-cycle', 'se-relever-en-silence') },
  couple: { id: 'couple', title: 'Couple', cardStyle: 'portrait', contents: select('un-nouveau-matin', 'les-choisis', 'briser-le-cycle', 'se-relever-en-silence', 'ligne-rouge') },
  scienceFiction: { id: 'science-fiction', title: 'Science-Fiction', contents: select('nouvelle-terre', 'signal-perdu', 'leveil', 'protocole-minuit', 'hors-du-temps') },
} satisfies Record<string, CatalogCollection>;

const themeLabels = [
  ['tendances', 'Tendances'], ['foi', 'Foi & Spiritualité'], ['couple', 'Couple'],
  ['mariage', 'Mariage'], ['famille', 'Famille'], ['identite', 'Identité'],
  ['relations', 'Relations'], ['pardon', 'Pardon'], ['reconstruction', 'Reconstruction'],
  ['leadership', 'Leadership'], ['ministere', 'Ministère'], ['temoignages', 'Témoignages'],
  ['societe', 'Société'], ['all', 'Toutes les thématiques'],
];

/** Ordre des programmes d'une thématique et liste des tendances, fournis par le serveur (vides tant qu'il n'a pas répondu). */
const themeOrder: Record<string, string[]> = {};
const trendingIds: string[] = [];

export function contentsForTheme(id: string) {
  if (id === 'tendances' && trendingIds.length > 0) return trendingIds.flatMap(slug => { const content = catalogContents.find(item => item.id === slug); return content ? [content] : []; });
  if (id === 'all' || id === 'tendances') return catalogContents;
  const members = catalogContents.filter(content => content.themes.includes(id));
  const order = themeOrder[id];
  if (!order) return members;
  // Ordre du serveur (classement) d'abord ; les autres membres gardent leur ordre d'origine.
  const position = (content: CatalogContent) => { const index = order.indexOf(content.id); return index < 0 ? order.length : index; };
  return members.map((content, index) => ({ content, index })).sort((a, b) => position(a.content) - position(b.content) || a.index - b.index).map(item => item.content);
}

/** Editorial framing of each theme in the explorer: one-line promise and the featured ("phare") content shown first. Demo only. */
export interface ThemeShowcase { subtitle: string; featuredId: string }

export const themeShowcase: Record<string, ThemeShowcase> = {
  tendances: { subtitle: 'Société et grands enjeux', featuredId: 'les-secrets-du-ministere' },
  foi: { subtitle: 'Sens et vie intérieure', featuredId: 'apres-la-tempete' },
  couple: { subtitle: 'Relations et vie à deux', featuredId: 'un-nouveau-matin' },
  mariage: { subtitle: 'Engagement et vie à deux', featuredId: 'un-nouveau-matin' },
  famille: { subtitle: 'Liens et générations', featuredId: 'briser-le-cycle' },
  identite: { subtitle: 'Se découvrir et s’affirmer', featuredId: 'retrouver-sa-voix' },
  relations: { subtitle: 'Ce qui nous relie', featuredId: 'les-choisis' },
  pardon: { subtitle: 'Guérison et nouveaux départs', featuredId: 'briser-le-cycle' },
  reconstruction: { subtitle: 'Après l’épreuve', featuredId: 'tout-recommencer' },
  leadership: { subtitle: 'Influence et impact positif', featuredId: 'le-trone' },
  ministere: { subtitle: 'Servir et transmettre', featuredId: 'les-secrets-du-ministere' },
  temoignages: { subtitle: 'Des parcours qui inspirent', featuredId: 'se-relever-en-silence' },
  societe: { subtitle: 'Les questions de notre temps', featuredId: 'ligne-rouge' },
};

/** Themes shown directly in the explorer rail; the others open from « Toutes les thématiques ». */
export const themeRailOrder = ['tendances', 'couple', 'famille', 'reconstruction', 'foi', 'identite'];

/** The featured content of a theme first, then the rest of its selection. */
export function themeSelection(id: string, limit = 10) {
  const contents = contentsForTheme(id);
  const featured = catalogContents.find(content => content.id === themeShowcase[id]?.featuredId) ?? contents[0] ?? catalogContents[0]!;
  return { featured, contents: [featured, ...contents.filter(content => content.id !== featured.id)].slice(0, limit) };
}

export const catalogThemes: CatalogTheme[] = themeLabels.map(([id, title]) => ({
  id: id ?? 'all', title: title ?? '',
  image: themeSelection(id ?? 'all').featured.image,
}));
/** Muted teaser for a catalog card, borrowed from the hero programs when one exists for the same title. */
export function previewVideoFor(content: CatalogContent, programs: { id: string; heroVideo?: string }[]) {
  return programs.find(program => program.id === content.id || program.id === content.productionSlug)?.heroVideo;
}

/** « Regarder la série / le film / … », derived from the editorial category of a title. */
export function watchLabel(category: string) {
  const value = category.toLowerCase();
  if (value.includes('série')) return 'Regarder la série';
  if (value.includes('film')) return 'Regarder le film';
  if (value.includes('documentaire')) return 'Regarder le documentaire';
  if (value.includes('bande-annonce') || value.includes('teaser')) return 'Voir la bande-annonce';
  if (value.includes('podcast') || value.includes('émission')) return 'Regarder l’émission';
  return 'Regarder la vidéo';
}

/**
 * Remplace, EN PLACE, le catalogue embarqué par celui du serveur (les composants et les fonctions `contentsForTheme`,
 * `themeSelection`, `contentById`… continuent de lire les mêmes tableaux). Idempotent ; sans effet si le serveur ne renvoie aucune fiche.
 * Les pseudo-thématiques « Tendances » et « Toutes les thématiques » restent des vues du catalogue, pas des thèmes du serveur.
 */
export function applyServerCatalog(
  contents: CatalogContent[], themes: { id: string; title: string }[],
  editorial?: { themeShowcase?: Record<string, ThemeShowcase>; themeOrder?: Record<string, string[]>; trending?: string[] },
) {
  if (contents.length === 0) return;
  catalogContents.splice(0, catalogContents.length, ...contents);
  // Cadrage éditorial du serveur : remplace les valeurs de démonstration thématique par thématique (sous-titre vide : on garde l'ancien texte).
  for (const key of Object.keys(themeOrder)) delete themeOrder[key];
  Object.assign(themeOrder, editorial?.themeOrder ?? {});
  trendingIds.splice(0, trendingIds.length, ...(editorial?.trending ?? []));
  for (const [id, entry] of Object.entries(editorial?.themeShowcase ?? {})) themeShowcase[id] = { subtitle: entry.subtitle || themeShowcase[id]?.subtitle || '', featuredId: entry.featuredId };
  const firstTrending = trendingIds[0];
  if (firstTrending) themeShowcase['tendances'] = { subtitle: themeShowcase['tendances']?.subtitle ?? '', featuredId: firstTrending };
  const labelled = [{ id: 'tendances', title: 'Tendances' }, ...themes, { id: 'all', title: 'Toutes les thématiques' }];
  catalogThemes.splice(0, catalogThemes.length, ...labelled.map(theme => ({ id: theme.id, title: theme.title, image: themeSelection(theme.id).featured.image })));
}
