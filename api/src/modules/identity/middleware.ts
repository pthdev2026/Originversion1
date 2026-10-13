/**
 * Module « identity » — middlewares d'authentification.
 *
 * `loadSession` s'exécute sur chaque requête API : s'il y a un cookie valide, `c.get('user')` contient
 * l'utilisateur ; sinon null (visiteur anonyme). Les routes protégées appellent ensuite `requireUser`
 * ou `requireAdmin`.
 */
import type { Context, MiddlewareHandler } from 'hono';
import { errors } from '../../platform/errors.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { clearSessionCookie, readSessionCookie } from './session-cookie.ts';
import type { IdentityService } from './service.ts';
import type { User } from './repository.ts';

export function loadSession(deps: { identity: IdentityService; cookieSecure: boolean }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('user', null);
    c.set('sessionTokenHash', null);
    const token = readSessionCookie(c, deps.cookieSecure);
    if (token) {
      const found = await deps.identity.authenticate(token);
      if (found) {
        c.set('user', found.session.user);
        c.set('sessionTokenHash', found.tokenHash);
      } else {
        clearSessionCookie(c, deps.cookieSecure); // cookie périmé ou révoqué : on le retire
      }
    }
    await next();
  };
}

export function requireUser(c: Context<AppEnv>): User {
  const user = c.get('user');
  if (!user) throw errors.unauthorized();
  return user;
}

export function requireAdmin(c: Context<AppEnv>): User {
  const user = requireUser(c);
  if (user.role !== 'admin') throw errors.forbidden();
  return user;
}
