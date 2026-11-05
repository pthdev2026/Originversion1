import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Info, Play, Plus, X } from 'lucide-react';
import { useActiveSection } from '@/components/origin/origin-navigation';
import { Button } from '@/components/ui/button';
import { OriginNavigation } from './origin-navigation';
import { MilleniumMenu } from '@/components/menu/millenium-menu';
import { SearchOverlay } from './search-overlay';
import { scrollPageTo } from '@/components/smooth-scroll';
import type { OriginProgram } from '@/lib/origin-programs';
import { useRestoreFocus } from '@/lib/use-restore-focus';
import { BackdropImage } from '@/components/backdrop-image';
import { useImageTint } from '@/lib/adaptive';
import { factsLine, useProgramFacts } from '@/lib/program-facts';
import { paletteFor } from '@/lib/origin-top-ten';
import { useMySpace } from '@/features/account/session/demo-space';

/** Mise en page « application » : téléphone, et tablette tenue en portrait. Doit rester identique à la requête CSS du verre. */
const COMPACT_QUERY = '(max-width: 767px), (max-width: 1100px) and (orientation: portrait)';
const SWIPE_MIN = 56;

function useCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY);
    const update = () => setCompact(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return compact;
}

interface OriginHeroProps {
  programs: OriginProgram[];
  onWatch?: (program: OriginProgram) => void;
  onTrailer?: (program: OriginProgram) => void;
  onAccount?: () => void;
}

type Panel = 'menu' | 'search' | 'watch' | 'trailer' | null;

/** Les catégories « Bande-annonce » ne sont pas affichées comme genre. */
const genreOf = (category: string) => (category.trim().toLowerCase() === 'bande-annonce' ? '' : category);

export function OriginHero({ programs, onWatch, onTrailer, onAccount }: OriginHeroProps) {
  const [selected, setSelected] = useState(0);
  const [order, setOrder] = useState<number[]>(() => programs.map((_, index) => index).filter(index => index !== 0).concat(0));
  const [panel, setPanel] = useState<Panel>(null);
  const restoreFocus = useRestoreFocus(panel === 'watch' || panel === 'trailer');
  // Each programme change replays the vapour veil that dissolves over the incoming backdrop.
  const [vapour, setVapour] = useState(0);
  const go = useNavigate();
  const activeSection = useActiveSection();
  const [imageFailed, setImageFailed] = useState(false);
  // Téléphone : « Infos » ouvre le synopsis ; toucher la vidéo la passe en plein écran, sans aucun autre élément.
  const [info, setInfo] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const restoreInfoFocus = useRestoreFocus(info);
  const rail = useRef<HTMLDivElement>(null);
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const [reducedMotion, setReducedMotion] = useState(false);
  const active = programs[selected] ?? programs[0];
  const compact = useCompact();
  const hero = useRef<HTMLElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const { user, space, update, loading } = useMySpace();
  const inList = Boolean(active && space?.list.includes(active.id));
  const facts = useProgramFacts(active?.id, compact && info);
  // Verre adaptatif : la teinte vient de l'image du programme à l'écran ; en attendant (ou si l'image est illisible), la palette de son univers.
  const sampled = useImageTint(active?.heroImage, compact);
  const tint = sampled ?? (active ? (([c1, c2, c3]) => ({ c1, c2, c3 }))(paletteFor({ id: active.id })) : null);
  useEffect(() => { if (!compact) { setImmersive(false); setInfo(false); } }, [compact]);
  useEffect(() => {
    if (!immersive) return undefined;
    const video = active?.heroVideo ? videos.current.get(active.id) : undefined;
    if (video) { video.currentTime = 0; video.muted = false; void video.play().catch(() => undefined); }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setImmersive(false); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; if (video) video.muted = true; };
  }, [immersive, active]);
  useEffect(() => { setImageFailed(false); }, [active?.id]);
  // La teinte du film est aussi lue par la barre de navigation du bas (hors de la Hero) : on la pose sur la racine.
  useEffect(() => {
    if (!compact || !tint) return undefined;
    const root = document.documentElement.style;
    root.setProperty('--hg-c1', tint.c1); root.setProperty('--hg-c2', tint.c2); root.setProperty('--hg-c3', tint.c3);
    return () => { root.removeProperty('--hg-c1'); root.removeProperty('--hg-c2'); root.removeProperty('--hg-c3'); };
  }, [compact, tint?.c1, tint?.c2, tint?.c3]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  // The active clip plays silently on a loop; it stays paused for reduced motion,
  // while a dialog is open or when the tab is hidden.
  useEffect(() => {
    const video = active?.heroVideo ? videos.current.get(active.id) : undefined;
    if (!video) return;
    const play = () => { if (!reducedMotion && !panel && !document.hidden) void video.play().catch(() => undefined); };
    const pause = () => video.pause();
    const onVisibility = () => (document.hidden ? pause() : play());
    play();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { document.removeEventListener('visibilitychange', onVisibility); pause(); };
  }, [active, reducedMotion, panel]);

  function select(index: number) {
    // Choosing a programme brings the hero fully into view, so the video is seen.
    if (window.scrollY > 8) scrollPageTo(0);
    if (index !== selected) setVapour(value => value + 1);
    setSelected(index);
    setOrder(previous => [...previous.filter(item => item !== index), index]);
    // Scroll only the rail itself: scrollIntoView would also shift the hero sideways when the vapour overflows it.
    const track = rail.current;
    const card = track?.querySelectorAll<HTMLElement>('.program-card')[index];
    if (track && card) {
      const left = card.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft;
      const target = left < track.scrollLeft ? left : left + card.offsetWidth > track.scrollLeft + track.clientWidth ? left + card.offsetWidth - track.clientWidth : track.scrollLeft;
      track.scrollTo({ left: target, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }

  const wantedList = useRef<string | null>(null);
  const toggleList = () => {
    if (loading) { wantedList.current = active?.id ?? null; return; } // session pas encore connue : on retient le clic et on l'applique dès qu'elle l'est (jamais perdu, jamais de faux renvoi vers la connexion)
    if (!user) { void go({ to: '/connexion' }); return; }
    update(current => ({ ...current, list: inList ? current.list.filter(id => id !== active?.id) : [...current.list, active!.id] }));
  };
  useEffect(() => { if (!loading && wantedList.current !== null) { const wanted = wantedList.current; wantedList.current = null; if (wanted === active?.id) toggleList(); } }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps
  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    swipe.current = touch && !immersive && !(event.target as HTMLElement).closest('.program-rail') ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = swipe.current; swipe.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dy) < Math.abs(dx) * 0.6) select((selected + (dx < 0 ? 1 : -1) + programs.length) % programs.length);
  };

  if (!active) return <section className="empty-hero"><span className="origin-wordmark">MILLENIUM</span><p>Aucune histoire à l’affiche pour le moment.</p></section>;


  return (
    <section ref={hero} className={`origin-hero ${immersive ? 'is-immersive' : ''}`} aria-label="À l’affiche sur ORIGIN" onTouchStart={compact ? onTouchStart : undefined} onTouchEnd={compact ? onTouchEnd : undefined}
      style={compact && tint ? { ['--hg-c1' as string]: tint.c1, ['--hg-c2' as string]: tint.c2, ['--hg-c3' as string]: tint.c3 } : undefined}>
      <div className="hero-backdrops" aria-hidden="true" onClick={compact && active.heroVideo ? () => setImmersive(value => !value) : undefined}>
        {programs.map((program, index) => program.heroVideo
          ? <video key={program.id} ref={element => { if (!element) { videos.current.delete(program.id); return; } element.muted = true; videos.current.set(program.id, element); }} className={`hero-backdrop ${index === selected ? 'is-visible' : ''}`} style={{ zIndex: order.indexOf(index) + 1 }} src={program.heroVideo} poster={program.heroImage} muted loop playsInline preload="metadata" />
          : <BackdropImage key={program.id} src={program.heroImage} width={1920} height={1080} fetchPriority={index === 0 ? 'high' : 'auto'} style={{ zIndex: order.indexOf(index) + 1 }} className={`hero-backdrop ${index === selected ? 'is-visible' : ''}`} posterClassName={`hero-backdrop-poster ${index === selected ? 'is-visible' : ''}`} onError={() => { if (index === selected) setImageFailed(true); }} />)}
        {vapour > 0 && <div key={vapour} className="hero-vapour"><span /><span /></div>}
      </div>
      <div className="hero-shading" />
      <div className="hero-glass" aria-hidden="true" />
      <OriginNavigation onMenu={() => setPanel('menu')} onSearch={() => setPanel('search')} onAccount={onAccount} />

      <section className="hero-editorial" aria-live="polite" aria-atomic="true">
        <div className="program-title-zone">
          {active.titleLogo ? <h1><img src={active.titleLogo} alt={active.title} /></h1> : <h1 key={active.id} className={`program-title ${active.titleLines.length === 1 ? 'title-single' : 'title-standard'}`} style={{ ['--title-len' as string]: Math.max(6, (active.titleLines.at(-1) ?? '').length) }}>{active.titleLines.map((line, lineIndex) => <span key={line} className={active.titleLines.length > 1 && lineIndex === 0 ? 'title-lead' : 'title-accent'}>{line}</span>)}</h1>}
        </div>
        {genreOf(active.category) && <p key={`meta-${active.id}`} className="hero-meta">{genreOf(active.category)}</p>}
        <div key={active.id} className="hero-synopsis"><p>{active.tagline}</p><p>{active.synopsis}</p></div>
        {imageFailed && <p className="image-error">Le visuel est momentanément indisponible.</p>}
        <div className="hero-actions">
          <Button className="watch-button champagne-cta" onClick={() => onWatch ? onWatch(active) : void go({ to: '/production/$slug', params: { slug: active.id }, search: {} })}><Play fill="currentColor" />Regarder maintenant</Button>
          <Button variant="outline" className="trailer-button" onClick={() => onTrailer ? onTrailer(active) : active.trailerUrl ? window.location.assign(active.trailerUrl) : setPanel('trailer')}>{active.trailerUrl ? 'Voir la bande-annonce' : 'Aperçu'}</Button>
          {!compact && <Button variant="outline" className="trailer-button list-button" aria-pressed={inList} onClick={toggleList}>{inList ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}Ma liste</Button>}
        </div>
        {compact && <div className="hero-trio">
          <button type="button" className="hero-trio-side" aria-pressed={inList} onClick={toggleList}>{inList ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}<span>Ma liste</span></button>
          <Button className="watch-button champagne-cta hero-trio-play" onClick={() => onWatch ? onWatch(active) : void go({ to: '/production/$slug', params: { slug: active.id }, search: {} })}><Play fill="currentColor" aria-hidden="true" />Regarder</Button>
          <button type="button" className="hero-trio-side" aria-haspopup="dialog" onClick={() => setInfo(true)}><Info aria-hidden="true" /><span>Infos</span></button>
          {active.heroVideo && <button type="button" className="sr-only" onClick={() => setImmersive(true)}>Voir la bande-annonce en plein écran</button>}
        </div>}
      </section>

      <nav className="hero-nav" aria-label="Programmes à l’affiche" style={{ ['--hn-sel' as string]: selected }}>
        <span className="hero-nav-rail" aria-hidden="true"><i /></span>
        <ol>{programs.map((program, index) => <li key={program.id}>
          <button type="button" className={`hero-nav-item ${selected === index ? 'is-active' : ''}`} aria-label={`Afficher ${program.title}`} aria-current={selected === index ? 'true' : undefined} onClick={() => select(index)}>
            <span className="hero-nav-title">{program.title}</span>
            <span className="hero-nav-num">{String(index + 1).padStart(2, '0')}{selected === index && <svg key={program.id} className="hero-nav-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18.5" /></svg>}</span>
          </button>
        </li>)}</ol>
      </nav>

      <section className="program-selection" aria-label="Sélection de programmes">
        <div ref={rail} className="program-rail" onKeyDown={event => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            const next = (selected + (event.key === 'ArrowRight' ? 1 : -1) + programs.length) % programs.length;
            select(next);
            rail.current?.querySelectorAll<HTMLElement>('.program-card')[next]?.focus();
          }
        }}>
          {programs.map((program, index) => <Button key={program.id} variant="ghost" className={`program-card ${selected === index ? 'is-selected' : ''}`} aria-label={`Sélectionner ${program.title}`} aria-pressed={selected === index} onClick={() => select(index)}>
            <span className="thumbnail"><img src={program.heroImage} alt={program.imageAlt} width={480} height={270} loading="lazy" />{selected === index && <span className="thumbnail-play"><Play fill="currentColor" /></span>}</span>
            <span className="card-title">{program.title}</span><span className="card-category">{program.category}</span><span className="card-progress" />
          </Button>)}
        </div>
        <div className="rail-controls">
          <button type="button" className="im-round rail-step" aria-label="Programme précédent" title="Programme précédent" onClick={() => select((selected - 1 + programs.length) % programs.length)}><ChevronLeft /></button>
          <button type="button" className="im-round rail-step" aria-label="Programme suivant" title="Programme suivant" onClick={() => select((selected + 1) % programs.length)}><ChevronRight /></button>
        </div>
      </section>


      {compact && immersive && (
        <div className="hero-immersive" role="region" aria-label={`Bande-annonce — ${active.title}`}>
          <button type="button" className="hero-immersive-close" aria-label="Fermer la bande-annonce" onClick={() => setImmersive(false)}><X aria-hidden="true" /></button>
          <div className="hero-immersive-copy">
            <h2>{active.title}</h2>
            <p>{active.synopsis}</p>
            <Button className="watch-button champagne-cta hero-trio-play" data-autofocus onClick={() => onWatch ? onWatch(active) : void go({ to: '/production/$slug', params: { slug: active.id }, search: {} })}><Play fill="currentColor" aria-hidden="true" />Regarder maintenant</Button>
          </div>
        </div>
      )}
      <Dialog.Root open={compact && info} onOpenChange={setInfo}>
        <Dialog.Portal><Dialog.Overlay className="hero-info-overlay" /><Dialog.Content className="hero-info" onCloseAutoFocus={restoreInfoFocus}>
          <span className="hero-info-grip" aria-hidden="true" />
          {genreOf(active.category) && <span className="hero-info-kind">{genreOf(active.category)}</span>}
          <Dialog.Title className="hero-info-title">{active.title}</Dialog.Title>
          {factsLine(facts) && <p className="hero-info-meta">{factsLine(facts)}</p>}
          <Dialog.Description className="hero-info-text">{[active.tagline, active.synopsis].filter(Boolean).join(' ')}</Dialog.Description>
          <div className="hero-info-actions">
            <Button className="watch-button champagne-cta hero-trio-play" onClick={() => { setInfo(false); onWatch ? onWatch(active) : void go({ to: '/production/$slug', params: { slug: active.id }, search: {} }); }}><Play fill="currentColor" aria-hidden="true" />Regarder</Button>
            <button type="button" className="mx-btn is-ghost" onClick={() => { setInfo(false); void go({ to: '/production/$slug', params: { slug: active.id }, search: {} }); }}>Voir la fiche<ArrowUpRight aria-hidden="true" /></button>
          </div>
          <Dialog.Close className="hero-info-close" aria-label="Fermer"><X aria-hidden="true" /></Dialog.Close>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      <MilleniumMenu open={panel === 'menu'} onOpenChange={open => { if (!open) setPanel(null); }} activeSection={activeSection} onSearch={() => setPanel('search')} />
      <SearchOverlay open={panel === 'search'} onOpenChange={open => setPanel(open ? 'search' : null)} />
      <Dialog.Root open={panel === 'watch' || panel === 'trailer'} onOpenChange={open => { if (!open) setPanel(null); }}>
        <Dialog.Portal><Dialog.Overlay className="tv-overlay" /><Dialog.Content className="tv-dialog" onCloseAutoFocus={restoreFocus}>
          <div className="tv-still" aria-hidden="true"><img src={active.heroImage} alt="" /><span className="tv-still-play"><Play fill="currentColor" /></span></div>
          <div className="tv-body">
            <span className="tv-eyebrow">{[panel === 'trailer' ? 'Aperçu' : 'Lecture', active.category].filter((label, index, all) => all.findIndex(other => other.toLowerCase() === label.toLowerCase()) === index).join(' · ')}</span>
            <Dialog.Title className="tv-title">{active.title}</Dialog.Title>
            <Dialog.Description className="tv-text">{panel === 'trailer' ? 'Ce programme n’a pas encore de bande-annonce. Découvrez sa fiche en attendant.' : 'Ce programme n’est pas encore disponible à la lecture. Découvrez sa fiche en attendant.'}</Dialog.Description>
            <div className="tv-actions">
              <button type="button" className="mx-btn" onClick={() => { setPanel(null); void go({ to: '/production/$slug', params: { slug: active.id }, search: {} }); }}>Voir le programme<ArrowUpRight aria-hidden="true" /></button>
              <Dialog.Close className="mx-btn is-ghost">Fermer</Dialog.Close>
            </div>
          </div>
          <Dialog.Close className="tv-close" aria-label="Fermer"><X /></Dialog.Close>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}