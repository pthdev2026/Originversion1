import { useSyncExternalStore } from 'react';
import { catalogContents, type CatalogContent } from '@/lib/origin-catalogs';
import { useSession, useSessionStatus } from '@/features/account/session/session';
import { applyListChange, listSlugs, listVersion, serverContent, useListLoaded, useListVersion } from '@/features/account/session/list-store';
import { continueContent, continueEntries, continueVersion, useContinueVersion } from '@/features/account/session/continue-store';

/**
 * « Votre espace ». ÉTAT D'INTÉGRATION (30/10/2026) :
 *  - `list` (Ma liste) : RÉELLE, stockée par le serveur (voir list-store.ts) ;
 *  - `progress` (Continuer à regarder) : RÉELLE, issue de la progression enregistrée par le serveur (voir continue-store.ts) ;
 *  - avatar, devices, history, providers, preferences, memberSince : encore SIMULÉS (stockage navigateur par compte),
 *    en attendant leur branchement (jalons « lecture/historique » et « espace personnel »).
 */
export type Avatar = { kind: 'photo'; src: string; zoom: number } | { kind: 'preset'; index: number } | null;
export type { ProgressEntry } from '@/features/account/session/continue-store';
import type { ProgressEntry } from '@/features/account/session/continue-store';
export interface Device { id: string; name: string; where: string; current: boolean }
export interface Preferences {
  previews: boolean; nextEpisode: boolean; quality: 'Auto' | 'Éco' | 'Haute'; subtitles: 'Aucun' | 'Français' | 'English';
  newEpisodes: boolean; news: boolean; emails: boolean; reduceMotion: boolean; subtitleSize: 'Petit' | 'Moyen' | 'Grand';
}
export interface Space {
  avatar: Avatar; list: string[]; progress: ProgressEntry[]; devices: Device[]; history: boolean;
  providers: { google: boolean; apple: boolean }; preferences: Preferences; memberSince: string;
}

export const avatarTints = ['#1d2433', '#2b1f2e', '#1f2b26', '#2e2a1d', '#232a36', '#33231f', '#1d2b33', '#2a2433'];

export const defaultPreferences: Preferences = { previews: true, nextEpisode: true, quality: 'Auto', subtitles: 'Français', newEpisodes: true, news: false, emails: true, reduceMotion: false, subtitleSize: 'Moyen' };
const thisDevice: Device = { id: 'this', name: 'Ce navigateur', where: 'Actif maintenant', current: true };

/** Espace de départ d'un compte : vide. (Plus aucune donnée de démonstration pré-remplie.) */
function seed(): Space {
  return {
    avatar: null,
    list: [],
    progress: [],
    devices: [thisDevice],
    history: true,
    providers: { google: false, apple: false },
    preferences: defaultPreferences,
    memberSince: 'octobre 2026',
  };
}

const key = (email: string) => `millenium-demo-space:${email.toLowerCase()}`;
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; version: number; space: Space }>();

function read(email: string): Space {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(key(email)); } catch { raw = null; }
  const version = listVersion() * 100000 + continueVersion();
  const hit = cache.get(email);
  if (hit && hit.raw === raw && hit.version === version) return hit.space;
  let space = seed();
  try { if (raw) space = { ...space, ...JSON.parse(raw) as Partial<Space> }; } catch { /* unreadable: start again from the seed */ }
  space = { ...space, list: [...listSlugs()], progress: [...continueEntries()] }; // « Ma liste » vient TOUJOURS du serveur, jamais du stockage du navigateur
  cache.set(email, { raw, version, space });
  return space;
}

/** Updates the space of an account and notifies every view. Les changements de `list` partent au serveur (optimiste, retour arrière en cas d'échec). */
export function updateSpace(email: string, change: (space: Space) => Space) {
  const before = read(email);
  const next = change(before);
  const added = next.list.filter(id => !before.list.includes(id));
  const removed = before.list.filter(id => !next.list.includes(id));
  try { window.localStorage.setItem(key(email), JSON.stringify({ ...next, list: [], progress: [] })); } catch { /* storage unavailable: nothing kept */ }
  cache.delete(email);
  if (added.length || removed.length) applyListChange(added, removed);
  listeners.forEach(listener => listener());
}

/** The space of the signed-in account, or null for a visitor (always null during server rendering). */
export function useSpace(email: string | null): Space | null {
  useListVersion();
  useContinueVersion();
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    () => (email ? read(email) : null),
    () => null,
  );
}

/** Fiche d'un titre : d'abord ce que le SERVEUR a fourni (liste, « Continuer », catalogue de l'accueil), le catalogue embarqué ne servant qu'en dernier recours. */
export const contentById = (id: string): CatalogContent | undefined => serverContent(id) ?? continueContent(id) ?? catalogContents.find(content => content.id === id || content.productionSlug === id);

export type ListFilter = 'all' | 'film' | 'serie' | 'doc';
export function kindOf(category: string): Exclude<ListFilter, 'all'> {
  const value = category.toLowerCase();
  if (value.includes('série')) return 'serie';
  if (value.includes('documentaire') || value.includes('témoignage')) return 'doc';
  return 'film';
}

/** The signed-in user together with their space and an updater (all null for a visitor). `loading` : le serveur n'a pas encore dit si une session existe. */
export function useMySpace() {
  const user = useSession();
  const sessionLoading = useSessionStatus() === 'loading';
  const listLoaded = useListLoaded();
  // Tant que la session OU la liste du compte ne sont pas connues, un clic sur « Ma liste » est retenu (voir origin-hero / program-page).
  const loading = sessionLoading || (user !== null && !listLoaded);
  const space = useSpace(user?.email ?? null);
  const update = (change: (space: Space) => Space) => { if (user) updateSpace(user.email, change); };
  return { user, space, update, loading };
}

/** Forgets the space of an account (used when the account is deleted). */
export function clearSpace(email: string) {
  try { window.localStorage.removeItem(key(email)); } catch { /* storage unavailable: nothing kept */ }
  cache.delete(email);
  listeners.forEach(listener => listener());
}
