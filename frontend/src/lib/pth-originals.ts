import chantal from '@/assets/pth-presentatrice-bordeaux.jpg';
import episode7 from '@/assets/pth-episode-7.jpg';
import episode6 from '@/assets/pth-episode-6.jpg';
import episode5 from '@/assets/pth-episode-5.jpg';

export interface PthEpisode {
  id: string;
  number: number;
  /** Season number; defaults to 2 (the demo data only holds the current season). */
  season?: number;
  title: string;
  image: string;
  imageAlt: string;
  duration?: string;
  playbackUrl?: string;
  isDemo: boolean;
}

// Reference-based editorial preview; portraits other than Chantal are illustrative.
export const pthEpisodes: PthEpisode[] = [
  { id: 'episode-8', number: 8, title: 'Les coulisses du ministère', image: chantal, imageAlt: 'La présentatrice en tenue bordeaux au micro dans un studio d’enregistrement.', duration: '52 min', isDemo: true },
  { id: 'episode-7', number: 7, title: 'L’épreuve et l’appel', image: episode7, imageAlt: 'Portrait illustratif d’un invité en veste claire au micro.', isDemo: true },
  { id: 'episode-6', number: 6, title: 'La fidélité', image: episode6, imageAlt: 'Portrait illustratif d’un invité en chemise noire au micro.', isDemo: true },
  { id: 'episode-5', number: 5, title: 'L’impact', image: episode5, imageAlt: 'Portrait illustratif d’un invité en costume au micro.', isDemo: true },
];