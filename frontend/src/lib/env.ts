// Configuration publique du front (jamais de secret). Une valeur absente reste absente :
// le code appelant affiche un état dégradé explicite plutôt qu'une valeur inventée.

function read(key: string): string | undefined {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const env = {
  /** URL de l'API. Repli local uniquement en développement ; en production, absente = non configurée. */
  apiUrl: read('VITE_API_URL') ?? (import.meta.env.DEV ? 'http://localhost:4000' : undefined),
  /** Adresse de contact affichée dans les états d'erreur de lecture. */
  supportEmail: read('VITE_SUPPORT_EMAIL'),
};

const DEBUG_KEY = 'origin-debug';

function detectDebug(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const requested = new URLSearchParams(window.location.search).has('debug');
    if (requested) window.sessionStorage.setItem(DEBUG_KEY, '1');
    return requested || window.sessionStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

/** Mode debug : activé par `?debug` dans l'URL, conservé pour la session. Lu une fois au chargement. */
export const debugMode = detectDebug();
