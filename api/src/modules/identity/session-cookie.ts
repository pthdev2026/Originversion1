/**
 * Cookie de session.
 *  - httpOnly : le JavaScript de la page ne peut pas le lire (limite les vols par injection de script) ;
 *  - Secure + préfixe `__Host-` en production : jamais envoyé en clair, lié à ce seul domaine ;
 *  - SameSite=Lax : non envoyé lors de requêtes déclenchées par un autre site.
 *
 * IMPORTANT : le front et l'API doivent être sur le MÊME « site » (même domaine enregistrable, ports ignorés).
 * En développement : http://localhost:3210 et http://localhost:4000. En production : origin.example et api.origin.example.
 */
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

export function cookieName(secure: boolean): string {
  return secure ? '__Host-origin_session' : 'origin_session';
}

export function readSessionCookie(c: Context, secure: boolean): string | null {
  return getCookie(c, cookieName(secure)) ?? null;
}

export function writeSessionCookie(c: Context, secure: boolean, token: string, maxAgeSeconds: number): void {
  setCookie(c, cookieName(secure), token, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: maxAgeSeconds });
}

export function clearSessionCookie(c: Context, secure: boolean): void {
  deleteCookie(c, cookieName(secure), { path: '/', secure });
}
