import deuxFoisOui from '@/assets/deux-fois-oui.jpg';
import plusQuunReve from '@/assets/sugg-plus-quun-reve.jpg';
import briserLeCycle from '@/assets/sugg-briser-le-cycle.jpg';
import seRelever from '@/assets/sugg-se-relever.jpg';
import leJour from '@/assets/sugg-le-jour.jpg';
import yvanCastanou from '@/assets/yvan-castanou.jpg';
import joshuaSelman from '@/assets/joshua-selman.jpg';
import nathanielBassey from '@/assets/nathaniel-bassey.jpg';

// Typographic personality of the card title: each suggestion carries its own
// art direction, like an editorial cover, because suggestions span categories.
export type SuggestionFontStyle = 'condensed' | 'serif' | 'bebas' | 'italic-serif';

export interface SuggestedProgram {
  id: string;
  title: string;
  titleLines: string[];
  /** One-line hook shown on the highlighted card. */
  tagline?: string;
  category: string;
  duration: string;
  poster: string;
  imageAlt: string;
  fontStyle: SuggestionFontStyle;
  isDemo: boolean;
}

// Editorial demonstration data; replace with the independently managed catalog.
// Suggestions intentionally mix categories and typographic personalities.
export const originSuggestions: SuggestedProgram[] = [
  { id: 'deux-fois-oui', title: 'Deux fois oui', titleLines: ['DEUX', 'FOIS OUI'], tagline: 'Après le oui, il reste à apprendre à s’aimer.', category: 'Série documentaire', duration: '52 min', poster: deuxFoisOui, imageAlt: 'Une femme et un homme face au soleil couchant sur la côte.', fontStyle: 'condensed', isDemo: true },
  { id: 'yvan-castanou-enseignement', title: 'Le courage de croire', titleLines: ['Le courage', 'de croire'], tagline: 'Six enseignements pour tenir quand tout vacille.', category: 'Enseignement', duration: '6 épisodes', poster: yvanCastanou, imageAlt: 'L’apôtre Yvan Castanou souriant, micro en main, sur une scène baignée de lumière bleue.', fontStyle: 'italic-serif', isDemo: true },
  { id: 'briser-le-cycle', title: 'Briser le cycle', titleLines: ['BRISER', 'LE CYCLE'], tagline: 'Quand le doute serre le cœur, l’espérance apprend à tenir.', category: 'Série originale', duration: '1 h 12', poster: briserLeCycle, imageAlt: 'Une jeune femme recueillie, les mains jointes, éclairée par une lumière chaude.', fontStyle: 'bebas', isDemo: true },
  { id: 'nathaniel-bassey-louange', title: 'Le son de la louange', titleLines: ['LE SON DE', 'LA LOUANGE'], tagline: 'Une nuit de louange enregistrée en public.', category: 'Louange & musique', duration: '1 h 30', poster: nathanielBassey, imageAlt: 'Nathaniel Bassey jouant de la trompette sur scène, éclairé par des projecteurs.', fontStyle: 'serif', isDemo: true },
  { id: 'se-relever-en-silence', title: 'Se relever en silence', titleLines: ['SE RELEVER', 'EN SILENCE'], tagline: 'Il a tout perdu sans un bruit. Il raconte la suite.', category: 'Documentaire', duration: '46 min', poster: seRelever, imageAlt: 'Un homme aux cheveux bouclés, la tête baissée dans une lumière chaude.', fontStyle: 'italic-serif', isDemo: true },
  { id: 'joshua-selman-conference', title: 'Puissance & intimité', titleLines: ['PUISSANCE', '& INTIMITÉ'], tagline: 'Huit soirées sur la prière et la vie intérieure.', category: 'Conférence', duration: '8 épisodes', poster: joshuaSelman, imageAlt: 'L’apôtre Joshua Selman prêchant sous un chapiteau baigné de lumière ambre.', fontStyle: 'bebas', isDemo: true },
  { id: 'plus-quun-reve', title: 'Plus qu’un rêve', titleLines: ['PLUS', 'QU’UN RÊVE'], tagline: 'Un rêve d’enfant, une ville qui n’y croit pas.', category: 'Film original', duration: '48 min', poster: plusQuunReve, imageAlt: 'Un jeune homme regardant le ciel au coucher du soleil, une ville en arrière-plan.', fontStyle: 'condensed', isDemo: true },
  { id: 'le-jour-ou-tout-a-change', title: 'Le jour où tout a changé', titleLines: ['LE JOUR OÙ', 'TOUT A CHANGÉ'], tagline: 'Le matin où une seule décision a tout déplacé.', category: 'Série documentaire', duration: '1 h 05', poster: leJour, imageAlt: 'Une jeune femme regardant le ciel au coucher du soleil au-dessus d’une ville.', fontStyle: 'serif', isDemo: true },
];

