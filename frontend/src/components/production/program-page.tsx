import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Clapperboard, Play, Plus, Share2 } from 'lucide-react';
import { RankingAmbient, universeStyle } from '@/components/origin/ranking-ambient';
import { scrollPageTo } from '@/components/smooth-scroll';
import { episodeWatchState, progressForEpisode } from '@/lib/episode-progress';
import { playTargetLabel, usePlayTargetStatus } from '@/lib/play-target';
import { useMySpace } from '@/features/account/session/demo-space';
import type { Production, ProductionEpisode } from '@/lib/productions';
import { kindLabel, type WatchSuggestion } from '@/lib/watch-catalog';
import { BackdropImage } from '@/components/backdrop-image';

interface Props {
  production: Production;
  /** « Vous pourriez aussi aimer » (serveur), fiches légères pour l'aperçu et rangs du Top 10. */
  similar: WatchSuggestion[];
  previews: Record<string, Production>;
  ranks: Record<string, number>;
  selected: ProductionEpisode | null;
  onSelect: (episode: ProductionEpisode) => void;
  onWatch: (episode: ProductionEpisode) => void;
  watchedOverrides: Record<string, boolean>;
  onToggleWatched: (episode: ProductionEpisode) => void;
  /** Hides the page behind the playback curtain. */
  launching: boolean;
  /** Plus utilisé : le choix audio/sous-titres vient maintenant du lecteur (pistes réelles de /playback). */
  onLanguage?: (line: string) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function scrollToId(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  scrollPageTo(id === 'pp-top' ? 0 : element.getBoundingClientRect().top + window.scrollY - 12);
}

/**
 * Page of a film, a series or a documentary: a full-bleed first screen with one primary action, then the episodes, the audio and subtitle
 * choices, and similar titles, all on the same blurred, coloured backdrop as the Top 10.
 */
export function ProgramPage({ production, similar: similarItems, previews, ranks, selected, onSelect, onWatch, watchedOverrides, onToggleWatched, launching, onLanguage }: Props) {
  const router = useRouter();
  const navigate = useNavigate();
  const { user, space, update, loading } = useMySpace();
  const hero = useRef<HTMLElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const isSeries = production.kind === 'serie';
  const seasons = useMemo(() => [...production.seasons].sort((a, b) => a.number - b.number), [production.seasons]);
  const episodes = useMemo(() => seasons.flatMap(season => season.episodes), [seasons]);
  const hasEpisodes = isSeries && episodes.length > 0;
  const [picked, setPicked] = useState(false);
  const [seasonNumber, setSeasonNumber] = useState<number | null>(null);
  const [hot, setHot] = useState(-1);
  const [active, setActive] = useState('pp-top');
  const [shared, setShared] = useState(false);
  const [railEdge, setRailEdge] = useState({ start: true, end: false });
  // Aperçu d'un autre film depuis la rangée du haut : le fond, le titre, le texte et les actions deviennent ceux de ce film.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const recoRail = useRef<HTMLDivElement>(null);

  const similar = similarItems;
  const recoItems = useMemo(() => similar.slice(0, 8), [similar]);
  useEffect(() => { setPreviewId(null); }, [production.slug]);
  const previewItem = previewId ? recoItems.find(item => item.id === previewId) : undefined;
  const preview = previewItem ? previews[previewItem.id] : undefined;
  const shown: Production = preview ?? production;
  const previewing = shown !== production;
  const rank = ranks[shown.slug];
  const selectedSeason = selected ? seasons.find(season => season.episodes.some(e => e.id === selected.id)) : undefined;
  const shownSeason = seasonNumber ?? selectedSeason?.number ?? seasons[0]?.number ?? 1;
  const progress = selected ? progressForEpisode(selected, watchedOverrides[selected.id]) : undefined;
  const state = episodeWatchState(progress);
  const inList = Boolean(space?.list.includes(shown.slug));
  // Bouton principal : le serveur dit s'il faut commencer, reprendre, passer à la suite ou revoir (et quel épisode).
  const { target, pending: targetPending } = usePlayTargetStatus(production.slug, launching);
  const targetEpisode = useMemo(() => {
    const wanted = target?.episode;
    if (!wanted) return undefined;
    return seasons.find(season => season.number === wanted.seasonNumber)?.episodes.find(item => item.number === wanted.number);
  }, [target, seasons]);
  const targetApplied = useRef<string | null>(null);
  // Tant que le lecteur n'a rien choisi lui-même, la fiche s'ouvre sur l'épisode visé par le serveur.
  useEffect(() => {
    if (picked || !targetEpisode || targetApplied.current === production.slug) return;
    targetApplied.current = production.slug;
    onSelect(targetEpisode);
  }, [picked, targetEpisode, production.slug, onSelect]);

  const back = () => (window.history.length > 1 ? router.history.back() : void navigate({ to: '/' }));
  const wantedList = useRef<string | null>(null);
  const toggleList = () => {
    if (loading) { wantedList.current = shown.slug; return; } // clic retenu jusqu'à ce que la session soit connue
    if (!user) { void navigate({ to: '/connexion' }); return; }
    update(current => ({ ...current, list: inList ? current.list.filter(id => id !== shown.slug) : [...current.list, shown.slug] }));
  };
  useEffect(() => { if (!loading && wantedList.current !== null) { const wanted = wantedList.current; wantedList.current = null; if (wanted === shown.slug) toggleList(); } }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps
  const share = async () => {
    const data = { title: shown.title, url: previewing ? `${window.location.origin}/production/${shown.slug}` : window.location.href };
    try {
      if (navigator.share) await navigator.share(data); else await navigator.clipboard.writeText(data.url);
      setShared(true);
      window.setTimeout(() => setShared(false), 2200);
    } catch { /* sharing cancelled */ }
  };
  const watchPreview = () => { if (previewing) void navigate({ to: '/production/$slug', params: { slug: shown.slug }, search: { play: '1' } }); };
  // Rangée du haut : un clic sélectionne, un second clic sur le film déjà affiché ouvre sa fiche ; flèches du clavier pour naviguer.
  const pickReco = (id: string) => {
    if (id === production.slug) { setPreviewId(null); return; }
    if (previewId === id) { void navigate({ to: '/production/$slug', params: { slug: id }, search: {} }); return; }
    setPreviewId(id);
  };
  const onRecoKey = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const ids = [production.slug, ...recoItems.map(item => item.id)];
    const at = Math.max(0, ids.indexOf(previewId ?? production.slug));
    const next = ids[Math.max(0, Math.min(ids.length - 1, at + (event.key === 'ArrowRight' ? 1 : -1)))];
    if (!next || next === ids[at]) return;
    event.preventDefault();
    setPreviewId(next === production.slug ? null : next);
    window.requestAnimationFrame(() => recoRail.current?.querySelectorAll<HTMLButtonElement>('.pp-reco-tile')[ids.indexOf(next)]?.focus());
  };
  const choose = (episode: ProductionEpisode) => { setPicked(true); onSelect(episode); scrollPageTo(0); };

  // Subtle depth under a mouse: CSS variables only, never React state, so the page stays smooth.
  useEffect(() => {
    const element = hero.current;
    if (!element || reduced() || !window.matchMedia('(pointer: fine)').matches) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        element.style.setProperty('--px', String(Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - .5) * 2)).toFixed(2)));
        element.style.setProperty('--py', String(Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - .5) * 2)).toFixed(2)));
      });
    };
    element.addEventListener('pointermove', onMove);
    return () => { element.removeEventListener('pointermove', onMove); cancelAnimationFrame(frame); };
  }, []);

  // Chapters: which section is on screen.
  const chapters = useMemo(() => [
    { id: 'pp-top', label: 'Aperçu' },
    ...(isSeries ? [{ id: 'pp-episodes', label: 'Épisodes' }] : []),
    { id: 'pp-details', label: 'Détails' },
    ...(similar.length ? [{ id: 'pp-similar', label: 'Similaires' }] : []),
  ], [isSeries, similar.length]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: '-35% 0px -45% 0px', threshold: [0, .2, .5] });
    chapters.forEach(chapter => { const element = document.getElementById(chapter.id); if (element) observer.observe(element); });
    return () => observer.disconnect();
  }, [chapters]);

  // The similar rail: arrows and edge state.
  const measureRail = useCallback(() => {
    const element = rail.current;
    if (!element) return;
    setRailEdge({ start: element.scrollLeft < 8, end: element.scrollLeft > element.scrollWidth - element.clientWidth - 8 });
  }, []);
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    measureRail();
    element.addEventListener('scroll', measureRail, { passive: true });
    const observer = new ResizeObserver(measureRail);
    observer.observe(element);
    return () => { element.removeEventListener('scroll', measureRail); observer.disconnect(); };
  }, [measureRail, similar.length]);
  const moveRail = (direction: number) => rail.current?.scrollBy({ left: direction * rail.current.clientWidth * .8, behavior: reduced() ? 'auto' : 'smooth' });

  const hotItem = previewItem ?? (hot >= 0 ? similar[hot] : undefined);
  const ambientProgram = hotItem
    ? { id: hotItem.id, poster: hotItem.image }
    : { id: `${production.slug}:${picked && selected ? selected.id : 'main'}`, poster: picked && selected ? selected.image : production.heroImage };
  const pageStyle = universeStyle({ id: hotItem?.id ?? production.slug }, 240) as CSSProperties;
  const layers = hasEpisodes ? episodes : [];
  const meta = [kindLabel[shown.kind], shown.meta.year && String(shown.meta.year), rank ? `N° ${rank} cette semaine` : shown.label].filter(Boolean) as string[];
  const runtime = shown.meta.averageDuration ?? shown.seasons[0]?.episodes[0]?.duration ?? (shown.kind === 'serie' && shown.seasons.length ? `${shown.seasons.length} saison${shown.seasons.length > 1 ? 's' : ''}` : undefined);
  const facts: [string, string][] = [
    ['Catégorie', production.label || kindLabel[production.kind]],
    ...(production.meta.year ? [['Année', String(production.meta.year)] as [string, string]] : []),
    ...(production.meta.genres.length ? [['Genres', production.meta.genres.join(', ')] as [string, string]] : []),
    ...(production.meta.language ? [['Langue', production.meta.language] as [string, string]] : []),
    ...(production.meta.averageDuration ? [['Durée moyenne', production.meta.averageDuration] as [string, string]] : []),
    ...(production.meta.rating ? [['Classification', production.meta.rating] as [string, string]] : []),
    ['Statut', production.isDemo ? 'Contenu de démonstration' : 'Disponible'],
  ];
  const serverLabel = !previewing && selected && (!picked || targetEpisode?.id === selected.id) ? playTargetLabel(target, isSeries) : null;
  // Compte connecté dont la reprise n'est pas encore connue : pas de libellé provisoire (« Regarder » qui devient « Reprendre »).
  const resolving = (loading || targetPending) && !previewing && Boolean(selected);
  const playLabel = !selected ? 'Bientôt disponible'
    : resolving ? 'Chargement…'
    : serverLabel ? serverLabel
    : state.status === 'in-progress' ? (isSeries ? `Reprendre l’épisode ${selected.number}` : 'Reprendre')
    : state.status === 'watched' ? 'Revoir'
    : isSeries ? `Regarder l’épisode ${selected.number}` : 'Regarder';
  const lead = previewing ? shown.synopsis : picked && selected && hasEpisodes ? selected.synopsis : production.synopsis;
  const longTitle = shown.title.length > 12;

  return <main className={`pp tt-page ${launching ? 'is-launching' : ''} ${active === 'pp-top' ? '' : 'pp-away'}`} style={pageStyle}>
    <RankingAmbient program={ambientProgram} />
    <div className="pp-inner">
      <section ref={hero} id="pp-top" className={`pp-hero${isSeries ? ' is-series' : ''}`} aria-labelledby="pp-title">
        <div className="pp-art" aria-hidden="true">
          <BackdropImage className="pp-art-base" posterClassName="pp-art-poster" src={production.heroImage} />
          {layers.map(episode => <BackdropImage key={episode.id} className={`pp-art-ep ${picked && selected?.id === episode.id ? 'is-on' : ''}`} posterClassName={`pp-art-poster pp-art-poster-ep ${picked && selected?.id === episode.id ? 'is-on' : ''}`} src={episode.image} loading="lazy" />)}
          {recoItems.map(item => <BackdropImage key={`pv-${item.id}`} className={`pp-art-ep ${previewId === item.id ? 'is-on' : ''}`} posterClassName={`pp-art-poster pp-art-poster-ep ${previewId === item.id ? 'is-on' : ''}`} src={item.image} loading="lazy" />)}
          <span className="pp-sheen" />
        </div>
        <div className="pp-shade" aria-hidden="true" />
        <div className="pp-light" aria-hidden="true"><span className="pp-breath" /><span className="pp-spot" /><span className="pp-ray" style={{ ['--a' as string]: '20deg', right: '6%' } as CSSProperties} /><span className="pp-ray" style={{ ['--a' as string]: '27deg', right: '24%', animationDelay: '-3s', width: 'clamp(90px,10vw,160px)' } as CSSProperties} /><span className="pp-ray" style={{ ['--a' as string]: '34deg', right: '42%', animationDelay: '-6s' } as CSSProperties} /><span className="pp-flare" /></div>
        <button type="button" className="pp-back" aria-label="Retour" onClick={back}><ArrowLeft aria-hidden="true" /></button>
        <nav className="pp-chapters" aria-label="Chapitres de la page">
          {chapters.map(chapter => <button key={chapter.id} type="button" className={active === chapter.id ? 'is-on' : ''} aria-label={chapter.label} aria-current={active === chapter.id || undefined} onClick={() => scrollToId(chapter.id)}><span>{chapter.label}</span></button>)}
        </nav>

        <div className="pp-block" key={shown.slug}>
          <ul className="pp-meta">{meta.map(item => <li key={item}>{item}</li>)}</ul>
          {shown.titleLogo
            ? <h1 id="pp-title" className="pp-logo"><img src={shown.titleLogo} alt={shown.title} /></h1>
            : <h1 id="pp-title" className={`pp-title ${longTitle ? 'is-long' : ''}`}>{shown.title}</h1>}
          {!previewing && hasEpisodes && selected && selectedSeason && <p className="pp-position">Saison {selectedSeason.number} · Épisode {selected.number} — {selected.title}</p>}
          <p className="pp-synopsis">{lead}</p>

          <div className="pp-actions-row">
          <div className="pp-dock" role="group" aria-label="Actions">
            <button type="button" className={`pp-play ${resolving ? 'is-resolving' : ''}`} disabled={!previewing && !selected} aria-busy={resolving || undefined} onClick={() => (previewing ? watchPreview() : selected && onWatch(selected))}>
              {resolving ? <span className="pp-spin" aria-hidden="true" /> : <Play fill="currentColor" aria-hidden="true" />}
              <span className={resolving ? 'pp-play-label' : undefined}>{previewing ? 'Regarder' : playLabel}</span>
              {!previewing && state.status === 'in-progress' && <span className="pp-play-bar" aria-hidden="true"><i style={{ width: `${state.percent}%` }} /></span>}
            </button>
            <span className="pp-sep" aria-hidden="true" />
            {shown.trailerUrl && <a className="pp-ic" href={shown.trailerUrl} target="_blank" rel="noreferrer" aria-label="Bande-annonce"><Clapperboard aria-hidden="true" /><span className="pp-tip">Bande-annonce</span></a>}
            <button type="button" className={`pp-ic ${inList ? 'is-on' : ''}`} aria-pressed={inList} aria-busy={loading || undefined} style={loading ? { opacity: 0.55 } : undefined} aria-label={loading ? 'Ma liste : chargement' : inList ? 'Retirer de ma liste' : 'Ajouter à ma liste'} onClick={toggleList}>{inList ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}<span className="pp-tip">{inList ? 'Retirer de ma liste' : 'Ajouter à ma liste'}</span></button>
            <button type="button" className="pp-ic" aria-label="Partager" onClick={() => void share()}><Share2 aria-hidden="true" /><span className="pp-tip">{shared ? 'Lien copié' : 'Partager'}</span></button>
          </div>
          {runtime && <span className="pp-runtime">{runtime}</span>}
          </div>
        </div>

        {!isSeries && recoItems.length > 0 && <div className="pp-reco" role="group" aria-label="Autres films à découvrir" onKeyDown={onRecoKey}>
          <p className="sr-only" role="status" aria-live="polite">{previewing ? `Aperçu : ${shown.title}` : ''}</p>
          <div ref={recoRail} className="pp-reco-rail">
            {[{ id: production.slug, title: production.title, image: production.heroImage, kind: production.kind }, ...recoItems].map(tile => {
              const current = tile.id === production.slug;
              const on = (previewId ?? production.slug) === tile.id;
              return <button key={tile.id} type="button" className={`pp-reco-tile ${on ? 'is-on' : ''}`} aria-pressed={on} tabIndex={on ? 0 : -1}
                aria-label={`${tile.title}${current ? ', film de cette page' : on ? ', appuyez à nouveau pour ouvrir sa fiche' : ''}`} onClick={() => pickReco(tile.id)}>
                <img src={tile.image} alt="" loading="lazy" />
                <span className="pp-reco-badge" aria-hidden="true">{kindLabel[tile.kind]}</span>
                <span className="pp-reco-name">{tile.title}</span>
              </button>;
            })}
          </div>
        </div>}
        <button type="button" className="pp-cue" aria-label="Faire défiler" onClick={() => scrollToId(chapters[1]?.id ?? 'pp-details')}><i aria-hidden="true" />DÉFILER</button>
      </section>

      {isSeries && <section id="pp-episodes" className="pp-section" aria-labelledby="pp-episodes-title">
        <header className="pp-head"><div><p className="pp-kicker">{hasEpisodes ? `${episodes.length} épisode${episodes.length > 1 ? 's' : ''}` : 'Épisodes'}</p><h2 id="pp-episodes-title" className="pp-h2">Épisodes</h2></div>
          {seasons.length > 1 && <div className="pp-seasons" role="group" aria-label="Saisons">{seasons.map(season => <button key={season.number} type="button" aria-pressed={shownSeason === season.number} onClick={() => setSeasonNumber(season.number)}>Saison {season.number}</button>)}</div>}
        </header>
        {!hasEpisodes && <p className="pp-empty">Les épisodes de ce programme seront bientôt annoncés.</p>}
        {hasEpisodes && <div className="pp-eps">
          {(seasons.find(season => season.number === shownSeason) ?? seasons[0])?.episodes.map(episode => {
            const on = selected?.id === episode.id;
            const episodeProgress = progressForEpisode(episode, watchedOverrides[episode.id]);
            const status = episodeWatchState(episodeProgress);
            return <div key={episode.id} className={`pp-ep ${on ? 'is-on' : ''} ${status.status === 'watched' ? 'is-watched' : ''} ${episode.playable === false ? 'is-soon' : ''}`}>
              <button type="button" className="pp-ep-hit" aria-current={on || undefined} aria-label={`Épisode ${episode.number} : ${episode.title}${on ? ', sélectionné' : ''}`} onClick={() => (on ? onWatch(episode) : choose(episode))} />
              <img src={episode.image} alt="" loading="lazy" />
              <span className="pp-ep-shade" aria-hidden="true" />
              <span className="pp-ep-no" aria-hidden="true">{pad(episode.number)}</span>
              <span className="pp-ep-cap">
                <strong>{episode.title}</strong>
                <small>{status.status === 'watched' ? 'Déjà vu' : status.status === 'in-progress' ? `${status.remainingMinutes} min restantes` : (episode.duration ?? 'À regarder')}</small>
                <em>{episode.synopsis}</em>
              </span>
              {status.status === 'in-progress' && <span className="pp-ep-bar" aria-hidden="true"><i style={{ width: `${status.percent}%` }} /></span>}
              {on && <button type="button" className="pp-ep-toggle" onClick={() => onToggleWatched(episode)}><Check aria-hidden="true" />{status.status === 'watched' ? 'Marquer comme non vu' : 'Marquer comme vu'}</button>}
            </div>;
          })}
        </div>}
      </section>}

      <section id="pp-details" className="pp-section" aria-labelledby="pp-details-title">
        <header className="pp-head"><div><p className="pp-kicker">SYNOPSIS ET INFORMATIONS</p><h2 id="pp-details-title" className="pp-h2">À propos</h2></div></header>
        <div className="pp-details">
          <div className="pp-about">
            <p className="pp-lead">{production.synopsis}</p>
            <dl className="pp-facts">{facts.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
          </div>
        </div>
      </section>

      {similar.length > 0 && <section id="pp-similar" className="pp-section" aria-labelledby="pp-similar-title" onPointerLeave={() => setHot(-1)}>
        <header className="pp-head"><div><p className="pp-kicker">SÉLECTION POUR VOUS</p><h2 id="pp-similar-title" className="pp-h2">Vous pourriez aussi aimer</h2></div>
          <div className="pp-arrows"><button type="button" aria-label="Précédents" disabled={railEdge.start} onClick={() => moveRail(-1)}><ChevronLeft aria-hidden="true" /></button><button type="button" aria-label="Suivants" disabled={railEdge.end} onClick={() => moveRail(1)}><ChevronRight aria-hidden="true" /></button></div>
        </header>
        <div ref={rail} className="pp-rail" role="list">
          {similar.map((item, index) => <Link key={item.id} role="listitem" to="/production/$slug" params={{ slug: item.id }} search={{}} className={`pp-sim ${hot === index ? 'is-hot' : ''}`} aria-label={`${item.title}, ${item.category}`}
            onPointerEnter={event => { if (event.pointerType === 'mouse') setHot(index); }} onFocus={() => setHot(index)} onBlur={() => setHot(-1)}>
            <img src={item.image} alt={item.imageAlt} loading="lazy" />
            <span className="pp-sim-shade" aria-hidden="true" />
            <span className="pp-sim-no" aria-hidden="true">{pad(index + 1)}</span>
            <span className="pp-sim-cap"><em>{kindLabel[item.kind]}</em><strong>{item.title}</strong><span className="pp-sim-play" aria-hidden="true"><i><Play fill="currentColor" /></i>Regarder</span></span>
          </Link>)}
        </div>
        <p className="pp-note">Sélection de démonstration — bientôt personnalisée selon votre profil</p>
      </section>}
    </div>
  </main>;
}
