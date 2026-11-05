import { originCreators, type OriginCreator } from './origin-creators';
import briserLeCycle from '@/assets/sugg-briser-le-cycle.jpg';
import seRelever from '@/assets/sugg-se-relever.jpg';
import toutRecommencer from '@/assets/tout-recommencer.jpg';
import apresLaTempete from '@/assets/apres-la-tempete.jpg';
import pthEpisode5 from '@/assets/pth-episode-5.jpg';
import pthEpisode7 from '@/assets/pth-episode-7.jpg';
import leSilence from '@/assets/le-silence-poster.jpg';
import lumiereRouge from '@/assets/temoignage-lumiere-rouge.jpg';
import silence from '@/assets/temoignage-silence.jpg';
import jeuneHomme from '@/assets/hero-jeune-homme.jpeg';
import yvanStage from '@/assets/yvan-castanou.jpg';
import selmanStage from '@/assets/joshua-selman.jpg';
import basseyStage from '@/assets/nathaniel-bassey.jpg';

export type CreatorContentKind = 'message' | 'conference' | 'serie' | 'live';

export const creatorKindLabel: Record<CreatorContentKind, string> = {
  message: 'Message', conference: 'Conférence', serie: 'Série', live: 'En direct',
};

export interface CreatorContent {
  /** Globally unique, resolvable by the watch landing (/production/$slug). */
  id: string;
  title: string;
  kind: CreatorContentKind;
  /** Duration, or the scheduled slot for a live. */
  duration: string;
  image: string;
  imageAlt: string;
  synopsis: string;
  /** Editorial highlight shown on the detail card (À la une, En direct…). */
  highlight?: string;
  episode?: string;
  isDemo: boolean;
}

export interface CreatorChapter { mark: string; title: string; text: string }

export interface CreatorUniverse {
  creator: OriginCreator;
  alias: string;
  domain: string;
  tagline: string;
  /** Accent of the universe as "R G B" for rgb(var(--accent)). */
  accent: string;
  chapters: CreatorChapter[];
  contents: CreatorContent[];
  /** Editorial texts and catalogue are demonstrations until supplied by the editorial team. */
  isProvisional: boolean;
}

type Draft = Omit<CreatorContent, 'id' | 'isDemo'>;
const draft = (title: string, kind: CreatorContentKind, duration: string, image: string, imageAlt: string, synopsis: string, extra: Partial<Draft> = {}): Draft =>
  ({ title, kind, duration, image, imageAlt, synopsis, ...extra });
const slugify = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

interface UniverseDraft extends Omit<CreatorUniverse, 'creator' | 'contents' | 'isProvisional'> { contents: Draft[] }

// Demonstration universes: aliases, taglines, chapters and catalogue are provisional and replaceable by the CMS.
const drafts: Record<string, UniverseDraft> = {
  'yvan-castanou': {
    alias: 'Apôtre', domain: 'Prédication', accent: '96 140 255',
    tagline: 'Des enseignements et des messages pour une vie transformée par la Parole, portés avec énergie et simplicité.',
    chapters: [
      { mark: 'I', title: 'L’appel', text: 'Le jour où une Parole entendue devient une mission à transmettre.' },
      { mark: 'II', title: 'La Parole', text: 'Des messages clairs et pratiques pour vivre sa foi au quotidien.' },
      { mark: 'III', title: 'L’impact', text: 'Des salles pleines et une communauté qui grandit au-delà de la scène.' },
    ],
    contents: [
      draft('La foi dans les temps d’incertitude', 'message', '1:12:00', leSilence, 'Une foule sous des faisceaux de lumière.', 'La confiance en Dieu au milieu des défis, et ce qui tient quand tout vacille.', { highlight: 'À la une' }),
      draft('Marcher par la foi', 'message', '46:20', yvanStage, 'Yvan Castanou sur scène, micro en main.', 'Avancer sans tout voir, un pas après l’autre.'),
      draft('L’autorité du croyant', 'serie', '52:10', seRelever, 'Un homme recueilli dans une lumière chaude.', 'Une série sur l’identité et l’autorité spirituelle.', { episode: 'Ép. 01' }),
      draft('Vivre dans la faveur', 'conference', '1:14:32', lumiereRouge, 'Un homme en blanc au milieu d’une foule.', 'Une conférence enregistrée devant une salle comble.'),
      draft('Nuit de réveil', 'live', 'Ce soir · 20 h', silence, 'Un visage dans la pénombre.', 'Un direct de louange et de prière, ouvert à tous.', { highlight: 'En direct' }),
      draft('La prière stratégique', 'message', '38:15', jeuneHomme, 'Un jeune homme souriant dans la foule.', 'Prier avec intention, et voir les choses bouger.'),
      draft('Bâtir sur le roc', 'serie', '1:02:11', toutRecommencer, 'Un homme face à une ville au crépuscule.', 'Construire une vie qui résiste aux tempêtes.', { episode: 'Ép. 02' }),
      draft('Se relever après l’épreuve', 'conference', '44:08', briserLeCycle, 'Une femme recueillie, les mains jointes.', 'Ce que la chute enseigne, et comment repartir.'),
    ],
  },
  'benny-hinn': {
    alias: 'Évangéliste', domain: 'Enseignement', accent: '120 110 255',
    tagline: 'Des enseignements sur la présence de Dieu, la prière et la guérison.',
    chapters: [
      { mark: 'I', title: 'La prière', text: 'Un parcours marqué par la place donnée à la prière.' },
      { mark: 'II', title: 'La présence', text: 'Un enseignement centré sur l’intimité avec Dieu.' },
      { mark: 'III', title: 'Le monde', text: 'Des rassemblements sur plusieurs continents.' },
    ],
    contents: [
      draft('Le toucher de Dieu', 'conference', '1:20:05', lumiereRouge, 'Un homme en blanc au milieu d’une foule.', 'Une conférence sur la présence et la guérison.', { highlight: 'À la une' }),
      draft('La puissance de la prière', 'message', '41:12', apresLaTempete, 'Un randonneur face aux montagnes.', 'Prier sans cesse, et pourquoi c’est possible.'),
      draft('La présence', 'serie', '48:30', silence, 'Un visage dans la pénombre.', 'Une série sur l’intimité avec Dieu.', { episode: 'Ép. 01' }),
      draft('Nuit de miracles', 'live', 'Demain · 21 h', leSilence, 'Une foule sous des faisceaux de lumière.', 'Un direct de prière et de témoignages.', { highlight: 'En direct' }),
      draft('La guérison aujourd’hui', 'conference', '1:05:18', jeuneHomme, 'Un jeune homme souriant dans la foule.', 'Témoignages et enseignement sur la guérison.'),
    ],
  },
  'chris-oyakhilome': {
    alias: 'Pasteur', domain: 'Prédication', accent: '190 200 220',
    tagline: 'Des messages sur la Parole, la foi agissante et la vie nouvelle.',
    chapters: [
      { mark: 'I', title: 'La vision', text: 'Porter la Parole partout où c’est possible.' },
      { mark: 'II', title: 'L’enseignement', text: 'Une foi qui agit, des principes à vivre.' },
      { mark: 'III', title: 'Le rayonnement', text: 'Une audience touchée bien au-delà des salles.' },
    ],
    contents: [
      draft('Le pouvoir de la Parole', 'message', '55:02', leSilence, 'Une foule sous des faisceaux de lumière.', 'Ce que la Parole produit quand on la reçoit vraiment.', { highlight: 'À la une' }),
      draft('Une nouvelle création', 'serie', '47:40', toutRecommencer, 'Un homme face à une ville au crépuscule.', 'Une série sur l’identité nouvelle.', { episode: 'Ép. 01' }),
      draft('La foi agissante', 'message', '39:51', seRelever, 'Un homme recueilli dans une lumière chaude.', 'La foi qui passe à l’action.'),
      draft('Nuit de guérison', 'live', 'Samedi · 19 h', silence, 'Un visage dans la pénombre.', 'Un grand direct de prière.', { highlight: 'En direct' }),
      draft('Vivre au-dessus', 'conference', '1:10:22', lumiereRouge, 'Un homme en blanc au milieu d’une foule.', 'Une conférence sur la victoire au quotidien.'),
    ],
  },
  'joshua-selman': {
    alias: 'Apôtre', domain: 'Enseignement', accent: '255 170 90',
    tagline: 'Des conférences sur la prière, la vie intérieure et la croissance spirituelle.',
    chapters: [
      { mark: 'I', title: 'La prière', text: 'Tout commence dans le lieu secret.' },
      { mark: 'II', title: 'La profondeur', text: 'Enseigner lentement, pour que cela reste.' },
      { mark: 'III', title: 'La jeunesse', text: 'Une génération qui se lève avec soif.' },
    ],
    contents: [
      draft('Puissance & intimité', 'conference', '8 épisodes', selmanStage, 'Joshua Selman prêchant sous une lumière ambre.', 'Huit soirées sur la prière et la vie intérieure.', { highlight: 'À la une' }),
      draft('Les voies de l’Esprit', 'serie', '51:09', leSilence, 'Une foule sous des faisceaux de lumière.', 'Une série d’enseignements.', { episode: 'Ép. 01' }),
      draft('La prière qui change tout', 'message', '1:01:44', jeuneHomme, 'Un jeune homme souriant dans la foule.', 'Pourquoi la prière précède toute percée.'),
      draft('Rencontre en direct', 'live', 'Vendredi · 18 h', lumiereRouge, 'Un homme en blanc au milieu d’une foule.', 'Un direct d’enseignement et de prière.', { highlight: 'En direct' }),
      draft('Les temps et les saisons', 'message', '47:25', seRelever, 'Un homme recueilli dans une lumière chaude.', 'Discerner le moment présent.'),
      draft('La grâce pour avancer', 'conference', '1:18:02', apresLaTempete, 'Un randonneur face aux montagnes.', 'Une conférence sur la persévérance.'),
    ],
  },
  'nathaniel-bassey': {
    alias: 'Pasteur', domain: 'Louange', accent: '220 90 120',
    tagline: 'Louange, adoration et trompette : des moments où la musique devient prière.',
    chapters: [
      { mark: 'I', title: 'La trompette', text: 'Un instrument devenu langage de louange.' },
      { mark: 'II', title: 'L’adoration', text: 'Des nuits entières tournées vers Dieu.' },
      { mark: 'III', title: 'Le rassemblement', text: 'Des voix réunies, en salle comme en ligne.' },
    ],
    contents: [
      draft('Le son de la louange', 'conference', '1:30:00', basseyStage, 'Nathaniel Bassey jouant de la trompette sur scène.', 'Une nuit de louange enregistrée en public.', { highlight: 'À la une' }),
      draft('Nuit d’adoration', 'live', 'Ce soir · 23 h', lumiereRouge, 'Un homme en blanc au milieu d’une foule.', 'Un direct d’adoration jusqu’à minuit.', { highlight: 'En direct' }),
      draft('Ses noms', 'serie', '28:14', pthEpisode7, 'Un invité au micro dans un studio.', 'Une série musicale.', { episode: 'Ép. 01' }),
      draft('Adoration intime', 'message', '34:50', silence, 'Un visage dans la pénombre.', 'Un temps d’adoration acoustique.'),
      draft('Trompette du matin', 'message', '18:06', pthEpisode5, 'Un invité au micro dans un studio.', 'Une louange pour commencer la journée.'),
    ],
  },
};

export const creatorUniverses: CreatorUniverse[] = originCreators.flatMap(creator => {
  const universe = drafts[creator.id];
  if (!universe) return [];
  return [{
    ...universe, creator, isProvisional: true,
    contents: universe.contents.map(content => ({ ...content, id: `${creator.id}--${slugify(content.title)}`, isDemo: true })),
  }];
});

export const getCreatorUniverse = (id: string) => creatorUniverses.find(universe => universe.creator.id === id);

/** Every creator content, so the universal watch landing can resolve them. */
export const creatorContents: CreatorContent[] = creatorUniverses.flatMap(universe => universe.contents);
