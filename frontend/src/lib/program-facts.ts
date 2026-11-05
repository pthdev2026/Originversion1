import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/** Faits réels d'un programme (GET /api/programs/:slug) : durée, année, genres, saisons. Un champ absent reste absent. */
export interface ProgramFacts {
  durationLabel: string | null;
  year: number | null;
  genres: string[];
  seasons: number;
  trailerUrl: string | null;
}

interface ServerFiche {
  durationLabel?: string | null; trailerUrl?: string | null;
  meta?: { year?: number | null; genres?: string[] | null };
  seasons?: unknown[];
}

const cache = new Map<string, ProgramFacts | null>();

export function useProgramFacts(slug: string | undefined, enabled: boolean): ProgramFacts | null {
  const [facts, setFacts] = useState<ProgramFacts | null>(() => (slug ? cache.get(slug) ?? null : null));
  useEffect(() => {
    if (!enabled || !slug) return undefined;
    if (cache.has(slug)) { setFacts(cache.get(slug) ?? null); return undefined; }
    let current = true;
    api<ServerFiche>('GET', `/api/programs/${encodeURIComponent(slug)}`)
      .then(fiche => {
        const next: ProgramFacts = {
          durationLabel: fiche.durationLabel ?? null, year: fiche.meta?.year ?? null, genres: fiche.meta?.genres ?? [],
          seasons: Array.isArray(fiche.seasons) ? fiche.seasons.length : 0, trailerUrl: fiche.trailerUrl ?? null,
        };
        cache.set(slug, next);
        if (current) setFacts(next);
      })
      .catch(() => { if (current) setFacts(null); });   // la fiche reste lisible sans ces détails
    return () => { current = false; };
  }, [slug, enabled]);
  return slug && cache.has(slug) ? cache.get(slug) ?? null : facts;
}

/** « 52 min · 2026 · Documentaire, Foi · 2 saisons » : seulement ce que le serveur fournit. */
export function factsLine(facts: ProgramFacts | null): string {
  if (!facts) return '';
  return [facts.durationLabel, facts.year ? String(facts.year) : '', facts.genres.join(', '), facts.seasons > 1 ? `${facts.seasons} saisons` : '']
    .filter(Boolean).join(' · ');
}
