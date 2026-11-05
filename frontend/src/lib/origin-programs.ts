import passagersPoster from '@/assets/les-passagers-poster.jpg';
import passagersVideo from '@/assets/les-passagers-teaser.mp4';
import derniereSortiePoster from '@/assets/derniere-sortie-poster.jpg';
import derniereSortieVideo from '@/assets/derniere-sortie.mp4';
import unNouveauMatin from '@/assets/hero-jeune-homme.jpeg';
import leTrone from '@/assets/hero-roi-trone.jpg';
import lesChoisis from '@/assets/hero-the-chosen.jpeg';
import laReineGuerriere from '@/assets/hero-reine-guerriere.jpg';
import lintervention from '@/assets/hero-intervention.jpg';
import ligneRouge from '@/assets/hero-metro-tactique.jpg';
import teaserPoster from '@/assets/origin-teaser-poster.jpg';
import teaserVideo from '@/assets/origin-teaser-15s.mp4';
import leSilencePoster from '@/assets/le-silence-poster.jpg';
import leSilenceVideo from '@/assets/le-silence-teaser.mp4';

export interface OriginProgram {
  id: string;
  title: string;
  titleLines: string[];
  tagline: string;
  synopsis: string;
  category: string;
  heroImage: string;
  imageAlt: string;
  titleLogo?: string;
  /** When supplied, the hero backdrop plays this clip instead of showing the still. */
  heroVideo?: string;
  playbackUrl?: string;
  trailerUrl?: string;
  isDemo: boolean;
}

// Visuals supplied by the editorial team; titles, taglines and synopses are
// clearly provisional demonstrations (isDemo) awaiting the real editorial data.
export const originPrograms: OriginProgram[] = [
  { id: 'le-silence', title: 'Le Silence', titleLines: ['LE', 'SILENCE'], tagline: 'Quand la foule se tait, une voix répond.', synopsis: 'Le teaser de Le Silence. Synopsis provisoire en attente du texte officiel.', category: 'Bande-annonce', heroImage: leSilencePoster, imageAlt: 'Une silhouette seule au bout d’une scène d’arène, face à une foule dense, sous d’immenses faisceaux de lumière.', heroVideo: leSilenceVideo, isDemo: true },
  { id: 'les-passagers', title: 'Les Passagers', titleLines: ['LES', 'PASSAGERS'], tagline: 'Chacun porte son histoire à bord.', synopsis: 'Le teaser de Les Passagers. Synopsis provisoire en attente du texte officiel.', category: 'Bande-annonce', heroImage: passagersPoster, imageAlt: 'Image extraite du teaser Les Passagers.', heroVideo: passagersVideo, isDemo: true },
  { id: 'derniere-sortie', title: 'Dernière sortie', titleLines: ['DERNIÈRE', 'SORTIE'], tagline: 'La nuit ne pardonne pas ceux qui roulent seuls.', synopsis: 'Un homme seul au volant traverse la nuit et la pluie, loin de tout retour possible.', category: 'Film original', heroImage: derniereSortiePoster, imageAlt: 'Une voiture roulant de nuit sous la pluie, un homme au volant, la ville en arrière-plan.', heroVideo: derniereSortieVideo, isDemo: true },
  { id: 'teaser-origin', title: 'Teaser ORIGIN', titleLines: ['ORIGIN'], tagline: 'Quinze secondes pour entrer dans l’univers.', synopsis: 'Le teaser de la plateforme ORIGIN, une présentation de quinze secondes.', category: 'Bande-annonce', heroImage: teaserPoster, imageAlt: 'Un homme de profil dans une voiture, sous la pluie, à travers une vitre couvertes de gouttes.', heroVideo: teaserVideo, isDemo: true },
  { id: 'un-nouveau-matin', title: 'Un nouveau matin', titleLines: ['UN NOUVEAU', 'MATIN'], tagline: 'Chaque renaissance commence par un sourire.', synopsis: 'Le parcours d’un jeune homme qui choisit l’espoir malgré les épreuves, et qui inspire les siens à son tour.', category: 'Série documentaire', heroImage: unNouveauMatin, imageAlt: 'Un jeune homme souriant au milieu de la foule, en pleine lumière.', isDemo: true },
  { id: 'le-trone', title: 'Le Trône', titleLines: ['LE', 'TRÔNE'], tagline: 'Régner, c’est d’abord servir.', synopsis: 'Au cœur d’une cour ancienne, un roi mesure le prix de la justice et du pouvoir.', category: 'Film original', heroImage: leTrone, imageAlt: 'Un roi pensif sur son trône, entouré de sa cour dans une lumière dorée.', isDemo: true },
  { id: 'les-choisis', title: 'Les Choisis', titleLines: ['LES', 'CHOISIS'], tagline: 'Appelés parmi tant d’autres, choisis pour plus.', synopsis: 'Trois compagnons de route avancent ensemble vers une destinée qui les dépasse.', category: 'Série originale', heroImage: lesChoisis, imageAlt: 'Trois hommes marchent ensemble, le bras l’un sur l’épaule de l’autre.', isDemo: true },
  { id: 'la-reine-guerriere', title: 'La Reine guerrière', titleLines: ['LA REINE', 'GUERRIÈRE'], tagline: 'Elle porte la force de tout un peuple.', synopsis: 'À l’aube, une reine lève les siens pour défendre sa terre et sa lignée.', category: 'Film original', heroImage: laReineGuerriere, imageAlt: 'Une reine guerrière au sommet d’un rocher, entourée de ses guerrières au lever du soleil.', isDemo: true },
  { id: 'lintervention', title: 'L’Intervention', titleLines: ['L’INTERVENTION'], tagline: 'Sauver des vies sans en détruire.', synopsis: 'Une unité d’intervention agit en milieu hostile, entre protocole et conscience.', category: 'Série originale', heroImage: lintervention, imageAlt: 'Une jeune femme armée en position dans un entrepôt sombre, ses coéquipiers derrière elle.', isDemo: true },
  { id: 'ligne-rouge', title: 'Ligne rouge', titleLines: ['LIGNE', 'ROUGE'], tagline: 'Personne ne reste neutre sur la ligne rouge.', synopsis: 'Une équipe d’agents affronte une crise souterraine où chaque décision est définitive.', category: 'Film original', heroImage: ligneRouge, imageAlt: 'Une équipe tactique progresse sur un quai de métro plongé dans la pénombre.', isDemo: true },
];
