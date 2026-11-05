import deuxFoisOui from '@/assets/deux-fois-oui.jpg';
import mariage from '@/assets/temoignage-mariage.jpg';
import silence from '@/assets/temoignage-silence.jpg';
import lumiereRouge from '@/assets/temoignage-lumiere-rouge.jpg';
import reconstruction from '@/assets/temoignage-reconstruction.jpg';
import type { SuggestedProgram } from '@/lib/origin-suggestions';

// The five testimonial panels of "Ils ont osé raconter leur histoire".
// Kept separate from the recommendation rail so the approved five-panel
// composition is preserved independently; four visuals were supplied by the
// editorial team, "Deux fois oui" completes the composition.
// Editorial demonstration data: titles and durations are placeholders
// (isDemo) until the real testimonial programs are provided.
export const originTestimonials: SuggestedProgram[] = [
  { id: 'temoignage-mariage', title: 'Il a épousé une autre', titleLines: ['IL A ÉPOUSÉ', 'UNE AUTRE'], category: 'Témoignage', duration: '32 min', poster: mariage, imageAlt: 'Une femme en larmes lors d’un mariage, le couple de mariés flou derrière elle.', fontStyle: 'serif', isDemo: true },
  { id: 'temoignage-silence', title: 'Le poids du silence', titleLines: ['LE POIDS', 'DU SILENCE'], category: 'Témoignage', duration: '28 min', poster: silence, imageAlt: 'Un homme la main sur la bouche, un visage sombre qui se dessine derrière lui.', fontStyle: 'italic-serif', isDemo: true },
  { id: 'deux-fois-oui', title: 'Deux fois oui', titleLines: ['DEUX', 'FOIS OUI'], category: 'Série documentaire', duration: '52 min', poster: deuxFoisOui, imageAlt: 'Une femme et un homme face au soleil couchant sur la côte.', fontStyle: 'condensed', isDemo: true },
  { id: 'temoignage-lumiere-rouge', title: 'Debout au milieu des siens', titleLines: ['DEBOUT AU', 'MILIEU DES SIENS'], category: 'Documentaire', duration: '41 min', poster: lumiereRouge, imageAlt: 'Un homme en chemise blanche, seul et lumineux au milieu d’une foule baignée de rouge.', fontStyle: 'bebas', isDemo: true },
  { id: 'temoignage-reconstruction', title: 'Repartir de zéro', titleLines: ['REPARTIR', 'DE ZÉRO'], category: 'Témoignage', duration: '35 min', poster: reconstruction, imageAlt: 'Un visage meurtri éclairé par des néons, une flamme ranimée au premier plan.', fontStyle: 'bebas', isDemo: true },
];
