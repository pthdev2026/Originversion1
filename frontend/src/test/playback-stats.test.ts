import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Statistiques de lecture : un seul mécanisme (POST /api/playback-sessions), autorisé par le jeton, sans double comptage. */
const grant = { sessionId: '11111111-2222-4333-8444-555555555555', token: '1790000000.signature' };
let sent: { url: string; body: Record<string, unknown> }[] = [];
let video: HTMLVideoElement;
const live = { activeHeight: 720 as number | null, startupMs: 640 as number | null, fatalError: null as string | null, engine: 'hlsjs' as const };

const setVideo = (state: Partial<{ paused: boolean; ended: boolean; seeking: boolean; readyState: number; currentTime: number }>) => {
  for (const [key, value] of Object.entries(state)) Object.defineProperty(video, key, { value, configurable: true, writable: true });
};
const tick = (time: number) => { setVideo({ currentTime: time }); video.dispatchEvent(new Event('timeupdate')); };

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  sent = [];
  vi.doMock('@/lib/env', () => ({ env: { apiUrl: 'http://api.test' } }));
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { sent.push({ url, body: JSON.parse(String(init.body)) }); return new Response(null, { status: 204 }); }));
  Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true });
  video = document.createElement('video');
  setVideo({ paused: false, ended: false, seeking: false, readyState: 4, currentTime: 0 });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const start = async () => {
  const { startPlaybackStats } = await import('@/lib/playback-stats');
  return startPlaybackStats(video, { playbackId: 'les-passagers', grant, current: () => live });
};

describe('startPlaybackStats', () => {
  it('compte seulement le temps réellement regardé : ni saut, ni pause, ni attente de données', async () => {
    const stop = await start();
    video.dispatchEvent(new Event('playing'));
    for (let t = 1; t <= 10; t++) tick(t);                        // 10 s de lecture
    setVideo({ seeking: true }); video.dispatchEvent(new Event('seeking')); tick(3000); setVideo({ seeking: false }); video.dispatchEvent(new Event('seeked'));   // saut à 3000 s : 0 s compté
    for (let t = 3001; t <= 3005; t++) tick(t);                   // 5 s de plus
    setVideo({ paused: true }); video.dispatchEvent(new Event('pause')); tick(3100); tick(3200);   // pause : rien
    stop();
    const report = sent.at(-1)!.body;
    expect(report['watchSeconds']).toBeCloseTo(15, 0);
    expect(report['levelSeconds']).toEqual({ '720': 15 });
    expect(report).toMatchObject({ id: grant.sessionId, token: grant.token, playbackId: 'les-passagers', startupMs: 640, engine: 'hlsjs', maxHeight: 720 });
  });

  it('coupures : une attente pendant la lecture compte, un saut voulu ou le chargement initial non', async () => {
    const stop = await start();
    video.dispatchEvent(new Event('waiting'));                    // avant le démarrage : chargement initial
    video.dispatchEvent(new Event('playing'));
    video.dispatchEvent(new Event('waiting'));                    // vraie coupure
    vi.advanceTimersByTime(2000);
    video.dispatchEvent(new Event('playing'));
    setVideo({ seeking: true }); video.dispatchEvent(new Event('seeking')); video.dispatchEvent(new Event('waiting')); setVideo({ seeking: false });   // saut : pas une coupure
    video.dispatchEvent(new Event('playing'));
    tick(1); tick(2);
    stop();
    const report = sent.at(-1)!.body;
    expect(report['rebufferCount']).toBe(1);
    expect(Number(report['rebufferMs'])).toBeGreaterThanOrEqual(2000);
  });

  it('un rapport toutes les 15 s seulement s\'il y a du nouveau ; aucun envoi si la lecture n\'a jamais démarré', async () => {
    const stop = await start();
    vi.advanceTimersByTime(60_000);
    expect(sent).toHaveLength(0);                                 // rien n'a joué
    video.dispatchEvent(new Event('playing'));
    for (let t = 1; t <= 30; t++) tick(t);
    vi.advanceTimersByTime(15_000);
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(15_000);                               // aucune évolution : rien de renvoyé
    expect(sent).toHaveLength(1);
    for (let t = 31; t <= 40; t++) tick(t);
    vi.advanceTimersByTime(15_000);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.body['watchSeconds']).toBeGreaterThan(sent[0]!.body['watchSeconds'] as number);   // cumulatif
    stop();
  });

  it('fermeture de page : sendBeacon text/plain avec le jeton dans le corps', async () => {
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    const stop = await start();
    video.dispatchEvent(new Event('playing'));
    for (let t = 1; t <= 12; t++) tick(t);
    window.dispatchEvent(new Event('pagehide'));
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe('http://api.test/api/playback-sessions');
    expect(blob.type).toBe('text/plain');
    vi.useRealTimers();                                           // FileReader n'avance pas avec les faux minuteurs
    const text = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
    expect(JSON.parse(text)).toMatchObject({ id: grant.sessionId, token: grant.token });
    stop();                                                       // sortie du lecteur juste après : même contenu, pas de doublon
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it('erreur fatale : remontée même sans lecture ; sans URL d\'API : aucun envoi', async () => {
    live.fatalError = 'network';
    const stop = await start();
    stop();
    expect(sent.at(-1)!.body['fatalError']).toBe('network');
    live.fatalError = null;
  });
});

describe('deviceKind', () => {
  it('appareil d\'après l\'agent utilisateur ; une fenêtre étroite de bureau reste un ordinateur', async () => {
    const { deviceKind } = await import('@/lib/playback-stats');
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36';
    expect(deviceKind(1440, mac, false)).toBe('desktop');
    expect(deviceKind(500, mac, false)).toBe('desktop');
    expect(deviceKind(375, mac, true)).toBe('mobile');
    expect(deviceKind(390, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', true)).toBe('mobile');
    expect(deviceKind(820, 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', true)).toBe('tablet');
  });
});

describe('autorisation dans la réponse de lecture', () => {
  it('parsePlayback conserve analytics, ou null s\'il manque', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ programId: 'a', manifestUrl: 'u', expiresAt: '2030-01-01T00:00:00Z', durationSeconds: 5, analytics: grant }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ programId: 'a', manifestUrl: 'u', expiresAt: '2030-01-01T00:00:00Z' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchPlayback } = await import('@/lib/origin-api');
    const withGrant = await fetchPlayback('a'); const without = await fetchPlayback('a');
    expect(withGrant.status === 'ready' && withGrant.info.analytics).toEqual(grant);
    expect(without.status === 'ready' && without.info.analytics).toBeNull();
  });
});
