import { useEffect, useState } from 'react';
import { env } from '@/lib/env';

/**
 * APERÇU HORS CONNEXION : le site s'affiche avec les contenus de DÉMONSTRATION intégrés au code, sans back-end.
 * Il sert à montrer l'interface (aperçu en ligne sans API, personne qui clone le dépôt sans lancer l'API).
 * Jamais silencieux : un bandeau l'indique en permanence, et rien n'est « inventé » en production avec une API configurée.
 *
 * Actif quand :
 *  - `VITE_OFFLINE_PREVIEW=1` (choix explicite), ou
 *  - aucune API n'est configurée (`VITE_API_URL` absente dans un build de production : aperçu hébergé), ou
 *  - en DÉVELOPPEMENT local, quand l'API configurée est injoignable (le catalogue de démonstration prend le relais).
 * Un build de production AVEC `VITE_API_URL` n'utilise jamais cet aperçu : une panne y reste une vraie panne (écran « Réessayer »).
 */
const forced = () => import.meta.env['VITE_OFFLINE_PREVIEW'] === '1' || !env.apiUrl;
let degraded = false;
const listeners = new Set<() => void>();

export const offlinePreviewForced = (): boolean => forced();
export const offlinePreviewActive = (): boolean => forced() || degraded;

function markDegraded() {
  if (degraded) return;
  degraded = true;
  listeners.forEach(listener => listener());
}

/** Exécute l'appel réel ; s'il échoue en développement local, bascule sur la version de démonstration. */
export async function withOfflineFallback<T>(online: () => Promise<T>, offline: () => T | Promise<T>): Promise<T> {
  if (forced()) return offline();
  try {
    return await online();
  } catch (error) {
    if (!import.meta.env.DEV) throw error;
    markDegraded();
    return offline();
  }
}

/**
 * Vrai quand l'aperçu hors connexion est actif (met à jour le bandeau).
 * En développement, le rendu serveur peut avoir basculé sur la démonstration sans que le navigateur le sache : on sonde alors
 * l'API (`/health`, 2,5 s) une fois, et le bandeau s'affiche si elle est injoignable.
 */
export function useOfflinePreview(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const update = () => setActive(offlinePreviewActive());
    update();
    listeners.add(update);
    let cancelled = false;
    if (import.meta.env.DEV && !forced() && env.apiUrl) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 2500);
      fetch(`${env.apiUrl}/health`, { signal: controller.signal }).then(response => { if (!response.ok && !cancelled) markDegraded(); }).catch(() => { if (!cancelled) markDegraded(); }).finally(() => window.clearTimeout(timer));
    }
    return () => { cancelled = true; listeners.delete(update); };
  }, []);
  return active;
}
