/** Module « catalog » — routes HTTP (voir docs/API-CONTRACT.md). */
import { Hono } from 'hono';
import type { Sql } from '../../platform/database/client.ts';
import { AppError, errors } from '../../platform/errors.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { isValidId } from '../../platform/storage/layout.ts';
import { requireAdmin } from '../identity/middleware.ts';
import { insertAudit } from '../identity/repository.ts';
import {
  applySchedule, validateRelease, type BlockedRelease, deleteCollection, deleteCreator, listCatalogAudit, listSchedule, deleteProgram, deleteTheme, getCreatorForAdmin, getProgramForAdmin, listAllForAdmin, listCreatorsForAdmin, replaceCreatorContents,
  upsertCollection, upsertCreator, upsertProgram, upsertTheme,
} from './admin.ts';
import {
  foldQuery, getRanking, listComingSoon, loadSearchVocabulary, suggest, getCollection, getCreatorUniverse, getHome, getProgramDetail, listCreators, listProgramsByTheme, listThemes, searchCreators, searchPrograms,
} from './content.ts';
import { correctTokens } from './search.ts';
import { listPlayablePrograms } from './repository.ts';
import { createTtlCache } from '../../platform/http/ttl-cache.ts';
import { collectionSchema, creatorContentsSchema, creatorSchema, parseBody, programSchema, themeSchema } from './schemas.ts';

/**
 * Le catalogue public est identique pour tous les visiteurs : un cache court (30 s, puis 2 min en rafraîchissement
 * silencieux) évite de relire la base à chaque visite, au prix d'un délai de 30 s avant qu'une modification éditoriale
 * soit visible. Réservé aux réponses réussies : les erreurs ne sont jamais mises en cache.
 */
const PUBLIC_CACHE = 'public, max-age=30, stale-while-revalidate=120';
const cacheable = (c: { header: (name: string, value: string) => void }) => c.header('Cache-Control', PUBLIC_CACHE);

/**
 * Applique le calendrier éditorial et le consigne au journal d'audit. Une sortie BLOQUÉE (médias non prêts) est tracée et signalée
 * UNE fois par `notify` (e-mail aux administrateurs, branché dans main.ts) ; elle ne se republie pas seule.
 */
export async function runSchedule(sql: Sql, now?: Date, notify?: (blocked: BlockedRelease) => Promise<void>): Promise<{ released: string[]; expired: string[]; blocked: BlockedRelease[] }> {
  const done = await applySchedule(sql, now);
  for (const slug of done.released) await insertAudit(sql, { userId: null, event: 'catalog.program.release', requestId: null, details: { slug } });
  for (const slug of done.expired) await insertAudit(sql, { userId: null, event: 'catalog.program.expire', requestId: null, details: { slug } });
  for (const item of done.blocked) {
    await insertAudit(sql, { userId: null, event: 'catalog.program.release_blocked', requestId: null, details: { slug: item.slug, missing: item.missing } });
    await notify?.(item).catch(() => undefined); // une alerte qui échoue n'annule ni la trace ni le blocage
  }
  return done;
}

export function catalogRoutes(deps: { sql: Sql; cacheTtlMs?: number }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  // Cache serveur des lectures publiques (même durée que le cache navigateur). Vidé à chaque écriture éditoriale de CE processus.
  // Quatre zones BORNÉES et séparées : du trafic aux clés choisies par le visiteur (recherches, identifiants inventés) ne peut
  // chasser que sa propre zone, jamais l'accueil ni le classement. Un « introuvable » n'est mémorisé que dans sa zone, brièvement.
  const ttlMs = deps.cacheTtlMs ?? 0;
  const zones = {
    core: createTtlCache<unknown>({ ttlMs, maxEntries: 100 }),          // accueil, thématiques, créateurs, classement, vocabulaire…
    items: createTtlCache<unknown>({ ttlMs, maxEntries: 2000 }),        // fiches, collections, thématiques, univers (par identifiant valide ET existant)
    queries: createTtlCache<unknown>({ ttlMs, maxEntries: 500 }),       // recherches et suggestions (texte libre)
    misses: createTtlCache<true>({ ttlMs: Math.min(ttlMs, 15_000), maxEntries: 500 }),   // identifiants introuvables, 15 s au plus
  };
  const found = (value: unknown) => value !== null && value !== undefined;
  const zoneOf = (key: string) => (/^(program|collection|theme|creator):/.test(key) ? zones.items : /^(search|suggest):/.test(key) ? zones.queries : zones.core);
  const cached = async <T>(key: string, loader: () => Promise<T>): Promise<T> => {
    if (zones.misses.has(key)) return null as T;
    const value = (await zoneOf(key).getOrLoad(key, loader, found)) as T;
    if (!found(value)) zones.misses.set(key, true);
    return value;
  };
  const clearCaches = () => { for (const zone of Object.values(zones)) zone.clear(); };
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
  routes.get('/api/home', async c => {
    const home = await cached('home', () => getHome(deps.sql));
    cacheable(c);
    return c.json(home);
  });

  routes.get('/api/programs/:slug', async c => {
    const slug = slugOf(c.req.param('slug'));
    const detail = await cached(`program:${slug}`, () => getProgramDetail(deps.sql, slug));
    if (!detail) throw errors.notFound('Programme introuvable.');
    cacheable(c);
    return c.json(detail);
  });

  routes.get('/api/collections/:slug', async c => {
    const slug = slugOf(c.req.param('slug'));
    const collection = await cached(`collection:${slug}`, () => getCollection(deps.sql, slug));
    if (!collection) throw errors.notFound('Collection introuvable.');
    cacheable(c);
    return c.json(collection);
  });

  // Classement complet : l'ordre du Top 10 éditorial d'abord, puis le reste du catalogue par audience (14 jours) puis par titre.
  routes.get('/api/ranking', async c => {
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 50) || 50, 1), 200);
    const offset = Math.min(Math.max(Number(c.req.query('offset') ?? 0) || 0, 0), 10_000);
    // Un seul classement complet en cache (et non une entrée par limit/offset) : des URL variées ne peuvent ni multiplier
    // les requêtes SQL ni chasser l'accueil du cache borné. La page demandée est découpée en mémoire.
    const everything = await cached('ranking:all', () => getRanking(deps.sql, 10_000, 0));
    const ranking = { total: everything.total, items: everything.items.slice(offset, offset + limit) };
    cacheable(c);
    return c.json(ranking);
  });

  routes.get('/api/themes', async c => {
    const themes = await cached('themes', () => listThemes(deps.sql));
    cacheable(c);
    return c.json({ themes });
  });

  routes.get('/api/themes/:slug', async c => {
    const slug = slugOf(c.req.param('slug'));
    const programs = await cached(`theme:${slug}`, () => listProgramsByTheme(deps.sql, slug));
    if (!programs) throw errors.notFound('Thématique introuvable.');
    cacheable(c);
    return c.json({ programs });
  });

  routes.get('/api/creators', async c => {
    const creators = await cached('creators', () => listCreators(deps.sql));
    cacheable(c);
    return c.json({ creators });
  });

  // Recherche : « q » de 2 à 80 caractères. Sans accents ni casse ; plusieurs mots = tous requis.
  routes.get('/api/search', async c => {
    const q = (c.req.query('q') ?? '').trim();
    if (q.length < 2 || q.length > 80) throw errors.badRequest('La recherche doit faire entre 2 et 80 caractères.');
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 20) || 20, 1), 50);
    const tokens = foldQuery(q);
    const result = await cached(`search:${limit}:${tokens.join(' ')}`, async () => {
      const run = (words: string[]) => Promise.all([searchPrograms(deps.sql, words, limit), searchCreators(deps.sql, words, 10)]);
      let [programs, creators] = await run(tokens);
      let correctedQuery: string | null = null;
      // Rien trouvé : on tente une correction des fautes de frappe (« mysterre » → « mystere »).
      if (programs.length === 0 && creators.length === 0 && tokens.length > 0) {
        const fixed = correctTokens(tokens, await cached('search-vocabulary', () => loadSearchVocabulary(deps.sql)));
        if (fixed.changed) {
          [programs, creators] = await run(fixed.tokens);
          if (programs.length > 0 || creators.length > 0) correctedQuery = fixed.tokens.join(' ');
        }
      }
      return { programs, creators, correctedQuery };
    });
    cacheable(c);
    return c.json({ query: q, correctedQuery: result.correctedQuery, programs: result.programs, creators: result.creators });
  });

  // Complétion automatique de la barre de recherche (dès 1 caractère) : titres, créateurs, thématiques.
  routes.get('/api/search/suggestions', async c => {
    const q = (c.req.query('q') ?? '').trim();
    if (q.length < 1 || q.length > 80) throw errors.badRequest('La saisie doit faire entre 1 et 80 caractères.');
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 8) || 8, 1), 15);
    const tokens = foldQuery(q);
    const suggestions = await cached(`suggest:${limit}:${tokens.join(' ')}`, () => suggest(deps.sql, tokens, limit));
    cacheable(c);
    return c.json({ query: q, suggestions });
  });

  // Page d'un créateur : présentation, chapitres et contenus classés par rubrique. 404 si inconnu ou non publié.
  routes.get('/api/creators/:slug', async c => {
    const slug = slugOf(c.req.param('slug'));
    const universe = await cached(`creator:${slug}`, () => getCreatorUniverse(deps.sql, slug));
    if (!universe) throw errors.notFound('Créateur introuvable.');
    cacheable(c);
    return c.json(universe);
  });

  // ---- Administration éditoriale ----------------------------------------------------------------------------------

  routes.get('/api/admin/catalog', async c => {
    requireAdmin(c);
    return c.json(await listAllForAdmin(deps.sql));
  });

  // Toute écriture éditoriale vide le cache : l'administrateur voit son changement tout de suite (les autres instances, après la durée du cache).
  routes.use('/api/admin/*', async (c, next) => {
    await next();
    if (c.req.method === 'GET') return;
    clearCaches();
    // Journal d'audit : qui a modifié quoi dans le catalogue (écritures réussies seulement, jamais le contenu des fiches).
    const target = /^\/api\/admin\/(programs|themes|creators|collections)\/([^/]+)(\/contents)?$/.exec(c.req.path);
    if (!target || c.res.status >= 300) return;
    const kind = (target[1] ?? '').replace(/s$/, '');
    const action = c.req.method === 'DELETE' ? 'delete' : target[3] ? 'contents' : 'save';
    await insertAudit(deps.sql, { userId: c.get('user')?.id ?? null, event: `catalog.${kind}.${action}`, requestId: c.get('requestId') ?? null, details: { slug: target[2] } })
      .catch(() => undefined); // un journal en panne ne doit jamais faire échouer une modification déjà faite
  });

  // « Prochainement » : sorties annoncées (fiche résumée seulement, jamais de lecture avant la date).
  routes.get('/api/coming-soon', async c => {
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 20) || 20, 1), 50);
    const programs = await cached(`coming-soon:${limit}`, () => listComingSoon(deps.sql, limit));
    cacheable(c);
    return c.json({ programs });
  });

  // Validation éditoriale d'une sortie bloquée : publie maintenant si tous les médias obligatoires sont prêts, sinon 409 + liste de ce qui manque.
  routes.post('/api/admin/programs/:slug/release', async c => {
    const admin = requireAdmin(c);
    const slug = slugOf(c.req.param('slug'));
    const outcome = await validateRelease(deps.sql, slug);
    if (outcome.result === 'unknown') throw errors.notFound('Programme introuvable.');
    if (outcome.result === 'missing') throw new AppError('conflict', 409, `Publication impossible : médias non prêts (${outcome.missing.join(', ')}).`);
    await insertAudit(deps.sql, { userId: admin.id, event: 'catalog.program.release_validated', requestId: c.get('requestId') ?? null, details: { slug } });
    return c.body(null, 204);
  });

  // Calendrier éditorial (sorties et retraits à venir) — administrateur.
  routes.get('/api/admin/schedule', async c => {
    requireAdmin(c);
    return c.json({ entries: await listSchedule(deps.sql) });
  });

  // Journal des modifications du catalogue (les plus récentes d'abord). `?before=<id>` pour la page suivante.
  routes.get('/api/admin/audit', async c => {
    requireAdmin(c);
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 50) || 50, 1), 200);
    const before = Number(c.req.query('before') ?? 0) || null;
    const rows = await listCatalogAudit(deps.sql, limit, before);
    return c.json({
      entries: rows.map(r => ({ id: r.id, event: r.event, by: r.email, details: r.details, at: r.created_at.toISOString() })),
      next: rows.length === limit ? rows[rows.length - 1]?.id ?? null : null,
    });
  });

  // Vue complète d'un programme pour le back-office : brouillon inclus, médias, dernières préparations.
  routes.get('/api/admin/programs/:slug', async c => {
    requireAdmin(c);
    const view = await getProgramForAdmin(deps.sql, slugOf(c.req.param('slug')));
    if (!view) throw errors.notFound('Programme introuvable.');
    return c.json(view);
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
    try {
      await upsertTheme(deps.sql, slugOf(c.req.param('slug')), parseBody(themeSchema, await body(c)));
    } catch (error) {
      if ((error as { code?: string }).code === '23503') throw errors.badRequest('Le programme « phare » n’existe pas.');
      throw error;
    }
    return c.body(null, 204);
  });

  routes.delete('/api/admin/themes/:slug', async c => {
    requireAdmin(c);
    if (!(await deleteTheme(deps.sql, slugOf(c.req.param('slug'))))) throw errors.notFound('Thématique introuvable.');
    return c.body(null, 204);
  });

  routes.get('/api/admin/creators', async c => {
    requireAdmin(c);
    return c.json({ creators: await listCreatorsForAdmin(deps.sql) });
  });

  // Fiche admin d'un créateur (brouillon compris) : `document` et `contents` se renvoient tels quels aux deux routes PUT.
  routes.get('/api/admin/creators/:slug', async c => {
    requireAdmin(c);
    const view = await getCreatorForAdmin(deps.sql, slugOf(c.req.param('slug')));
    if (!view) throw errors.notFound('Créateur introuvable.');
    return c.json(view);
  });

  // Remplace tous les contenus du créateur (l'ordre de la liste = l'ordre d'affichage).
  routes.put('/api/admin/creators/:slug/contents', async c => {
    requireAdmin(c);
    const parsed = parseBody(creatorContentsSchema, await body(c));
    if (!(await replaceCreatorContents(deps.sql, slugOf(c.req.param('slug')), parsed.contents))) throw errors.notFound('Créateur introuvable.');
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
