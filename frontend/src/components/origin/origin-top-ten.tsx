import { Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Play, Plus } from 'lucide-react';
import { RankingAmbient, universeStyle } from './ranking-ambient';
import type { RankedProgram } from '@/lib/origin-top-ten';
import { useMySpace } from '@/features/account/session/demo-space';

/** Seconds on one card after which the viewer is asked whether to watch or see the trailer. */
const ASK_AFTER_S = 3;
const GAP = 14;
/** Minimum delay between two selections caused by the pointer, so a card opening under the cursor never makes the strip flicker. */
const HOVER_COOLDOWN = 380;
const pad = (value: number) => String(value).padStart(2, '0');

function TopTenCard({ program, index, active, asking, onPick, onHover, onOpen }: {
  program: RankedProgram; index: number; active: boolean; asking: boolean;
  onPick: (index: number) => void; onHover: (index: number) => void; onOpen: (program: RankedProgram) => void;
}) {
  const { user, space, update } = useMySpace();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  // The teaser starts once the card has settled open, not on every card crossed on the way.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!active) { setSettled(false); setPlaying(false); return; }
    const timer = window.setTimeout(() => setSettled(true), 700);
    return () => window.clearTimeout(timer);
  }, [active]);
  const inList = Boolean(space?.list.includes(program.id));
  const toggleList = () => {
    if (!user) { void navigate({ to: '/connexion' }); return; }
    update(current => ({ ...current, list: inList ? current.list.filter(id => id !== program.id) : [...current.list, program.id] }));
  };
  return <article className={`tt-card ${active ? 'is-active' : ''} ${active && asking ? 'is-asking' : ''}`} data-rank={program.rank}
    onPointerMove={(event: PointerEvent) => { if (event.pointerType === 'mouse') onHover(index); }}>
    {!failed && <img className="tt-im" src={program.poster} alt={program.imageAlt} width={384} height={640} loading="lazy" draggable={false} onError={() => setFailed(true)} />}
    {active && settled && program.previewVideo && <video key={program.id} className={`tt-video ${playing ? 'is-playing' : ''}`} src={program.previewVideo} muted loop playsInline autoPlay preload="metadata" aria-hidden="true" onPlaying={() => setPlaying(true)} />}
    <span className="tt-shade" aria-hidden="true" />
    <span className="tt-num" aria-hidden="true">{pad(program.rank)}</span>
    <button type="button" className="tt-hit" aria-label={`Numéro ${program.rank} : ${program.title}${active ? '. Ouvrir la page du programme' : ''}`} aria-current={active || undefined}
      onClick={() => (active ? onOpen(program) : onPick(index))}
      onFocus={(event: FocusEvent<HTMLButtonElement>) => { if (event.currentTarget.matches(':focus-visible')) onPick(index); }} />
    <span className="tt-small-title" aria-hidden="true">{program.title}</span>
    <div className="tt-cap" inert={!active || asking}>
      <span className="tt-cat">{program.category}</span>
      <h3 className="tt-title">{program.title}</h3>
      {program.tagline && <p className="tt-tagline">{program.tagline}</p>}
      <div className="tt-actions">
        <Link to="/production/$slug" params={{ slug: program.id }} search={{}} className="tt-cta"><span className="tt-cta-icon"><Play fill="currentColor" aria-hidden="true" /></span>Regarder</Link>
        <button type="button" className="tt-round" aria-pressed={inList} aria-label={inList ? `Retirer ${program.title} de ma liste` : `Ajouter ${program.title} à ma liste`} onClick={toggleList}>{inList ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}</button>
      </div>
    </div>
    <div className="tt-ask" inert={!(active && asking)}>
      <span className="tt-ask-blur" /><span className="tt-ask-tint" />
      <div className="tt-ask-in">
        <p className="tt-ask-kicker">VOUS HÉSITEZ ?</p>
        <p className="tt-ask-title">{program.title}</p>
        <Link to="/production/$slug" params={{ slug: program.id }} search={{}} className="tt-pill is-glass"><Play aria-hidden="true" />Voir la bande-annonce</Link>
        <Link to="/production/$slug" params={{ slug: program.id }} search={{}} className="tt-pill is-solid"><Play fill="currentColor" aria-hidden="true" />Regarder maintenant</Link>
      </div>
    </div>
  </article>;
}

export function OriginTopTen({ programs }: { programs: RankedProgram[] }) {
  const section = useRef<HTMLElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [asking, setAsking] = useState(false);
  const [inView, setInView] = useState(false);
  const [width, setWidth] = useState(1384);
  const [going, setGoing] = useState(false);
  const navigate = useNavigate();
  const count = programs.length;
  const swapped = useRef(0);
  const edgeAt = useRef(0);
  const lastX = useRef<number | null>(null);
  const wheelAt = useRef({ sum: 0, last: 0, done: 0 });
  // Set when the arrows (not the finger) change the lit card on a phone: the strip then has to scroll to it.
  const programmatic = useRef(false);
  const scrolledAt = useRef(0);

  const mobile = width < 720;
  // Sizes follow the width of the strip: the lit card is about twice a closed one, and the visible count adapts to the screen.
  const small = Math.max(168, Math.min(240, Math.round(width / 6)));
  const lit = Math.round(small * 2.2);
  const step = small + GAP;
  const visible = Math.max(1, Math.floor((width - lit) / step) + 1);
  const maxShift = Math.max(0, lit + (count - 1) * small + (count - 1) * GAP - width);
  const shift = mobile ? 0 : Math.min(offset * step, maxShift);

  useLayoutEffect(() => {
    const element = view.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth || 1384);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setOffset(current => Math.max(0, Math.min(Math.max(0, count - visible), current))); }, [count, visible]);

  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting && entry.intersectionRatio > .35)), { threshold: [0, .35, .6] });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Staying on a card for a few seconds while the section is on screen offers to watch or see the trailer.
  useEffect(() => {
    setAsking(false);
    if (!inView) return;
    const timer = window.setTimeout(() => setAsking(true), ASK_AFTER_S * 1000);
    return () => window.clearTimeout(timer);
  }, [index, inView]);

  const go = useCallback((target: number) => {
    const next = Math.max(0, Math.min(count - 1, target));
    setIndex(next);
    setOffset(current => {
      const wanted = next < current ? next : next > current + visible - 1 ? next - (visible - 1) : current;
      return Math.max(0, Math.min(Math.max(0, count - visible), wanted));
    });
  }, [count, visible]);

  const hover = useCallback((target: number) => {
    const now = performance.now();
    if (target === index || mobile || now - swapped.current < HOVER_COOLDOWN) return;
    swapped.current = now;
    go(target);
  }, [go, index, mobile]);

  // Moving the pointer toward an edge walks the strip in that direction; a horizontal swipe on a trackpad does the same, one title per gesture.
  const onViewMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || mobile) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const dx = event.clientX - (lastX.current ?? event.clientX);
    lastX.current = event.clientX;
    const now = performance.now();
    if (now - edgeAt.current < 700) return;
    const zone = Math.min(150, rect.width * .1);
    if (x < zone && dx < -1 && index > 0) { edgeAt.current = now; swapped.current = now; go(index - 1); }
    else if (x > rect.width - zone * .85 && dx > 1 && index < count - 1) { edgeAt.current = now; swapped.current = now; go(index + 1); }
  };
  useEffect(() => {
    const element = view.current;
    if (!element || mobile) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const state = wheelAt.current;
      const now = performance.now();
      if (now - state.last > 220) state.sum = 0;
      state.last = now;
      state.sum += event.deltaX;
      if (Math.abs(state.sum) < 50 || now - state.done < 420) return;
      state.done = now; swapped.current = now;
      go(index + (state.sum > 0 ? 1 : -1));
      state.sum = 0;
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [go, index, mobile]);

  // On phones the strip scrolls natively: the card nearest to the middle is the lit one.
  useEffect(() => {
    const element = view.current;
    if (!element || !mobile) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const cards = Array.from(element.querySelectorAll<HTMLElement>('.tt-card'));
        const middle = element.scrollLeft + element.clientWidth / 2;
        let best = 0; let distance = Infinity;
        cards.forEach((card, position) => { const gap = Math.abs(card.offsetLeft + card.offsetWidth / 2 - middle); if (gap < distance) { distance = gap; best = position; } });
        if (performance.now() - scrolledAt.current > 900) setIndex(best);
      });
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => { element.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [mobile]);

  useEffect(() => {
    const element = view.current;
    if (!element || !mobile || !programmatic.current) return;
    programmatic.current = false;
    const card = element.querySelectorAll<HTMLElement>('.tt-card')[index];
    if (!card) return;
    scrolledAt.current = performance.now();
    element.scrollTo({ left: card.offsetLeft - (element.clientWidth - card.offsetWidth) / 2, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [index, mobile]);
  const step1 = (direction: number) => { programmatic.current = true; go(index + direction); };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const target = Math.max(0, Math.min(count - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
    programmatic.current = true;
    go(target);
    requestAnimationFrame(() => view.current?.querySelectorAll<HTMLButtonElement>('.tt-hit')[target]?.focus({ preventScroll: true }));
  };

  const open = useCallback((program: RankedProgram) => void navigate({ to: '/production/$slug', params: { slug: program.id }, search: {} }), [navigate]);
  const openRanking = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    setGoing(true);
    window.setTimeout(() => void navigate({ to: '/classement' }), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 520);
  };

  if (!count) return null;
  const current = programs[index] ?? programs[0]!;
  const litCenter = (mobile ? 0 : index * step - shift) + lit / 2;
  const style = { ...universeStyle(current, litCenter + 56), ['--tt-small' as string]: `${small}px`, ['--tt-lit' as string]: `${lit}px` } as CSSProperties;

  return <section ref={section} id="top-10" className={`tt ${mobile ? 'is-mobile' : ''}`} style={style} aria-labelledby="top-ten-title">
    <RankingAmbient program={current} />
    <header className="tt-head">
      <div>
        <p className="tt-eyebrow">CETTE SEMAINE</p>
        <h2 id="top-ten-title" className="tt-heading">Top 10</h2>
      </div>
      <div className="tt-tools">
        <div className="tt-nav">
          <span className="tt-count" aria-live="polite">{pad(index + 1)} / {pad(count)}</span>
          <button type="button" className="tt-arrow" aria-label="Contenu précédent" disabled={index === 0} onClick={() => step1(-1)}><ChevronLeft aria-hidden="true" /></button>
          <button type="button" className="tt-arrow" aria-label="Contenu suivant" disabled={index === count - 1} onClick={() => step1(1)}><ChevronRight aria-hidden="true" /></button>
        </div>
        <Link to="/classement" className={`tt-more ${going ? 'is-go' : ''}`} onClick={openRanking}>Voir le classement complet<ArrowRight aria-hidden="true" /></Link>
      </div>
    </header>

    <div ref={view} className="tt-view" onPointerMove={onViewMove} onKeyDown={onKeyDown} role="group" aria-roledescription="carrousel" aria-label="Top 10 de la semaine">
      <div className="tt-track" style={{ transform: mobile ? undefined : `translate3d(${-shift}px, 0, 0)` }}>
        {programs.map((program, position) => <TopTenCard key={program.id} program={program} index={position} active={position === index} asking={asking} onPick={go} onHover={hover} onOpen={open} />)}
      </div>
    </div>

    <p className="tt-rank-label" aria-hidden="true">N° {index + 1} · {current.title}</p>
    <div className="tt-bar" aria-hidden="true"><i style={{ width: `${((index + 1) / count) * 100}%` }} /></div>
  </section>;
}
