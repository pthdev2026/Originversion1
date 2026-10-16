/**
 * Module « privacy » — droits RGPD d'un compte.
 *  - Droit d'accès et de portabilité : `GET /api/me/export` (toutes les données du compte, en JSON, à télécharger).
 *  - Droit à l'effacement : `POST /api/me/delete` (module identity).
 * Jamais de secret dans l'export : ni empreinte de mot de passe, ni jeton, ni secret de double authentification.
 */
import { Hono } from 'hono';
import type { Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { requireUser } from '../identity/middleware.ts';
import { exportPersonalData } from './repository.ts';

export function privacyRoutes(deps: { sql: Sql }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/api/me/export', async c => {
    const data = await exportPersonalData(deps.sql, requireUser(c).id);
    if (!data) throw errors.notFound('Compte introuvable.');
    return c.body(JSON.stringify(data, null, 2), 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="origin-mes-donnees.json"',
    });
  });

  return routes;
}
