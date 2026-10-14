/** Module « catalog » — routes HTTP (voir docs/API-CONTRACT.md). */
import { Hono } from 'hono';
import type { Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { isValidId } from '../../platform/storage/layout.ts';
import { requireAdmin } from '../identity/middleware.ts';
import {
  deleteCollection, deleteCreator, deleteProgram, deleteTheme, listAllForAdmin,
  upsertCollection, upsertCreator, upsertProgram, upsertTheme,
} from './admin.ts';
import { getCollection, getHome, getProgramDetail, listCreators, listProgramsByTheme, listThemes } from './content.ts';
import { listPlayablePrograms } from './repository.ts';
import { collectionSchema, creatorSchema, parseBody, programSchema, themeSchema } from './schemas.ts';

export function catalogRoutes(deps: { sql: Sql }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const slugOf = (raw: string) => {
    if (!isValidId(raw)) throw errors.badRequest('Identifiant invalide.');
    return raw;
  };
  const body = async (c: { req: { json: () => Promise<unknown> } }) => {
    try {
      return await c.req.json();
    } catch {
      throw errors.badRequest('Corps JSON invalide.');
    }
  };

  // ---- Lecture publique -------------------------------------------------------------------------------------------

  // Programmes ayant au moins un média lisible (contrat historique, inchangé).
  routes.get('/api/programs', async c => c.json({ programs: await listPlayablePrograms(deps.sql) }));

  // L'accueil entier en un seul appel : collections ordonnées, thématiques, créateurs.
  routes.get('/api/home', async c => c.json(await getHome(deps.sql)));

  routes.get('/api/programs/:slug', async c => {
    const detail = await getProgramDetail(deps.sql, slugOf(c.req.param('slug')));
    if (!detail) throw errors.notFound('Programme introuvable.');
    return c.json(detail);
  });

  routes.get('/api/collections/:slug', async c => {
    const collection = await getCollection(deps.sql, slugOf(c.req.param('slug')));
    if (!collection) throw errors.notFound('Collection introuvable.');
    return c.json(collection);
  });

  routes.get('/api/themes', async c => c.json({ themes: await listThemes(deps.sql) }));

  routes.get('/api/themes/:slug', async c => {
    const programs = await listProgramsByTheme(deps.sql, slugOf(c.req.param('slug')));
    if (!programs) throw errors.notFound('Thématique introuvable.');
    return c.json({ programs });
  });

  routes.get('/api/creators', async c => c.json({ creators: await listCreators(deps.sql) }));

  // ---- Administration éditoriale ----------------------------------------------------------------------------------

  routes.get('/api/admin/catalog', async c => {
    requireAdmin(c);
    return c.json(await listAllForAdmin(deps.sql));
  });

  routes.put('/api/admin/programs/:slug', async c => {
    requireAdmin(c);
    const slug = slugOf(c.req.param('slug'));
    const input = parseBody(programSchema, await body(c));
    const result = await upsertProgram(deps.sql, slug, input);
    return c.json({ slug, result }, result === 'created' ? 201 : 200);
  });

  routes.delete('/api/admin/programs/:slug', async c => {
    requireAdmin(c);
    if (!(await deleteProgram(deps.sql, slugOf(c.req.param('slug'))))) throw errors.notFound('Programme introuvable.');
    return c.body(null, 204);
  });

  routes.put('/api/admin/themes/:slug', async c => {
    requireAdmin(c);
    await upsertTheme(deps.sql, slugOf(c.req.param('slug')), parseBody(themeSchema, await body(c)));
    return c.body(null, 204);
  });

  routes.delete('/api/admin/themes/:slug', async c => {
    requireAdmin(c);
    if (!(await deleteTheme(deps.sql, slugOf(c.req.param('slug'))))) throw errors.notFound('Thématique introuvable.');
    return c.body(null, 204);
  });

  routes.put('/api/admin/creators/:slug', async c => {
    requireAdmin(c);
    await upsertCreator(deps.sql, slugOf(c.req.param('slug')), parseBody(creatorSchema, await body(c)));
    return c.body(null, 204);
  });

  routes.delete('/api/admin/creators/:slug', async c => {
    requireAdmin(c);
    if (!(await deleteCreator(deps.sql, slugOf(c.req.param('slug'))))) throw errors.notFound('Créateur introuvable.');
    return c.body(null, 204);
  });

  routes.put('/api/admin/collections/:slug', async c => {
    requireAdmin(c);
    await upsertCollection(deps.sql, slugOf(c.req.param('slug')), parseBody(collectionSchema, await body(c)));
    return c.body(null, 204);
  });

  routes.delete('/api/admin/collections/:slug', async c => {
    requireAdmin(c);
    if (!(await deleteCollection(deps.sql, slugOf(c.req.param('slug'))))) throw errors.notFound('Collection introuvable.');
    return c.body(null, 204);
  });

  return routes;
}
