import { Play } from 'lucide-react';
import type { ProductionEpisode, ProductionSeason } from '@/lib/productions';

const pad = (n: number) => String(n).padStart(2, '0');

export function SeasonSelector({ seasons, value, onChange }: { seasons: ProductionSeason[]; value: number; onChange: (n: number) => void }) {
  return (
    <div className="season-selector" role="tablist" aria-label="Saisons">
      {seasons.map(season => (
        <button key={season.number} type="button" role="tab" aria-selected={season.number === value} className={season.number === value ? 'is-active' : ''} onClick={() => onChange(season.number)}>
          Saison {season.number}<span>{season.episodes.length} ép.</span>
        </button>
      ))}
    </div>
  );
}

export function EpisodeCard({ episode, selected, onSelect, onWatch }: { episode: ProductionEpisode; selected: boolean; onSelect: () => void; onWatch: () => void }) {
  return (
    <article className={`episode-card ${selected ? 'is-selected' : ''}`}>
      <button type="button" className="episode-card-main" aria-pressed={selected} onClick={onSelect}>
        <span className="episode-card-image"><img src={episode.image} alt={episode.imageAlt} width={1536} height={1024} loading="lazy" /></span>
        <span className="episode-card-body">
          <span className="episode-card-top"><span className="episode-number">Épisode {pad(episode.number)}</span>{episode.duration && <span className="episode-duration">{episode.duration}</span>}</span>
          <span className="episode-title">{episode.title}</span>
          <span className="episode-synopsis">{episode.synopsis}</span>
        </span>
      </button>
      <button type="button" className="episode-play" aria-label={`Regarder l’épisode ${episode.number}, ${episode.title}`} onClick={onWatch}><Play fill="currentColor" aria-hidden="true" /></button>
    </article>
  );
}

export function EpisodeList({ season, selectedId, onSelect, onWatch }: { season: ProductionSeason; selectedId?: string; onSelect: (e: ProductionEpisode) => void; onWatch: (e: ProductionEpisode) => void }) {
  return (
    <div className="episode-list" key={season.number}>
      {season.episodes.map(e => <EpisodeCard key={e.id} episode={e} selected={e.id === selectedId} onSelect={() => onSelect(e)} onWatch={() => onWatch(e)} />)}
    </div>
  );
}

export function EpisodeDetails({ episode, seasonNumber, onWatch }: { episode: ProductionEpisode; seasonNumber: number; onWatch: () => void }) {
  return (
    <aside className="episode-details" aria-live="polite" key={episode.id}>
      <img src={episode.image} alt="" width={1536} height={1024} aria-hidden="true" />
      <div className="episode-details-body">
        <p className="episode-number">Saison {seasonNumber} · Épisode {pad(episode.number)}</p>
        <h3>{episode.title}</h3>
        <p>{episode.synopsis}</p>
        <div className="episode-details-foot">
          {episode.duration && <span className="episode-duration">{episode.duration}</span>}
          <button type="button" className="hud-primary" onClick={onWatch}><Play fill="currentColor" aria-hidden="true" />Regarder l’épisode {episode.number}</button>
        </div>
      </div>
    </aside>
  );
}
