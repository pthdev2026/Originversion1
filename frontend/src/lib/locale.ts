import { useSyncExternalStore } from 'react';
import type { NavSectionId } from '@/lib/origin-sections';

/**
 * Interface language (FR / EN). Only the navigation chrome is translated for now; editorial content
 * stays in French until translated copy is supplied. Kept isolated so a real i18n library can replace it.
 */
export type Locale = 'fr' | 'en';
const KEY = 'millenium-locale';
const listeners = new Set<() => void>();

function read(): Locale {
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'fr'; } catch { return 'fr'; }
}

export function setLocale(locale: Locale) {
  try { localStorage.setItem(KEY, locale); } catch { /* storage unavailable: keep the choice for this page only */ }
  document.documentElement.lang = locale;
  listeners.forEach(listener => listener());
}

export function useLocale(): Locale {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    read,
    () => 'fr',
  );
}

const sections: Record<Locale, Record<NavSectionId, string>> = {
  fr: { accueil: 'Accueil', originals: 'Originals', 'films-series': 'Films & Séries', explorer: 'Explorer' },
  en: { accueil: 'Home', originals: 'Originals', 'films-series': 'Movies & Series', explorer: 'Explore' },
};

const strings = {
  fr: { signIn: 'Se connecter', search: 'Rechercher', searchLabel: 'Rechercher un programme', menu: 'Ouvrir le menu', yourSpace: 'Votre espace', language: 'Langue' },
  en: { signIn: 'Sign in', search: 'Search', searchLabel: 'Search for a title', menu: 'Open the menu', yourSpace: 'Your space', language: 'Language' },
} as const;

export function sectionLabel(locale: Locale, id: NavSectionId) { return sections[locale][id]; }
export function ui(locale: Locale) { return strings[locale]; }
