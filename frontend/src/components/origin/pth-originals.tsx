import { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronDown, ChevronLeft, ChevronRight, Clock3, Mic, Monitor, Pause, Play, X } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import type { PthEpisode } from '@/lib/pth-originals';
import { useRestoreFocus } from '@/lib/use-restore-focus';
import { useCompact } from '@/lib/use-compact';

export function PthOriginals({ episodes }: { episodes: PthEpisode[] }) {
  const compact = useCompact();
  return compact ? <PthOriginalsPhone episodes={episodes} /> : <PthOriginalsDesktop episodes={episodes} />;
}

const SHOW_SLUG = 'les-secrets-du-ministere';
const seasonOf = (episode: PthEpisode) => episode.season ?? 2;

/** Phone layout: one calm card, the picture first; a frosted sheet holds the title, the play button, the season and the episodes. */
function PthOriginalsPhone({ episodes }: { episodes: PthEpisode[] }) {
  const seasons = useMemo(() => [...new Set(episodes.map(seasonOf))].sort((a, b) => b - a), [episodes]);
  const [season, setSeason] = useState(seasons[0] ?? 2);
  const [menu, setMenu] = useState(false);
  const list = episodes.filter(episode => seasonOf(episode) === season);
  const latest = list[0];
  const cover = episodes[0];
  if (!latest || !cover) return null;
  const watch = (episode: PthEpisode) => ({ to: '/production/$slug' as const, params: { slug: SHOW_SLUG }, search: { episode: `s${season}-e${episode.number}` } });
  return <section id="originals" className="ph-originals" aria-labelledby="pth-originals-title">
    <article className="ph-card">
      <img className="ph-cover" src={cover.image} alt={cover.imageAlt} width={1536} height={1024} loading="lazy" />
      <h2 id="pth-originals-title" className="ph-brand"><span>PTH</span> ORIGINALS</h2>
      <div className="ph-sheet">
        <h3 className="ph-title">LES SECRETS <strong>DU MINISTÈRE</strong></h3>
        <Link {...watch(latest)} className="ph-watch"><span className="ph-watch-icon"><Play fill="currentColor" aria-hidden="true" /></span>Regarder maintenant</Link>
        <div className="ph-season" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(false); }}>
          <button type="button" className="ph-season-button" aria-haspopup={seasons.length > 1 ? 'listbox' : undefined} aria-expanded={seasons.length > 1 ? menu : undefined} onClick={() => seasons.length > 1 && setMenu(open => !open)}>
            Saison {season}{seasons.length > 1 && <ChevronDown aria-hidden="true" />}
          </button>
          {menu && <ul className="ph-season-menu" role="listbox" aria-label="Saisons">{seasons.map(value => <li key={value}><button type="button" role="option" aria-selected={value === season} onClick={() => { setSeason(value); setMenu(false); }}>Saison {value}</button></li>)}</ul>}
        </div>
        <p className="ph-list-label">Liste des épisodes</p>
        <div className="ph-episodes" role="list">
          {list.map(episode => <Link key={episode.id} {...watch(episode)} role="listitem" className="ph-episode" aria-label={`Épisode ${episode.number}, ${episode.title}`}>
            <span className="ph-episode-image"><img src={episode.image} alt={episode.imageAlt} width={1536} height={1024} loading="lazy" /><span className="ph-episode-play" aria-hidden="true"><Play fill="currentColor" /></span></span>
            <span className="ph-episode-number">Épisode {episode.number}</span>
            <span className="ph-episode-name">{episode.title}</span>
          </Link>)}
        </div>
      </div>
    </article>
  </section>;
}

function PthOriginalsDesktop({ episodes }: { episodes: PthEpisode[] }) {
  const section = useRef<HTMLElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [order, setOrder] = useState(() => episodes.map((_, index) => index));
  const [paused, setPaused] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [watching, setWatching] = useState(false);
  const restoreFocus = useRestoreFocus(watching);
  const [announcement, setAnnouncement] = useState('');
  const episode = episodes[active];

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener('change', update);
    const element = section.current;
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { threshold: .35 });
    if (element) observer.observe(element);
    return () => { observer.disconnect(); media.removeEventListener('change', update); };
  }, []);

  useEffect(() => {
    if (paused || engaged || !visible || reducedMotion || watching || episodes.length < 2) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const next = (active + 1) % episodes.length;
      setActive(next); setOrder(previous => [...previous.filter(index => index !== next), next]);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [active, paused, engaged, visible, reducedMotion, watching, episodes.length]);

  function select(index: number, focus = false) {
    const next = (index + episodes.length) % episodes.length;
    const selected = episodes[next];
    if (!selected) return;
    setActive(next); setOrder(previous => [...previous.filter(item => item !== next), next]);
    setAnnouncement(`Épisode ${selected.number}, ${selected.title}, ${next + 1} sur ${episodes.length}`);
    const card = rail.current?.querySelectorAll<HTMLButtonElement>('.pth-episode')[next];
    card?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'nearest', inline: 'nearest' });
    if (focus) card?.focus({ preventScroll: true });
  }

  if (!episode) return null;
  return <section ref={section} id="originals" className="pth-originals" aria-labelledby="pth-originals-title" aria-roledescription="carrousel" onMouseEnter={() => setEngaged(true)} onMouseLeave={() => setEngaged(false)} onFocusCapture={event => { if (!(event.target as HTMLElement).closest('[data-rotation-control]')) setPaused(true); }}>
    <div className="pth-backdrops" aria-hidden="true">{episodes.map((item, index) => <img key={item.id} className={`pth-backdrop ${index === active ? 'is-visible' : ''}`} style={{ zIndex: order.indexOf(index) + 1 }} src={item.image} alt="" width={1536} height={1024} loading="lazy" />)}<div className="pth-shading" /></div>
    <header className="pth-brand"><h2 id="pth-originals-title"><span className="pth-wordmark">PTH</span><span className="pth-originals-label">ORIGINALS</span></h2><span className="pth-season">NOUVELLE SAISON</span></header>
    <div className="pth-editorial">
      <h3>LES SECRETS<br />DU <span>MINISTÈRE</span></h3>
      <p className="pth-synopsis">Des conversations vraies, des parcours qui inspirent<br className="pth-desktop-break" /> et des clés pour comprendre les défis d’aujourd’hui.</p>
      <ul className="pth-metadata"><li><Mic aria-hidden="true" />Podcast</li><li><Monitor aria-hidden="true" />Émission</li><li>Épisode {episode.number}</li>{episode.duration && <li><Clock3 aria-hidden="true" />{episode.duration}</li>}</ul>
      <Button asChild variant="secondary" className="pth-watch"><Link to="/production/$slug" params={{ slug: 'les-secrets-du-ministere' }} search={{ episode: `s2-e${episode.number}` }}><Play fill="currentColor" aria-hidden="true" />Découvrir l’épisode {episode.number}</Link></Button>
    </div>
    <p className="pth-presenter">PRÉSENTÉ PAR <strong>CHANTAL</strong></p>
    <div className="pth-episodes-area">
      <div className="pth-episodes-heading"><span>LES ÉPISODES</span><div className="pth-controls"><Button variant="ghost" size="icon" className="pth-control" aria-label="Épisode précédent" title="Épisode précédent" onClick={() => select(active - 1)}><ChevronLeft /></Button><Button variant="ghost" size="icon" className="pth-control" aria-label="Épisode suivant" title="Épisode suivant" onClick={() => select(active + 1)}><ChevronRight /></Button></div></div>
      <div className="pth-episodes-rail" ref={rail} onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const current = Array.from(rail.current?.querySelectorAll('.pth-episode') ?? []).indexOf(event.target as Element); if (current >= 0) select(current + (event.key === 'ArrowRight' ? 1 : -1), true); } }}>
        {episodes.map((item, index) => <Button key={item.id} variant="ghost" className={`pth-episode ${active === index ? 'is-active' : ''}`} aria-label={`Épisode ${item.number}, ${item.title}, ${index + 1} sur ${episodes.length}`} aria-pressed={active === index} onClick={() => select(index)}><span className="pth-episode-image"><img src={item.image} alt={item.imageAlt} width={1536} height={1024} loading="lazy" /><span className="pth-episode-play"><Play fill="currentColor" /></span></span><span className="pth-episode-number">Épisode {item.number}</span><span className="pth-episode-name">{item.title}</span></Button>)}
      </div>
      <div className="pth-slider-footer"><span className="pth-position">0{active + 1} <span>/ 0{episodes.length}</span></span><div className="pth-dots">{episodes.map((item, index) => <Button key={item.id} variant="ghost" className={`pth-dot ${index === active ? 'is-active' : ''}`} aria-label={`Afficher l’épisode ${item.number}`} aria-pressed={index === active} onClick={() => select(index)} />)}</div><Button variant="ghost" size="icon" className="pth-control" data-rotation-control aria-label={paused || reducedMotion ? 'Activer le défilement automatique' : 'Mettre le défilement en pause'} title={paused || reducedMotion ? 'Activer le défilement automatique' : 'Mettre en pause'} onClick={() => { setReducedMotion(false); setPaused(previous => !reducedMotion && !previous); }}>{paused || reducedMotion ? <Play /> : <Pause />}</Button></div>
    </div>
    <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    <Dialog.Root open={watching} onOpenChange={setWatching}><Dialog.Portal><Dialog.Overlay className="origin-dialog-overlay" /><Dialog.Content className="origin-dialog" onCloseAutoFocus={restoreFocus}><Dialog.Title className="dialog-title">Les secrets du ministère — Épisode {episode.number}</Dialog.Title><Dialog.Description className="dialog-description">{episode.title}. Cet épisode n’est pas encore disponible à la lecture.</Dialog.Description><Dialog.Close asChild><Button variant="ghost" size="icon" className="dialog-close" aria-label="Fermer"><X /></Button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}