import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Bouton principal d'une fiche : un compte connecté n'affiche pas un libellé provisoire pendant que la reprise est chargée. */
const user = { name: 'A', email: 'a@origin.test', savedCount: 0, inProgressCount: 0 };
let current: typeof user | null = user;
const api = vi.fn();
beforeEach(() => { vi.resetModules(); api.mockReset(); current = user; vi.doMock('@/lib/api', () => ({ api })); vi.doMock('@/features/account/session/session', () => ({ useSession: () => current })); });

describe('usePlayTargetStatus', () => {
  it('connecté : pending jusqu\'à la réponse, puis la cible du serveur', async () => {
    let resolve!: (value: unknown) => void;
    api.mockReturnValue(new Promise(r => { resolve = r; }));
    const { usePlayTargetStatus } = await import('@/lib/play-target');
    const { result } = renderHook(() => usePlayTargetStatus('les-passagers'));
    expect(result.current).toEqual({ target: null, pending: true });
    await act(async () => { resolve({ state: 'resume', playbackId: 'les-passagers', positionSeconds: 40 }); });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.target?.state).toBe('resume');
  });

  it('échec réseau : plus d\'attente, libellé local conservé', async () => {
    api.mockRejectedValue(new Error('réseau'));
    const { usePlayTargetStatus } = await import('@/lib/play-target');
    const { result } = renderHook(() => usePlayTargetStatus('les-passagers'));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.target).toBeNull();
  });

  it('visiteur : jamais en attente, aucun appel', async () => {
    current = null;
    const { usePlayTargetStatus } = await import('@/lib/play-target');
    const { result } = renderHook(() => usePlayTargetStatus('les-passagers'));
    expect(result.current).toEqual({ target: null, pending: false });
    expect(api).not.toHaveBeenCalled();
  });

  it('changer de programme : pending à nouveau (pas la cible de l\'ancien)', async () => {
    api.mockResolvedValueOnce({ state: 'resume', playbackId: 'a', positionSeconds: 5 }).mockReturnValueOnce(new Promise(() => {}));
    const { usePlayTargetStatus } = await import('@/lib/play-target');
    const { result, rerender } = renderHook(({ slug }) => usePlayTargetStatus(slug), { initialProps: { slug: 'a' } });
    await waitFor(() => expect(result.current.target?.state).toBe('resume'));
    rerender({ slug: 'b' });
    expect(result.current).toEqual({ target: null, pending: true });
  });
});
