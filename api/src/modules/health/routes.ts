/**
 * Module « health » : permet à un humain ou à un outil de savoir si le service est vivant.
 * Utilisé par la supervision et par l'équilibreur de charge.
 */
import { Hono } from 'hono';
import type { Sql } from '../../platform/database/client.ts';

export function healthRoutes(deps: { sql: Sql }): Hono {
  const routes = new Hono();

  routes.get('/health', async c => {
    try {
      await deps.sql`SELECT 1`;
      return c.json({ status: 'ok', database: 'ok' });
    } catch {
      return c.json({ status: 'degraded', database: 'unreachable' }, 503);
    }
  });

  return routes;
}
