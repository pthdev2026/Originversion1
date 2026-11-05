import { useSyncExternalStore } from 'react';
import { api, ApiError, onUnauthorized } from '@/lib/api';

/**
 * Session RÉELLE : l'identité est celle du serveur (cookie httpOnly), jamais une donnée du navigateur.
 * L'état affiché vient de `GET /api/me` ; connexion, inscription, déconnexion et renommage passent par l'API.
 * Rien d'autre que cet état en mémoire n'est conservé côté navigateur (pas de localStorage).
 */
export interface SessionUser { name: string; email: string; savedCount: number; inProgressCount: number }
export type AuthResult = { ok: true; user: SessionUser } | { ok: false; field: 'email' | 'password' | 'form'; error: string };
export type SessionStatus = 'loading' | 'ready';

interface ServerUser { id: string; email: string; displayName: string | null; role: string }

const listeners = new Set<() => void>();
let state: { status: SessionStatus; user: SessionUser | null } = { status: 'loading', user: null };
let started = false;
const cleanups = new Set<() => void>();
/** Les autres modules (liste, espace) s'y abonnent pour vider leurs données à chaque changement de compte. */
export const onAccountChange = (listener: (email: string | null) => void) => { const wrapped = () => listener(state.user?.email ?? null); cleanups.add(wrapped); return () => { cleanups.delete(wrapped); }; };

function set(next: typeof state) {
  const changedAccount = (next.user?.email ?? null) !== (state.user?.email ?? null);
  state = next;
  listeners.forEach(listener => listener());
  if (changedAccount) cleanups.forEach(listener => listener());
}
const nameOf = (user: ServerUser) => user.displayName?.trim() || user.email.split('@')[0] || user.email;
const toUser = (user: ServerUser, previous: SessionUser | null): SessionUser => ({ name: nameOf(user), email: user.email, savedCount: previous?.email === user.email ? previous.savedCount : 0, inProgressCount: previous?.email === user.email ? previous.inProgressCount : 0 });

/** Charge la session existante (cookie) une seule fois, côté navigateur. */
function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  onUnauthorized(() => { if (state.user) set({ status: 'ready', user: null }); }); // session expirée ailleurs : l'écran repasse en visiteur
  void api<{ user: ServerUser }>('GET', '/api/me')
    .then(data => set({ status: 'ready', user: toUser(data.user, null) }))
    .catch(() => set({ status: 'ready', user: null })); // 401 = visiteur ; réseau coupé = visiteur (aucune donnée inventée)
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => { listeners.delete(listener); };
}
const snapshot = () => state;

export function useSession() { return useSyncExternalStore(subscribe, () => snapshot().user, () => null); }
/** `loading` tant que le serveur n'a pas dit si une session existe : ne jamais rediriger un visiteur « présumé » avant. */
export function useSessionStatus(): SessionStatus { return useSyncExternalStore(subscribe, () => snapshot().status, () => 'loading' as SessionStatus); }

/** Met à jour les compteurs affichés (nombre de titres enregistrés / en cours) sans refaire d'appel. */
export function setSessionCounts(counts: Partial<Pick<SessionUser, 'savedCount' | 'inProgressCount'>>) {
  if (!state.user) return;
  const next = { ...state.user, ...counts };
  if (next.savedCount === state.user.savedCount && next.inProgressCount === state.user.inProgressCount) return;
  state = { ...state, user: next };
  listeners.forEach(listener => listener());
}

function failure(error: unknown): AuthResult {
  if (error instanceof ApiError) {
    const field = error.status === 409 ? 'email' : 'form';
    return { ok: false, field, error: error.status === 401 ? 'Adresse e-mail ou mot de passe incorrect.' : error.message };
  }
  return { ok: false, field: 'form', error: 'Une erreur est survenue. Réessayez.' };
}

/** `remember` est ignoré : la durée de session est décidée par le serveur (30 jours). */
export async function signIn(email: string, password: string, _remember = true): Promise<AuthResult> {
  try {
    const data = await api<{ user: ServerUser }>('POST', '/api/auth/login', { email: email.trim(), password });
    const user = toUser(data.user, state.user);
    set({ status: 'ready', user });
    return { ok: true, user };
  } catch (error) { return failure(error); }
}

export async function signUp({ name, email, password }: { name: string; email: string; password: string }): Promise<AuthResult> {
  try {
    const data = await api<{ user: ServerUser }>('POST', '/api/auth/register', { email: email.trim(), password, ...(name.trim() ? { displayName: name.trim() } : {}) });
    const user = toUser(data.user, state.user);
    set({ status: 'ready', user });
    return { ok: true, user };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) return { ok: false, field: 'email', error: 'Un compte existe déjà avec cette adresse e-mail.' };
    if (error instanceof ApiError && error.status === 400 && /mot de passe/i.test(error.message)) return { ok: false, field: 'password', error: error.message };
    return failure(error);
  }
}

/** Renomme le compte : le nom affiché est celui du serveur. Retourne `false` si le serveur refuse. */
export async function renameUser(name: string): Promise<boolean> {
  const clean = name.trim();
  if (!state.user || !clean) return false;
  try {
    const data = await api<{ user: ServerUser }>('PATCH', '/api/me', { displayName: clean });
    set({ status: 'ready', user: toUser(data.user, state.user) });
    return true;
  } catch { return false; }
}

/** Supprime le compte (droit à l'effacement) : le serveur exige le mot de passe. */
export async function deleteAccount(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await api('POST', '/api/me/delete', { password }, { keepSession: true });
    set({ status: 'ready', user: null });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? (error.status === 401 ? 'Mot de passe incorrect.' : error.message) : 'Une erreur est survenue. Réessayez.' };
  }
}

/** Ferme la session côté serveur ; l'écran repasse en visiteur même si le réseau est coupé (le cookie expirera). */
export async function signOut(): Promise<void> {
  try { await api('POST', '/api/auth/logout'); } catch { /* le serveur n'a pas répondu : on ferme localement, le cookie finira par expirer */ }
  set({ status: 'ready', user: null });
}

export const firstName = (user: SessionUser) => user.name.split(' ')[0] ?? user.name;
export const initials = (user: SessionUser) => user.name.split(/\s+/).map(part => part[0] ?? '').join('').slice(0, 2).toUpperCase();
