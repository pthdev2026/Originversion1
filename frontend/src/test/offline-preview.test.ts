import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Aperçu hors connexion : actif seulement sans API configurée, ou en développement quand l'API est injoignable ; jamais en production avec une API. */
const setup = async (opts: { apiUrl: string | undefined; dev: boolean; forced?: boolean }) => {
  vi.resetModules();
  vi.stubEnv('DEV', opts.dev);
  vi.stubEnv('VITE_OFFLINE_PREVIEW', opts.forced ? '1' : '');
  vi.doMock('@/lib/env', () => ({ env: { apiUrl: opts.apiUrl, supportEmail: undefined } }));
  return import('@/lib/offline-preview');
};
beforeEach(() => { vi.unstubAllEnvs(); });

describe('withOfflineFallback', () => {
  it('aucune API configurée (aperçu hébergé) : version de démonstration, l\'appel réel n\'est jamais tenté', async () => {
    const { withOfflineFallback, offlinePreviewActive } = await setup({ apiUrl: undefined, dev: false });
    const online = vi.fn(async () => 'réel');
    expect(await withOfflineFallback(online, () => 'démo')).toBe('démo');
    expect(online).not.toHaveBeenCalled();
    expect(offlinePreviewActive()).toBe(true);
  });

  it('production avec une API configurée : la panne reste une vraie panne (jamais de données de démonstration)', async () => {
    const { withOfflineFallback, offlinePreviewActive } = await setup({ apiUrl: 'https://app.example', dev: false });
    await expect(withOfflineFallback(async () => { throw new Error('réseau'); }, () => 'démo')).rejects.toThrow('réseau');
    expect(offlinePreviewActive()).toBe(false);
  });

  it('production avec une API configurée et qui répond : donnée réelle', async () => {
    const { withOfflineFallback } = await setup({ apiUrl: 'https://app.example', dev: false });
    expect(await withOfflineFallback(async () => 'réel', () => 'démo')).toBe('réel');
  });

  it('développement, API injoignable : bascule sur la démonstration et le signale', async () => {
    const { withOfflineFallback, offlinePreviewActive } = await setup({ apiUrl: 'http://localhost:4000', dev: true });
    expect(offlinePreviewActive()).toBe(false);
    expect(await withOfflineFallback(async () => { throw new Error('ECONNREFUSED'); }, () => 'démo')).toBe('démo');
    expect(offlinePreviewActive()).toBe(true);
  });

  it('développement, API qui répond : donnée réelle, pas de bascule', async () => {
    const { withOfflineFallback, offlinePreviewActive } = await setup({ apiUrl: 'http://localhost:4000', dev: true });
    expect(await withOfflineFallback(async () => 'réel', () => 'démo')).toBe('réel');
    expect(offlinePreviewActive()).toBe(false);
  });

  it('VITE_OFFLINE_PREVIEW=1 : forcé même avec une API configurée', async () => {
    const { offlinePreviewForced } = await setup({ apiUrl: 'https://app.example', dev: false, forced: true });
    expect(offlinePreviewForced()).toBe(true);
  });
});

describe('contenus de démonstration', () => {
  it('l\'accueil, la fiche, les similaires et la recherche se construisent sans réseau', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({ env: { apiUrl: undefined, supportEmail: undefined } }));
    const { fetchHome } = await import('@/lib/catalog-api');
    const { fetchProductionPage } = await import('@/lib/program-api');
    const { searchPrograms } = await import('@/lib/search-api');
    const { fetchRanking } = await import('@/lib/catalog-api');
    const home = await fetchHome();
    expect(home.hero.length).toBeGreaterThan(3);
    expect(home.topTen.length).toBeGreaterThan(5);
    expect(home.contents).not.toBe((await import('@/lib/origin-catalogs')).catalogContents);   // copie : applyServerCatalog ne s'efface jamais lui-même
    const page = await fetchProductionPage(home.topTen[0]!.id);
    expect(page?.production.title).toBeTruthy();
    expect(page!.similar.length).toBeGreaterThan(0);
    expect(await fetchProductionPage('programme-inconnu')).toBeNull();
    expect((await searchPrograms('silence')).hits.length).toBeGreaterThan(0);
    expect((await fetchRanking()).length).toBeGreaterThan(5);
  });
});

describe('bandeau en développement (rendu serveur déjà basculé)', () => {
  it('API injoignable : le navigateur le découvre et affiche le bandeau ; API joignable : pas de bandeau', async () => {
    const { renderHook, waitFor } = await import('@testing-library/react');
    const down = await setup({ apiUrl: 'http://localhost:59999', dev: true });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('ECONNREFUSED'); }));
    const unreachable = renderHook(() => down.useOfflinePreview());
    await waitFor(() => expect(unreachable.result.current).toBe(true));

    const up = await setup({ apiUrl: 'http://localhost:4000', dev: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"status":"ok"}', { status: 200 })));
    const reachable = renderHook(() => up.useOfflinePreview());
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(reachable.result.current).toBe(false);
  });
});
