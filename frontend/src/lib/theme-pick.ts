/** Lets the menu open the theme explorer on a given theme, from the homepage or from another page. */
export const THEME_EVENT = 'origin-theme';
const KEY = 'origin-theme';

export function requestTheme(id: string) {
  try { window.sessionStorage.setItem(KEY, id); } catch { /* storage unavailable: the event still reaches a mounted explorer */ }
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: id }));
}

/** The theme requested before the explorer was mounted, consumed once. */
export function takeRequestedTheme() {
  try {
    const id = window.sessionStorage.getItem(KEY);
    if (id) window.sessionStorage.removeItem(KEY);
    return id;
  } catch { return null; }
}
