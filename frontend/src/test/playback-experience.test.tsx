import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaybackExperience } from '@/components/production/playback-experience';
import type { ProductionEpisode, ProductionSeason } from '@/lib/productions';

const episode: ProductionEpisode = { id: 'feature', number: 1, title: 'Tout recommencer', synopsis: '', image: '/x.jpg', imageAlt: '', isDemo: true };
const season: ProductionSeason = { number: 1, episodes: [episode] };
const manifest = { programId: 'tout-recommencer', status: 'ready', manifestUrl: 'http://api/m.m3u8', posterUrl: '', durationSeconds: 15, renditions: [], expiresAt: '2099-01-01T00:00:00Z' };
const reply = (status: number, body?: unknown) => vi.fn(() => Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status })));

const mount = () => render(<PlaybackExperience slug="tout-recommencer" title="Tout recommencer" season={season} episode={episode} onClose={() => {}} onPick={() => {}} />);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PlaybackExperience states', () => {
  it('says the program is not available yet on 404, without a retry button', async () => {
    vi.stubGlobal('fetch', reply(404, { error: 'not_available' }));
    mount();
    expect(await screen.findByText(/pas encore disponible/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });

  it('shows a retry button when the service is down, and the first action gets focus', async () => {
    vi.stubGlobal('fetch', reply(503));
    mount();
    expect(await screen.findByText(/momentanément indisponible/i)).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Réessayer' });
    await waitFor(() => expect(retry).toHaveFocus());
  });

  it('offers to open the player when the media is ready', async () => {
    vi.stubGlobal('fetch', reply(200, manifest));
    mount();
    const open = await screen.findByRole('button', { name: /Ouvrir le lecteur/ });
    await waitFor(() => expect(open).toHaveFocus());
  });
});
