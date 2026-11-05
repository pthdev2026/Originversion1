import { api } from '@/lib/api';
import { env } from '@/lib/env';
import { withOfflineFallback } from '@/lib/offline-preview';
import { searchCatalog } from '@/lib/watch-catalog';
import type { WatchSuggestion } from '@/lib/watch-catalog';

/** Recherche RÉELLE (GET /api/search) et recherches récentes du compte (/api/me/searches). */
interface ServerProgram {
  slug: string; kind?: string; title: string; category?: string | null;
  images?: { poster?: string | null; hero?: string | null; alt?: string | null };
}

export interface SearchOutcome {
  hits: WatchSuggestion[];
  /** Recherche corrigée par le serveur quand rien n'a été trouvé tel quel (« thriler » → « thriller »), sinon `null`. */
  corrected: string | null;
}

const absolute = (url: string | null | undefined) => (!url ? '' : url.startsWith('/') && env.apiUrl ? `${env.apiUrl}${url}` : url);
const kindOf = (value: string | undefined): WatchSuggestion['kind'] => (value === 'serie' || value === 'documentaire' ? value : 'film');

/** Recherche de DÉMONSTRATION (aperçu hors connexion) : filtre local sur les titres et catégories intégrés, sans correction de fautes. */
const offlineSearch = (query: string): SearchOutcome => ({ hits: searchCatalog(query, 20), corrected: null });

export const searchPrograms = (query: string): Promise<SearchOutcome> => withOfflineFallback(() => searchProgramsOnline(query), () => offlineSearch(query));

async function searchProgramsOnline(query: string): Promise<SearchOutcome> {
  const data = await api<{ programs: ServerProgram[]; correctedQuery?: string | null }>('GET', `/api/search?q=${encodeURIComponent(query)}&limit=20`);
  return {
    hits: data.programs.map(program => ({
      id: program.slug, title: program.title, category: program.category ?? '',
      image: absolute(program.images?.poster ?? program.images?.hero), imageAlt: program.images?.alt ?? program.title, kind: kindOf(program.kind),
    })),
    corrected: data.correctedQuery ?? null,
  };
}

export async function fetchRecentSearches(): Promise<string[]> {
  const data = await api<{ searches: string[] }>('GET', '/api/me/searches');
  return data.searches;
}

/** À appeler quand la personne VALIDE une recherche (entrée ou résultat ouvert). Un échec reste silencieux. */
export function rememberSearch(query: string): void {
  const value = query.trim();
  if (value.length < 2 || value.length > 80) return;
  void api('POST', '/api/me/searches', { q: value }).catch(() => undefined);
}

export function forgetSearch(query: string): Promise<void> {
  return api<void>('DELETE', '/api/me/searches/item', { q: query }).catch(() => undefined);
}

export function clearRecentSearches(): Promise<void> {
  return api<void>('DELETE', '/api/me/searches').catch(() => undefined);
}
