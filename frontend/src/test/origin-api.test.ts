import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPlayback, isExpired, playbackProgramId } from '@/lib/origin-api';

const payload = {
  programId: 'tout-recommencer', status: 'ready', manifestUrl: 'http://api/media/t/x/master.m3u8', posterUrl: 'http://api/media/t/x/poster.jpg',
  durationSeconds: 15.083, renditions: [{ name: '1080p', height: 1080, videoKbps: 5000 }], expiresAt: '2099-01-01T00:00:00.000Z',
};
const respond = (status: number, body?: unknown) => Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

describe('fetchPlayback', () => {
  it('returns the playback info when the media is ready', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(200, payload)));
    const result = await fetchPlayback('tout-recommencer');
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.info.manifestUrl).toBe(payload.manifestUrl);
  });

  it('reports 404 as unavailable, not as an error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(404, { error: 'not_available' })));
    expect(await fetchPlayback('x')).toEqual({ status: 'unavailable' });
  });

  it('classifies 5xx, 403 and network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(503)));
    expect(await fetchPlayback('x')).toEqual({ status: 'error', reason: 'server' });
    vi.stubGlobal('fetch', vi.fn(() => respond(403, { error: 'forbidden' })));
    expect(await fetchPlayback('x')).toEqual({ status: 'error', reason: 'forbidden' });
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await fetchPlayback('x')).toEqual({ status: 'error', reason: 'network' });
  });

  it('rejects a response without a manifest', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(200, { status: 'ready' })));
    expect(await fetchPlayback('x')).toEqual({ status: 'error', reason: 'invalid' });
  });

  it('rethrows when the caller aborted', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));
    const pending = fetchPlayback('x', controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});

describe('isExpired', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  it('is true after expiry and inside the safety margin', () => {
    expect(isExpired({ expiresAt: '2026-10-13T11:59:00Z' }, now)).toBe(true);
    expect(isExpired({ expiresAt: '2026-10-13T12:00:10Z' }, now)).toBe(true);
  });
  it('is false while the link is valid or the date is unreadable', () => {
    expect(isExpired({ expiresAt: '2026-10-13T12:10:00Z' }, now)).toBe(false);
    expect(isExpired({ expiresAt: 'n/a' }, now)).toBe(false);
  });
});

describe('playbackProgramId', () => {
  it('uses the slug for features and slug-episode for series', () => {
    expect(playbackProgramId('tout-recommencer', 'feature')).toBe('tout-recommencer');
    expect(playbackProgramId('deux-fois-oui', 's1-e1')).toBe('deux-fois-oui-s1-e1');
  });
});
