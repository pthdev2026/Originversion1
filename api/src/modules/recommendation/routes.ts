/** Module « recommendation » — routes HTTP. Chaque élément renvoyé porte sa raison (affichable telle quelle). */
import { Hono } from 'hono';
import type { Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { isValidId } from '../../platform/storage/layout.ts';
import { getCards } from '../catalog/content.ts';
import { createTtlCache } from '../../platform/http/ttl-cache.ts';
import { listUserThemes } from '../account/repository.ts';
import { loadCatalog, loadEditorialOrder, loadHistory, loadTrending } from './repository.ts';
import type { ProgramFeatures } from './scoring.ts';
import { personalized, similarTo, type Recommendation } from './scoring.ts';

const limitOf = (raw: string | undefined, fallback = 10) => Math.min(Math.max(Number(raw ?? fallback) || fallback, 1), 30);

export function recommendationRoutes(deps: { sql: Sql; catalogTtlMs?: number }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const ttl = deps.catalogTtlMs ?? 0;

  /**
   * Le catalogue (caractéristiques de tous les programmes) et les tendances sont les mêmes pour tous les spectateurs :
   * on les garde en mémoire et on les partage (chargements simultanés regroupés). Mesuré : sans ce cache, 5 000 programmes
   * + 1 000 spectateurs saturaient le serveur (27 % d'échecs).
   */
  const shared = createTtlCache<unknown>({ ttlMs: ttl, maxEntries: 50 });
  const catalogFeatures = (): Promise<ProgramFeatures[]> => shared.getOrLoad('catalog', () => loadCatalog(deps.sql)) as Promise<ProgramFeatures[]>;
  const trendingCached = (limit: number): Promise<Recommendation[]> => shared.getOrLoad(`trending:${limit}`, () => trending(deps.sql, limit)) as Promise<Recommendation[]>;

  /** Associe chaque recommandation à sa fiche résumée, en conservant l'ordre. */
  async function withCards(recommendations: Recommendation[]) {
    const cards = await getCards(deps.sql, recommendations.map(item => item.slug));
    return recommendations.flatMap(item => {
      const program = cards.get(item.slug);
      return program ? [{ program, reason: item.reason }] : [];
    });
  }

  // « Dans le même esprit » : sur une fiche programme.
  routes.get('/api/programs/:slug/similar', async c => {
    const slug = c.req.param('slug');
    if (!isValidId(slug)) throw errors.badRequest('Identifiant invalide.');
    const catalog = await catalogFeatures();
    const target = catalog.find(program => program.slug === slug);
    if (!target) throw errors.notFound('Programme introuvable.');
    return c.json({ items: await withCards(similarTo(target, catalog, limitOf(c.req.query('limit')))) });
  });

  // Tendances : ce qui est réellement regardé ; complété par la sélection éditoriale tant que les données manquent.
  routes.get('/api/trending', async c => {
    const limit = limitOf(c.req.query('limit'));
    return c.json({ items: await withCards(await trendingCached(limit)) });
  });

  // « Pour vous » : personnalisé si connecté et assez d'historique, sinon tendances (jamais de faux « pour vous »).
  routes.get('/api/recommendations', async c => {
    const limit = limitOf(c.req.query('limit'));
    const user = c.get('user');
    if (!user) return c.json({ personalized: false, items: await withCards(await trendingCached(limit)) });

    const [catalog, history, favorites] = await Promise.all([catalogFeatures(), loadHistory(deps.sql, user.id), listUserThemes(deps.sql, user.id)]);
    const mine = personalized(history, catalog, limit, new Set(favorites));
    if (mine.length === 0) return c.json({ personalized: false, items: await withCards(await trendingCached(limit)) });

    // Complète avec les tendances (sans doublon ni contenu déjà connu) pour toujours remplir le rail.
    const taken = new Set([...mine.map(item => item.slug), ...history.map(entry => entry.slug)]);
    const filler = (await trendingCached(limit * 2)).filter(item => !taken.has(item.slug));
    return c.json({ personalized: true, items: await withCards([...mine, ...filler].slice(0, limit)) });
  });

  return routes;
}

async function trending(sql: Sql, limit: number): Promise<Recommendation[]> {
  const popular = await loadTrending(sql, limit);
  const picked: Recommendation[] = popular.map(item => ({ slug: item.slug, reason: 'Populaire en ce moment' }));
  if (picked.length >= limit) return picked;
  const seen = new Set(picked.map(item => item.slug));
  for (const slug of await loadEditorialOrder(sql, limit + picked.length)) {
    if (picked.length >= limit) break;
    if (!seen.has(slug)) picked.push({ slug, reason: 'Sélection ORIGIN' });
  }
  return picked;
}
