import { useCallback, useEffect, useState } from 'react';
import type { EpisodeWatchProgress } from '@/lib/episode-progress';
import { fetchProgramProgress } from '@/lib/program-api';
import { useSession } from '@/features/account/session/session';

/** Progression RÉELLE des épisodes d'un programme (compte connecté) ; visiteur ou échec réseau : aucune progression affichée. */
export function useProgramProgress(slug: string) {
  const email = useSession()?.email ?? null;
  const [progress, setProgress] = useState<Record<string, EpisodeWatchProgress>>({});
  const reload = useCallback(async () => {
    if (!email) { setProgress({}); return; }
    try { setProgress(await fetchProgramProgress(slug)); } catch { /* garde l'affichage précédent */ }
  }, [slug, email]);
  useEffect(() => { setProgress({}); void reload(); }, [reload]);
  // Retour sur l'onglet (après un visionnage ailleurs) : les états « Vu » sont rafraîchis.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);
  return { progress, reload };
}
