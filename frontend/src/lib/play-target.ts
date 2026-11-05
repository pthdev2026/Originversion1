import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/features/account/session/session';

/** Cible du bouton principal d'une fiche programme, décidée par le serveur (GET /api/programs/:slug/play-target). */
export type PlayState = 'start' | 'resume' | 'next' | 'rewatch';

export interface PlayTarget {
  state: PlayState;
  playbackId: string;
  /** Épisode visé pour une série, `null` pour un film. */
  episode: { key: string; number: number; seasonNumber: number; title: string } | null;
  resumeSeconds: number;
}

/**
 * Cible de lecture du compte connecté. Visiteur : rien (le bouton reste « Regarder »). Un échec n'affiche aucune erreur :
 * le bouton retombe sur son libellé calculé localement. `refreshKey` relance la lecture (retour du lecteur : « Reprendre » à jour).
 */
export function usePlayTarget(slug: string, refreshKey?: unknown): PlayTarget | null {
  return usePlayTargetStatus(slug, refreshKey).target;
}

/** Comme `usePlayTarget`, avec `pending` : un compte connecté dont la cible n'est pas encore arrivée (évite d'afficher « Regarder » puis « Reprendre »). */
export function usePlayTargetStatus(slug: string, refreshKey?: unknown): { target: PlayTarget | null; pending: boolean } {
  const user = useSession();
  const [state, setState] = useState<{ key: string; target: PlayTarget | null } | null>(null);
  const email = user?.email ?? null;
  const key = `${email ?? ''}|${slug}`;
  useEffect(() => {
    if (!email) { setState(null); return undefined; }
    let cancelled = false;
    api<PlayTarget>('GET', `/api/programs/${encodeURIComponent(slug)}/play-target`)
      .then(result => { if (!cancelled) setState({ key, target: result }); })
      .catch(() => { if (!cancelled) setState({ key, target: null }); }); // échec : on garde le libellé local, plus d'attente
    return () => { cancelled = true; };
  }, [slug, email, key, refreshKey]);
  const current = state?.key === key ? state.target : null;
  return { target: current, pending: email !== null && state?.key !== key };
}

/** Libellé du bouton principal pour une cible serveur. `null` : garder le libellé local. */
export function playTargetLabel(target: PlayTarget | null, isSeries: boolean): string | null {
  if (!target) return null;
  const episode = isSeries && target.episode ? ` l’épisode ${target.episode.number}` : '';
  switch (target.state) {
    case 'resume': return isSeries ? `Reprendre${episode}` : 'Reprendre';
    case 'next': return isSeries ? `Regarder${episode}` : 'Regarder';
    case 'rewatch': return 'Revoir';
    default: return null;
  }
}
