import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Progression de lecture et « Continuer à regarder » RÉELS, contre un faux serveur qui reproduit le contrat de l'API. */
interface Put { path: string; body: { positionSeconds: number; durationSeconds: number; sentAt: number }; keepalive: boolean; credentials: string | undefined; startedAt: number; endedAt: number }

function fakeVideo(initial: { currentTime?: number; duration?: number; paused?: boolean } = {}) {
  const video = document.createElement('video');
  const state = { currentTime: initial.currentTime ?? 0, duration: initial.duration ?? 600, paused: initial.paused ?? false, ended: false, seeking: false };
  for (const key of Object.keys(state) as (keyof typeof state)[]) Object.defineProperty(video, key, { get: () => state[key], set: (value: never) => { (state as Record<string, unknown>)[key] = value; }, configurable: true });
  return { video, state };
}

function server(options: { status?: () => number; latency?: number } = {}) {
  const puts: Put[] = [];
  const gets: string[] = [];
  let clock = 0;
  const handler = async (url: string, init: RequestInit = {}) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    if ((init.method ?? 'GET') === 'GET') { gets.push(path); return new Response(JSON.stringify({ items: [] }), { status: 200 }); }
    const put: Put = { path, body: JSON.parse(String(init.body)), keepalive: init.keepalive === true, credentials: init.credentials, startedAt: ++clock, endedAt: 0 };
    puts.push(put);
    await new Promise(resolve => setTimeout(resolve, options.latency ?? 0));
    put.endedAt = ++clock;
    const status = options.status?.() ?? 200;
    return new Response(status >= 400 ? JSON.stringify({ error: 'x', message: 'refusé' }) : JSON.stringify({ playbackId: 'p' }), { status });
  };
  return { handler, puts, gets };
}

let stop: (() => void) | undefined;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

async function boot(srv: ReturnType<typeof server>) {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(srv.handler));
  return import('@/lib/progress-reporter');
}

describe('Enregistrement de la progression', () => {
  it('envoie toutes les 12 s pendant la lecture, jamais pendant une pause', async () => {
    const srv = server(); const { startProgressReporting } = await boot(srv);
    const { video, state } = fakeVideo({ currentTime: 125 });
    stop = startProgressReporting(video, 'le-silence', { fallbackDuration: 900 });
    await vi.advanceTimersByTimeAsync(12_100);
    expect(srv.puts).toHaveLength(1);
    expect(srv.puts[0]!.path).toBe('/api/me/progress/le-silence');
    expect(srv.puts[0]!.body).toMatchObject({ positionSeconds: 125, durationSeconds: 600 });
    expect(srv.puts[0]!.credentials).toBe('include');
    state.paused = true; state.currentTime = 200;
    await vi.advanceTimersByTimeAsync(24_000);
    expect(srv.puts).toHaveLength(1);                                // en pause : aucun envoi périodique
  });

  it('pause → envoi immédiat de la position exacte', async () => {
    const srv = server(); const { startProgressReporting } = await boot(srv);
    const { video, state } = fakeVideo({ currentTime: 61.234 });
    stop = startProgressReporting(video, 'le-silence', { fallbackDuration: 900 });
    state.paused = true; video.dispatchEvent(new Event('pause'));
    await vi.advanceTimersByTimeAsync(50);
    expect(srv.puts).toHaveLength(1);
    expect(srv.puts[0]!.body.positionSeconds).toBe(61.2);
  });

  it('un contenu à peine commencé (< 1 s) n\'écrase rien', async () => {
    const srv = server(); const { startProgressReporting } = await boot(srv);
    const { video } = fakeVideo({ currentTime: 0.4 });
    stop = startProgressReporting(video, 'le-silence', { fallbackDuration: 900 });
    video.dispatchEvent(new Event('pause')); await vi.advanceTimersByTimeAsync(13_000);
    expect(srv.puts).toHaveLength(0);
  });

  it('fin du programme : la position envoyée est la durée', async () => {
    const srv = server(); const { startProgressReporting } = await boot(srv);
    const { video, state } = fakeVideo({ currentTime: 598 });
    stop = startProgressReporting(video, 'le-silence', { fallbackDuration: 900 });
    state.ended = true; state.currentTime = 600; video.dispatchEvent(new Event('ended'));
    await vi.advanceTimersByTimeAsync(50);
    expect(srv.puts[0]!.body.positionSeconds).toBe(600);
  });

  it('ordre : horodatage strictement croissant et jamais deux envois en parallèle', async () => {
    const srv = server({ latency: 30 }); const { startProgressReporting } = await boot(srv);
    const { video, state } = fakeVideo({ currentTime: 100 });
    stop = startProgressReporting(video, 'le-silence', { fallbackDuration: 900 });
    video.dispatchEvent(new Event('pause')); state.currentTime = 101; video.dispatchEvent(new Event('pause')); state.currentTime = 102; video.dispatchEvent(new Event('pause'));
    await vi.advanceTimersByTimeAsync(500);
    expect(srv.puts).toHaveLength(3);
    const stamps = srv.puts.map(put => put.body.sentAt);
    expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
    expect(new Set(stamps).size).toBe(3);                            // jamais deux horodatages identiques, même dans la même milliseconde
    for (let i = 1; i < srv.puts.length; i += 1) expect(srv.puts[i]!.startedAt).toBeGreaterThan(srv.puts[i - 1]!.endedAt); // chacun commence après la fin du précédent
    expect(srv.puts.map(put => put.body.positionSeconds)).toEqual([102, 102, 102]); // la position est relue au moment d'envoyer : toujours la plus récente
  });

  it('fermeture de la page : requête keepalive avec les cookies', async () => {
    const srv = server(); const { startProgressReporting } = await boot(srv);
    const { video } = fakeVideo({ currentTime: 300 });
    stop = startProgressReporting(video, 'le-silence', { fallbackDuration: 900 });
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(20);
    expect(srv.puts).toHaveLength(1);
    expect(srv.puts[0]!.keepalive).toBe(true);
    expect(srv.puts[0]!.credentials).toBe('include');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(20);
    expect(srv.puts).toHaveLength(2);                                // mise en arrière-plan : même mécanisme
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('sortie du lecteur : dernier envoi avec la dernière position connue, même si le lecteur est déjà vidé', async () => {
    const srv = server(); const { startProgressReporting } = await boot(srv);
    const { video, state } = fakeVideo({ currentTime: 412 });
    stop = startProgressReporting(video, 'le-silence', { fallbackDuration: 900 });
    video.dispatchEvent(new Event('timeupdate'));
    state.currentTime = 0;                                           // hls.js détruit : le temps retombe à 0
    stop(); stop = undefined;
    await vi.advanceTimersByTimeAsync(20);
    expect(srv.puts).toHaveLength(1);
    expect(srv.puts[0]!.body.positionSeconds).toBe(412);
  });

  it('session expirée (401) : l\'envoi s\'arrête proprement, sans boucle', async () => {
    const srv = server({ status: () => 401 }); const { startProgressReporting } = await boot(srv);
    const { video } = fakeVideo({ currentTime: 50 });
    stop = startProgressReporting(video, 'le-silence', { fallbackDuration: 900 });
    await vi.advanceTimersByTimeAsync(12_100);
    expect(srv.puts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(srv.puts).toHaveLength(1);                                // plus aucun envoi après le 401
  });

  it('panne réseau ou serveur : le prochain envoi repart avec la position du moment', async () => {
    let failing = true;
    const srv = server({ status: () => (failing ? 503 : 200) }); const { startProgressReporting } = await boot(srv);
    const { video, state } = fakeVideo({ currentTime: 50 });
    stop = startProgressReporting(video, 'le-silence', { fallbackDuration: 900 });
    await vi.advanceTimersByTimeAsync(12_100);
    expect(srv.puts).toHaveLength(1);
    failing = false; state.currentTime = 80;
    await vi.advanceTimersByTimeAsync(12_000);
    expect(srv.puts).toHaveLength(2);
    expect(srv.puts[1]!.body.positionSeconds).toBe(80);
  });
});

describe('« Continuer à regarder » réel', () => {
  const item = (over: Record<string, unknown>) => ({ playbackId: 'le-silence', programSlug: 'le-silence', positionSeconds: 420, durationSeconds: 900, progressRatio: 0.467, kind: 'film', episode: null, ...over });

  it('transforme la réponse du serveur : un élément par programme, libellés, temps restant, pourcentage', async () => {
    vi.resetModules();
    const { toEntries } = await import('@/features/account/session/continue-store');
    const entries = toEntries([
      item({}),
      item({ playbackId: 'serie-s2-e6', programSlug: 'serie', kind: 'serie', episode: { number: 6, seasonNumber: 2 }, positionSeconds: 1200, durationSeconds: 3000, progressRatio: 0.4 }),
      item({ playbackId: 'serie-s1-e1', programSlug: 'serie', kind: 'serie', episode: { number: 1, seasonNumber: 1 } }),   // ancien épisode du même programme : ignoré
    ]);
    expect(entries.map(entry => entry.id)).toEqual(['le-silence', 'serie']);
    expect(entries[0]).toMatchObject({ label: 'Film', remaining: 'Il reste 8 min', percent: 47, series: false, playbackId: 'le-silence' });
    expect(entries[1]).toMatchObject({ label: 'Épisode 6 · Saison 2', remaining: 'Il reste 30 min', percent: 40, series: true, playbackId: 'serie-s2-e6' });
  });

  it('retirer : optimiste puis DELETE ; refus du serveur = retour arrière', async () => {
    vi.useRealTimers();
    const calls: string[] = [];
    let ok = true;
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'; calls.push(`${method} ${url.replace(/^https?:\/\/[^/]+/, '')}`);
      if (method === 'GET') return new Response(JSON.stringify({ items: [item({})] }), { status: 200 });
      return ok ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ error: 'x', message: 'non' }), { status: 500 });
    }));
    const store = await import('@/features/account/session/continue-store');
    await store.refreshContinue();
    const entry = store.continueEntries()[0]!;
    expect(await store.forgetProgress(entry)).toBe(true);
    expect(store.continueEntries()).toHaveLength(0);
    expect(calls).toContain('DELETE /api/me/progress/le-silence');
    await store.refreshContinue(); // le faux serveur renvoie encore l'élément
    ok = false;
    expect(await store.forgetProgress(store.continueEntries()[0]!)).toBe(false);
    expect(store.continueEntries()).toHaveLength(1);                  // retour arrière
  });

  it('marquer comme vu : PUT de la durée (le serveur le considère terminé) ; annuler : PUT de la position d\'origine', async () => {
    vi.useRealTimers();
    const puts: { path: string; body: { positionSeconds: number } }[] = [];
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.method ?? 'GET') === 'GET') return new Response(JSON.stringify({ items: [item({})] }), { status: 200 });
      puts.push({ path: url.replace(/^https?:\/\/[^/]+/, ''), body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({}), { status: 200 });
    }));
    const store = await import('@/features/account/session/continue-store');
    await store.refreshContinue();
    const entry = store.continueEntries()[0]!;
    expect(await store.markWatched(entry)).toBe(true);
    expect(puts[0]).toMatchObject({ path: '/api/me/progress/le-silence', body: { positionSeconds: 900 } });
    expect(await store.restoreProgress(entry)).toBe(true);
    expect(puts[1]!.body.positionSeconds).toBe(420);
  });
});
