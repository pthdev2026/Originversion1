/** Module « catalog » — routes HTTP (voir docs/API-CONTRACT.md). */
import { Hono } from 'hono';
import type { Sql } from '../../platform/database/client.ts';
import { listPlayablePrograms } from './repository.ts';

export function catalogRoutes(deps: { sql: Sql }): Hono {
  const routes = new Hono();

  // Programmes ayant au moins un média prêt.
  routes.get('/api/programs', async c => c.json({ programs: await listPlayablePrograms(deps.sql) }));

  return routes;
}
