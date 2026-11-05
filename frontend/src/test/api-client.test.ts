import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, onUnauthorized } from '@/lib/api';

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }));

afterEach(() => { vi.unstubAllGlobals(); });

describe('client API', () => {
  it('lit Retry-After sur un 429 et le dit à la personne', async () => {
    vi.stubGlobal('fetch', respond(429, { error: 'rate_limited', requestId: 'r-1' }, { 'Retry-After': '7' }));
    const error = await api('GET', '/api/search?q=ab').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isRateLimited).toBe(true);
    expect((error as ApiError).retryAfterSeconds).toBe(7);
    expect((error as ApiError).message).toContain('7 s');
    expect((error as ApiError).requestId).toBe('r-1');
  });

  it('un 401 signale une session expirée, sauf quand le mot de passe est simplement faux', async () => {
    const expired = vi.fn();
    const off = onUnauthorized(expired);
    vi.stubGlobal('fetch', respond(401, { error: 'unauthorized', message: 'Mot de passe incorrect.' }));
    await api('POST', '/api/me/delete', { password: 'x' }, { keepSession: true }).catch(() => undefined);
    expect(expired).not.toHaveBeenCalled();
    await api('GET', '/api/me/list').catch(() => undefined);
    expect(expired).toHaveBeenCalledTimes(1);
    off();
  });
});
