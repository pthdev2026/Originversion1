import type { ProductionEpisode } from '@/lib/productions';

export interface EpisodeWatchProgress {
  positionSeconds: number;
  durationSeconds: number;
  completed?: boolean;
}

export function episodeWatchState(progress?: EpisodeWatchProgress) {
  const duration = progress && Number.isFinite(progress.durationSeconds) ? Math.max(0, progress.durationSeconds) : 0;
  const position = progress && Number.isFinite(progress.positionSeconds) ? Math.max(0, progress.positionSeconds) : 0;
  const completed = progress?.completed ?? (duration > 0 && position >= duration);
  const percent = completed ? 100 : duration > 0 ? Math.min(100, position / duration * 100) : 0;
  return {
    status: completed ? 'watched' as const : percent > 0 ? 'in-progress' as const : 'unwatched' as const,
    percent,
    remainingMinutes: Math.ceil(Math.max(0, duration - position) / 60),
  };
}

export function progressForEpisode(episode: ProductionEpisode, watchedOverride?: boolean): EpisodeWatchProgress | undefined {
  if (watchedOverride === undefined) return episode.watchProgress;
  return { positionSeconds: 0, durationSeconds: 0, completed: watchedOverride };
}