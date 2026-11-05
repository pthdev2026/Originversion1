import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EpisodeWatchStatus } from '@/components/production/episode-watch-status';
import { episodeWatchState } from '@/lib/episode-progress';

describe('Episode viewing status', () => {
  it('never infers viewing progress from selection', () => {
    render(<EpisodeWatchStatus selected />);
    expect(screen.getByText('À regarder')).toBeTruthy();
    expect(screen.getByText('Sélectionné')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
  it('shows real progress and remaining time separately from selection', () => {
    render(<EpisodeWatchStatus selected progress={{ positionSeconds: 600, durationSeconds: 1800 }} />);
    expect(screen.getByText('En cours')).toBeTruthy();
    expect(screen.getByText('20 min restantes')).toBeTruthy();
    expect(Number(screen.getByRole('progressbar').getAttribute('value'))).toBeCloseTo(100 / 3);
  });
  it('distinguishes completion, missing duration and invalid positions', () => {
    expect(episodeWatchState({ positionSeconds: 1800, durationSeconds: 1800 }).status).toBe('watched');
    expect(episodeWatchState({ positionSeconds: 0, durationSeconds: 0, completed: true }).percent).toBe(100);
    expect(episodeWatchState({ positionSeconds: 60, durationSeconds: 0 }).status).toBe('unwatched');
    expect(episodeWatchState({ positionSeconds: NaN, durationSeconds: Infinity }).percent).toBe(0);
  });
});