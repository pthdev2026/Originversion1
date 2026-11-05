import yvan from '@/assets/yvan-castanou.jpeg';
import benny from '@/assets/benny-hinn.jpeg';
import chris from '@/assets/pastor-chris.jpeg';
import selman from '@/assets/joshua-selman.jpeg';
import bassey from '@/assets/nathaniel-bassey.jpeg';

export interface OriginCreator {
  id: string;
  name: string;
  /** Show title; undefined until editorially confirmed. */
  showTitle?: string;
  themes: string[];
  /** Provisional presentation, clearly flagged until supplied by the editorial team. */
  intro: string;
  image: string;
  imageAlt: string;
  /** CSS object-position keeping the face visible. */
  focus: string;
  /** Per-card ambient tint token name. */
  ambience: 'ember' | 'bordeaux' | 'graphite' | 'amber' | 'night';
  isProvisional: boolean;
}

const PROVISIONAL_INTRO = 'Présentation éditoriale à venir — contenu provisoire.';

// Real creator photographs. Show titles and texts are placeholders until confirmed.
export const originCreators: OriginCreator[] = [
  { id: 'yvan-castanou', name: 'Apôtre Yvan Castanou', themes: ['Prédication', 'Foi'], intro: PROVISIONAL_INTRO, image: yvan, imageAlt: 'Apôtre Yvan Castanou souriant sur scène, micro en main.', focus: '50% 30%', ambience: 'ember', isProvisional: true },
  { id: 'benny-hinn', name: 'Benny Hinn', themes: ['Enseignement', 'Foi'], intro: PROVISIONAL_INTRO, image: benny, imageAlt: 'Portrait de Benny Hinn en costume sombre.', focus: '50% 25%', ambience: 'night', isProvisional: true },
  { id: 'chris-oyakhilome', name: 'Pasteur Chris Oyakhilome', themes: ['Prédication', 'Guérison'], intro: PROVISIONAL_INTRO, image: chris, imageAlt: 'Pasteur Chris Oyakhilome en costume blanc au micro.', focus: '50% 25%', ambience: 'graphite', isProvisional: true },
  { id: 'joshua-selman', name: 'Apôtre Joshua Selman', themes: ['Enseignement', 'Prédication'], intro: PROVISIONAL_INTRO, image: selman, imageAlt: 'Apôtre Joshua Selman prêchant sous une lumière chaude.', focus: '50% 30%', ambience: 'amber', isProvisional: true },
  { id: 'nathaniel-bassey', name: 'Pasteur Nathaniel Bassey', themes: ['Louange', 'Musique'], intro: PROVISIONAL_INTRO, image: bassey, imageAlt: 'Pasteur Nathaniel Bassey assis près de sa trompette.', focus: '50% 30%', ambience: 'bordeaux', isProvisional: true },
];
