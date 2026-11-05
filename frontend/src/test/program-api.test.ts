import { beforeEach, describe, expect, it, vi } from 'vitest';
import film from './fixtures/api-program-film.json';
import pth from './fixtures/api-program-pth.json';
import similar from './fixtures/api-similar.json';

/** Fiche programme réelle : adaptateurs testés contre de VRAIES réponses de l'API, puis chargement, 404 et panne. */
beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); });

describe('Adaptation de la fiche serveur', () => {
  it('un film : une saison, un épisode « feature », visuels absolus, aucune donnée inventée', async () => {
    const { toProduction } = await import('@/lib/program-api');
    const production = toProduction(film as never);
    expect(production).toMatchObject({ slug: 'le-silence', kind: 'film', title: 'Le Silence', label: 'Bande-annonce', isDemo: true });
    expect(production.heroImage).toBe('http://localhost:4000/images/le-silence/le-silence-poster.jpg');
    expect(production.seasons).toHaveLength(1);
    expect(production.seasons[0]!.episodes.map(episode => episode.id)).toEqual(['feature']);
    expect(production.seasons[0]!.episodes[0]!.image).toMatch(/^http:\/\/localhost:4000\/images\//);
    expect(production.meta.genres).toEqual(['Bande-annonce']);                        // aucun genre serveur : repli sur la catégorie, pas de genre inventé
  });

  it('une série : saisons et épisodes du serveur, libellés, badges, durée', async () => {
    const { toProduction } = await import('@/lib/program-api');
    const production = toProduction(pth as never);
    expect(production.kind).toBe('serie');
    expect(production.status).toEqual(['Nouvelle saison', 'Exclusivité ORIGIN']);
    expect(production.seasons.map(season => season.number)).toEqual([1, 2]);
    expect(production.seasons[1]!.episodes.map(episode => episode.id)).toEqual(['s2-e4', 's2-e5', 's2-e6', 's2-e7', 's2-e8']);
    expect(production.seasons[1]!.episodes.at(-1)).toMatchObject({ number: 8, title: 'Les coulisses du ministère' });
  });

  it('rangée « similaires » : titres, visuels absolus, fiche légère pour l\'aperçu (une série n\'a pas d\'épisode inventé)', async () => {
    const { toSuggestion, toPreviewProduction } = await import('@/lib/program-api');
    const cards = (similar as unknown as { items: { program: never }[] }).items.map(item => item.program);
    expect(cards.length).toBeGreaterThan(0);
    const suggestion = toSuggestion(cards[0]!);
    expect(suggestion.image).toMatch(/^http:\/\/localhost:4000\/images\//);
    const preview = toPreviewProduction(cards[0]!);
    expect(preview.slug).toBe(suggestion.id);
    expect(preview.seasons.every(season => season.episodes.length > 0) || preview.kind === 'serie').toBe(true);
    const serie = toPreviewProduction({ slug: 's', kind: 'serie', title: 'S', images: { poster: '/images/s/p.jpg' } } as never);
    expect(serie.seasons).toEqual([]);
  });

  it('progression réelle appliquée aux épisodes sans modifier la fiche chargée ; identifiant de lecture du film = son slug', async () => {
    const { toProduction, withProgress, playbackIdOf } = await import('@/lib/program-api');
    const base = toProduction(pth as never);
    const merged = withProgress(base, { 'les-secrets-du-ministere-s2-e8': { positionSeconds: 1500, durationSeconds: 3120, completed: false } });
    expect(merged.seasons[1]!.episodes.at(-1)!.watchProgress).toEqual({ positionSeconds: 1500, durationSeconds: 3120, completed: false });
    expect(base.seasons[1]!.episodes.at(-1)!.watchProgress).toBeUndefined();
    expect(playbackIdOf('le-silence', 'feature')).toBe('le-silence');
    expect(playbackIdOf('serie', 's1-e2')).toBe('serie-s1-e2');
  });
});

describe('Chargement de la fiche', () => {
  const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('assemble fiche, similaires et rangs ; une panne des similaires ne bloque pas la fiche', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/similar')) return respond(503, { error: 'x', message: 'x' });
      if (url.endsWith('/top-10')) return respond(200, { items: [{ slug: 'gladiator', rank: 1 }, { slug: 'le-silence', rank: 2 }] });
      return respond(200, film);
    }));
    const { fetchProductionPage } = await import('@/lib/program-api');
    const page = await fetchProductionPage('le-silence');
    expect(page?.production.slug).toBe('le-silence');
    expect(page?.similar).toEqual([]);                                                 // similaires en panne : la fiche s'affiche quand même
    expect(page?.ranks).toEqual({ gladiator: 1, 'le-silence': 2 });
  });

  it('similaires : la vraie forme {items:[{program, reason}]} est lue (fixture réelle)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/similar') ? respond(200, similar) : url.endsWith('/top-10') ? respond(200, { items: [] }) : respond(200, film))));
    const { fetchProductionPage } = await import('@/lib/program-api');
    const page = await fetchProductionPage('le-silence');
    expect(page!.similar.length).toBe((similar as { items: unknown[] }).items.length);
    expect(Object.keys(page!.previews)).toEqual(page!.similar.map(item => item.id));
  });

  it('programme inconnu : null (404) ; serveur en panne : l\'erreur remonte (pas de fiche de remplacement)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(404, { error: 'not_found', message: 'Programme introuvable.' })));
    const { fetchProductionPage } = await import('@/lib/program-api');
    expect(await fetchProductionPage('inconnu')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    // Production (hors développement local) : la panne remonte. En développement, l'aperçu hors connexion prend le relais (voir offline-preview.test.ts).
    vi.stubEnv('DEV', false);
    await expect(fetchProductionPage('le-silence')).rejects.toMatchObject({ status: 0 });
    vi.unstubAllEnvs();
  });
});
