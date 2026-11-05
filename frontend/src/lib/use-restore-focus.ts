import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

// useLayoutEffect avertit côté serveur : on retombe sur useEffect là-bas (il n'y a pas de focus à noter).
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Rend le focus à l'élément d'où l'on vient quand une boîte de dialogue se ferme.
 * Radix ne le fait que pour `Dialog.Trigger` ; nos boîtes sont ouvertes par un état (bouton de barre, carte, menu) :
 * sans ceci le focus retombe sur <body> et un utilisateur au clavier perd sa place dans la page.
 *
 * À brancher sur `onCloseAutoFocus` du contenu. L'élément d'origine est noté dans un effet de mise en page,
 * avant que la boîte ne déplace elle-même le focus.
 */
export function useRestoreFocus(open: boolean) {
  const opener = useRef<HTMLElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, [open]);

  return useCallback((event: Event) => {
    const element = opener.current;
    if (!element || !element.isConnected) return;
    event.preventDefault();
    element.focus({ preventScroll: true });
  }, []);
}
