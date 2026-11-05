/**
 * Mode TV : écran de salon piloté à la télécommande (flèches, OK, retour).
 * Activé par le navigateur de la télévision (Tizen, webOS, Android TV, Apple TV, HbbTV…) ou à la demande avec `?tv=1` (`?tv=0` le coupe ; retenu pour l'onglet seulement).
 * Pose `data-tv` sur <html> : les styles TV s'y accrochent ; la navigation spatiale déplace le focus dans la direction de la flèche.
 */
const TV_AGENT = /(smart-?tv|tizen|web0s|webos|netcast|hbbtv|appletv|googletv|android tv|bravia|aftb|crkey|viera|philipstv|vizio)/i;
const STORAGE_KEY = 'millenium-tv';

export function detectTv(userAgent: string, search: string, stored: string | null): boolean {
  const flag = new URLSearchParams(search).get('tv');
  if (flag === '1') return true;
  if (flag === '0') return false;
  return stored === '1' || TV_AGENT.test(userAgent);
}

export type Direction = 'left' | 'right' | 'up' | 'down';
export interface Box { left: number; top: number; right: number; bottom: number }

const center = (box: Box) => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });

/** The candidate that lies in the direction of the arrow, nearest first (the cross axis counts double, so the move stays in its row or column). */
export function pickNext(from: Box, candidates: Box[], direction: Direction): number {
  const a = center(from);
  let best = -1;
  let bestScore = Infinity;
  candidates.forEach((box, index) => {
    const b = center(box);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const along = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
    if (along <= 1) return;
    const across = Math.abs(direction === 'left' || direction === 'right' ? dy : dx);
    const score = along + across * 2;
    if (score < bestScore) { bestScore = score; best = index; }
  });
  return best;
}

const FOCUSABLE = 'a[href], button:not(:disabled), [role="button"], [tabindex]:not([tabindex="-1"]), input:not(:disabled), select:not(:disabled)';
const KEYS: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
// Touches « retour » des télécommandes : Tizen 10009, webOS 461, Android TV 4.
const BACK_CODES = new Set([10009, 461, 4]);

function visible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
}

function onKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  if (BACK_CODES.has(event.keyCode)) { event.preventDefault(); window.history.back(); return; }
  const direction = KEYS[event.key];
  if (!direction) return;
  const active = document.activeElement as HTMLElement | null;
  // Les champs de saisie gardent leurs flèches (déplacement du curseur, liste de choix).
  if (active && (active.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, select') || active.isContentEditable)) return;
  // Lecteur : tant que les commandes sont cachées ou que le focus n'est pas dessus, c'est le lecteur qui interprète les flèches.
  const shell = document.querySelector('.player-shell');
  if (shell && (shell.classList.contains('is-idle') || !active || !shell.contains(active))) return;
  const scope = document.querySelector<HTMLElement>('[role="dialog"], [aria-modal="true"]') ?? document;
  const all = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
  if (!all.length) return;
  if (!active || active === document.body || !all.includes(active)) { event.preventDefault(); (all.find(element => element.matches('.watch-button, .pp-play, [data-autofocus]')) ?? all[0]!).focus(); return; }
  const others = all.filter(element => element !== active);
  const index = pickNext(active.getBoundingClientRect(), others.map(element => element.getBoundingClientRect()), direction);
  if (index < 0) return; // rien dans cette direction : la page défile
  event.preventDefault();
  const target = others[index]!;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
}

/** Turns the TV mode on or off for this page; returns the cleanup. */
export function startTvMode(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let stored: string | null = null;
  try { stored = window.sessionStorage.getItem(STORAGE_KEY); window.localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  const flag = new URLSearchParams(window.location.search).get('tv');
  const on = detectTv(window.navigator.userAgent, window.location.search, stored);
  try { if (flag === '1') window.sessionStorage.setItem(STORAGE_KEY, '1'); else if (flag === '0') window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  const root = document.documentElement;
  if (!on) { delete root.dataset['tv']; return () => undefined; }
  root.dataset['tv'] = '1';
  window.addEventListener('keydown', onKey);
  return () => { window.removeEventListener('keydown', onKey); delete root.dataset['tv']; };
}
