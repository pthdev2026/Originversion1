/** Module « mylist » — routes HTTP. Pas de couche « service » : il n'y a aucune règle métier à part la limite. */
import { Hono } from 'hono';
import type { Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { isValidId } from '../../platform/storage/layout.ts';
import { getCards } from '../catalog/content.ts';
import { requireUser } from '../identity/middleware.ts';
import { addEntry, countEntries, listEntries, removeEntry } from './repository.ts';

const MAX_ENTRIES = 500;

function slugOf(raw: string): string {
  if (!isValidId(raw)) throw errors.badRequest('Identifiant de contenu invalide.');
  return raw;
}

export function myListRoutes(deps: { sql: Sql }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/api/me/list', async c => {
    const entries = await listEntries(deps.sql, requireUser(c).id);
    // Chaque élément porte sa fiche résumée (le front affiche le rail sans un appel par titre).
    // `program` vaut null si le contenu n'est plus publié ou n'existe pas (la ligne de liste reste, à l'utilisateur de la retirer).
    const cards = await getCards(deps.sql, entries.map(entry => entry.slug));
    return c.json({
      items: entries.map(entry => ({ slug: entry.slug, addedAt: entry.addedAt.toISOString(), program: cards.get(entry.slug) ?? null })),
    });
  });

  routes.put('/api/me/list/:slug', async c => {
    const user = requireUser(c);
    const slug = slugOf(c.req.param('slug'));
    if ((await countEntries(deps.sql, user.id)) >= MAX_ENTRIES) throw errors.badRequest(`Votre liste ne peut pas dépasser ${MAX_ENTRIES} contenus.`);
    await addEntry(deps.sql, user.id, slug);
    return c.body(null, 204);
  });

  routes.delete('/api/me/list/:slug', async c => {
    await removeEntry(deps.sql, requireUser(c).id, slugOf(c.req.param('slug')));
    return c.body(null, 204);
  });

  return routes;
}
