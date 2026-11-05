import { Check, Circle, Play } from 'lucide-react';
import { episodeWatchState, type EpisodeWatchProgress } from '@/lib/episode-progress';

export function EpisodeWatchStatus({ progress, selected }: { progress?: EpisodeWatchProgress | undefined; selected: boolean }) {
  const { status, percent, remainingMinutes } = episodeWatchState(progress);
  const label = status === 'watched' ? 'Déjà vu' : status === 'in-progress' ? 'En cours' : 'À regarder';
  const Icon = status === 'watched' ? Check : status === 'in-progress' ? Play : Circle;
  return (
    <span className={`lp-watch-status is-${status}`}>
      <span className="lp-watch-meta"><span className="lp-watch-label"><Icon aria-hidden="true" />{label}</span>
        {selected && <span className="lp-selected-label">Sélectionné</span>}
        {status === 'in-progress' && <span className="lp-watch-remaining">{remainingMinutes} min restantes</span>}
      </span>
      {status !== 'unwatched' && <progress className="lp-watch-progress" max={100} value={percent} aria-label={`Progression de lecture : ${Math.round(percent)} %`} />}
    </span>
  );
}