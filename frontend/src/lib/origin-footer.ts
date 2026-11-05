import type { NavSectionId } from '@/lib/origin-sections';

/**
 * Footer content. Platform and account entries point to existing sections and pages;
 * information pages are not written yet, so they are flagged provisional and rendered as unavailable.
 */
export type FooterLink =
  | { label: string; section: NavSectionId }
  | { label: string; hash: string }
  | { label: string; to: '/connexion' | '/inscription' | '/mot-de-passe-oublie' }
  | { label: string; provisional: true };

export const footerColumns: { title: string; links: FooterLink[] }[] = [
  { title: 'La plateforme', links: [
    { label: 'Accueil', section: 'accueil' },
    { label: 'Originals', section: 'originals' },
    { label: 'Films & Séries', section: 'films-series' },
    { label: 'Thématiques', hash: 'thematiques' },
    { label: 'Créateurs', hash: 'createurs' },
  ] },
  { title: 'Votre compte', links: [
    { label: 'Se connecter', to: '/connexion' },
    { label: 'Créer un compte', to: '/inscription' },
    { label: 'Mot de passe oublié', to: '/mot-de-passe-oublie' },
  ] },
  { title: 'Aide', links: [
    { label: 'Centre d’aide', provisional: true },
    { label: 'Nous contacter', provisional: true },
    { label: 'Appareils compatibles', provisional: true },
  ] },
];

export const footerLegal: FooterLink[] = [
  { label: 'Conditions d’utilisation', provisional: true },
  { label: 'Confidentialité', provisional: true },
  { label: 'Cookies', provisional: true },
  { label: 'Mentions légales', provisional: true },
];
