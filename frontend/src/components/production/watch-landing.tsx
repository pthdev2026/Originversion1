import { Link, useRouter } from '@tanstack/react-router';
import { ArrowLeft, Check, Play, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Production, ProductionEpisode, ProductionSeason } from '@/lib/productions';
import { kindLabel, similarTo } from '@/lib/watch-catalog';
import { Button } from '@/components/ui/button';
import { EpisodeWatchStatus } from '@/components/production/episode-watch-status';
import { episodeWatchState, progressForEpisode } from '@/lib/episode-progress';

interface Props {
  production: Production;
  selected: ProductionEpisode | null;
  onSelect: (episode: ProductionEpisode) => void;
  onWatch: (episode: ProductionEpisode) => void;
  watchedOverrides: Record<string, boolean>;
  onToggleWatched: (episode: ProductionEpisode) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Universal landing: poster column + vertical entry list; films show one feature entry, series their seasons. */
export function WatchLanding({ production, selected, onSelect, onWatch, watchedOverrides, onToggleWatched }: Props) {
  const [inList, setInList] = useState(false);
  const router = useRouter();
  const back = () => (window.history.length > 1 ? router.history.back() : void router.navigate({ to: '/' }));
  const [activeSeason, setActiveSeason] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seasons = [...production.seasons].sort((a, b) => b.number - a.number);
  const isSeries = production.kind === 'serie';
  const selectedSeason = selected ? production.seasons.find(s => s.episodes.some(e => e.id === selected.id)) : undefined;
  const selectedState = episodeWatchState(selected ? progressForEpisode(selected, watchedOverrides[selected.id]) : undefined).status;

  useEffect(() => {
    const list = listRef.current;
    if (!list || !isSeries) return;
    const heads = Array.from(list.querySelectorAll<HTMLElement>('[data-season]'));
    const io = new IntersectionObserver(entries => {
      const hit = entries.find(e => e.isIntersecting);
      if (hit) setActiveSeason(Number((hit.target as HTMLElement).dataset['season']));
    }, { root: list, rootMargin: '0px 0px -70% 0px' });
    heads.forEach(h => io.observe(h));
    return () => io.disconnect();
  }, [isSeries, production.slug]);

  const jumpTo = (n: number) => listRef.current?.querySelector(`[data-season="${n}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const meta = [
    kindLabel[production.kind],
    production.meta.year && String(production.meta.year),
    isSeries ? (production.seasons.length ? `${production.seasons.length} saison${production.seasons.length > 1 ? 's' : ''}` : 'Épisodes à venir') : production.meta.averageDuration,
  ].filter(Boolean) as string[];

  return (
    <section className="lp" aria-labelledby="lp-title">
      <img className="lp-backdrop" src={production.heroImage} alt={production.heroAlt} />
      <div className="lp-shade" aria-hidden="true" />
      <span className="lp-mark" aria-hidden="true">MILLENIUM</span>
      <button type="button" className="lp-back" onClick={back}><ArrowLeft aria-hidden="true" />Retour</button>

      <div className="lp-info">
        <ul className="lp-meta">{meta.map(m => <li key={m}>{m}</li>)}</ul>
        <h1 id="lp-title" className="lp-title">{production.title}</h1>
        {isSeries && selected && selectedSeason && <p className="lp-position">S{pad(selectedSeason.number)} É{pad(selected.number)}</p>}
        <p className="lp-synopsis">{production.synopsis}</p>
        <div className="lp-actions">
          <button type="button" className="lp-primary crimson-cta" disabled={!selected} onClick={() => selected && onWatch(selected)}>
            <Play fill="currentColor" aria-hidden="true" />{selectedState === 'in-progress' ? 'Reprendre' : selectedState === 'watched' ? 'Revoir' : isSeries ? (selected ? `Regarder l’épisode ${selected.number}` : 'Bientôt disponible') : 'Regarder'}
          </button>
          <button type="button" className="lp-ghost glass-btn" aria-pressed={inList} onClick={() => setInList(v => !v)}>
            {inList ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}Ma liste
          </button>
        </div>
        {production.isDemo && <p className="lp-demo">Contenu de démonstration</p>}
      </div>

      <div className="lp-list" ref={listRef} aria-label={isSeries ? 'Saisons et épisodes' : 'Lecture'}>
        {!seasons.length && <div className="lp-empty"><span className="lp-empty-eyebrow">Épisodes</span><p>Les épisodes de ce programme seront bientôt annoncés.</p></div>}
        {seasons.map(season => <SeasonBlock key={season.number} season={season} isSeries={isSeries} showHead={isSeries && seasons.length > 1} selectedId={selected?.id} onSelect={onSelect} onWatch={onWatch} watchedOverrides={watchedOverrides} onToggleWatched={onToggleWatched} />)}
      </div>

      {isSeries && seasons.length > 1 && (
        <nav className="lp-seasons" aria-label="Aller à la saison">
          {seasons.map(s => <button key={s.number} type="button" className={(activeSeason ?? selectedSeason?.number) === s.number ? 'is-active' : ''} aria-label={`Saison ${s.number}`} onClick={() => jumpTo(s.number)}>{s.number}</button>)}
        </nav>
      )}
    </section>
  );
}

function SeasonBlock({ season, isSeries, showHead, selectedId, onSelect, onWatch, watchedOverrides, onToggleWatched }: { season: ProductionSeason; isSeries: boolean; showHead: boolean; selectedId: string | undefined; onSelect: (e: ProductionEpisode) => void; onWatch: (e: ProductionEpisode) => void; watchedOverrides: Record<string, boolean>; onToggleWatched: (e: ProductionEpisode) => void }) {
  return (
    <div className="lp-season" data-season={season.number}>
      {showHead && <h2 className="lp-season-head">Saison {season.number}</h2>}
      {season.episodes.map(e => {
        const active = e.id === selectedId;
        const progress = progressForEpisode(e, watchedOverrides[e.id]);
        const watched = episodeWatchState(progress).status === 'watched';
        return (
          <div key={e.id} className="lp-entry-wrap">
          <Button variant="ghost" type="button" className={`lp-entry ${active ? 'is-selected' : ''} ${watched ? 'is-watched' : ''}`} aria-current={active ? 'true' : undefined}
            onClick={() => (active ? onWatch(e) : onSelect(e))}>
            <span className="lp-thumb"><img src={e.image} alt="" loading="lazy" /><span className="lp-thumb-play" aria-hidden="true"><Play fill="currentColor" /></span></span>
            <span className="lp-entry-body">
              <span className="lp-entry-top"><strong>{isSeries ? `${e.number}. ${e.title}` : e.title}</strong>{e.duration && <em>{e.duration}</em>}</span>
              <span className="lp-entry-syn">{e.synopsis}</span>
              <EpisodeWatchStatus progress={progress} selected={active} />
            </span>
          </Button>
          {active && <Button variant="ghost" size="sm" className="lp-watch-toggle" aria-label={`${watched ? 'Marquer comme non vu' : 'Marquer comme vu'} : ${e.title}`} onClick={() => onToggleWatched(e)}><Check aria-hidden="true" />{watched ? 'Marquer comme non vu' : 'Marquer comme vu'}</Button>}
          </div>
        );
      })}
    </div>
  );
}

export function SimilarTitles({ production }: { production: Production }) {
  const items = similarTo(production);
  if (!items.length) return null;
  return (
    <section className="lp-similar" aria-labelledby="lp-similar-title">
      <h2 id="lp-similar-title">Vous pourriez aussi aimer</h2>
      <div className="lp-similar-rail" role="list">
        {items.map(item => (
          <Link key={item.id} role="listitem" to="/production/$slug" params={{ slug: item.id }} search={{}} className="lp-similar-card" aria-label={`${item.title}, ${item.category}`}>
            <img src={item.image} alt={item.imageAlt} loading="lazy" />
            <span className="lp-similar-label"><strong>{item.title}</strong><em>{kindLabel[item.kind]}</em></span>
          </Link>
        ))}
      </div>
      <p className="lp-demo">Sélection de démonstration — bientôt personnalisée selon votre profil</p>
    </section>
  );
}
