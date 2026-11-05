import { Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import type { SuggestedProgram } from '@/lib/origin-suggestions';
import { useImageTint } from '@/lib/adaptive';
import { reducedMotion, useImmersion } from './use-immersion';
import { RevealWords } from './reveal-words';

const AUTOPLAY_MS = 7000;
/** Horizontal distance (px) a swipe, drag or trackpad gesture needs before it changes the highlighted card. */
const GESTURE_THRESHOLD = 40;

const COMPACT_QUERY = '(max-width: 767px), (max-width: 1100px) and (orientation: portrait)';

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

const wrap = (index: number, count: number) => ((index % count) + count) % count;

export function OriginSuggestions({ programs }: { programs: SuggestedProgram[] }) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const count = programs.length;
  const [current, setCurrent] = useState(Math.min(2, Math.max(0, count - 1)));
  const [cycle, setCycle] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  const [drag, setDrag] = useState(0);
  const [step, setStep] = useState(0);
  const currentRef = useRef(current);
  currentRef.current = current;
  const suppressClick = useRef(false);
  useImmersion(section);
  const compact = useCompact();

  const navigate = useNavigate();
  const go = useCallback((index: number) => { setCurrent(wrap(index, count)); setCycle(value => value + 1); }, [count]);
  const commit = useCallback((offset: number) => {
    const steps = step ? Math.round(-offset / step) : 0;
    const move = steps || (Math.abs(offset) > GESTURE_THRESHOLD ? -Math.sign(offset) : 0);
    setDrag(0);
    if (move) go(currentRef.current + move);
  }, [go, step]);

  // Card spacing follows the rendered card width, so the layout stays fluid from phone to wide screens.
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      const card = element.querySelector<HTMLElement>('.reco-card');
      if (!card) return;
      // Écart entre cartes : proportion de la largeur d'une carte (--reco-step-k). Au-dessus de .9 on ajoute un petit jeu ; en dessous (téléphone) les voisines passent derrière la carte du centre.
      const k = parseFloat(getComputedStyle(element).getPropertyValue('--reco-step-k')) || 0.96;
      setStep(card.offsetWidth * k + (k >= 0.9 ? Math.min(56, element.clientWidth * 0.03) : 0));
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    return () => resize.disconnect();
  }, []);

  // Rotation pauses offscreen, on hover, while dragging and for reduced motion.
  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { threshold: 0.3 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const playing = visible && !hovered && drag === 0 && !compact && !reducedMotion();
  // Resuming restarts the progress gauge so it stays in step with the timer.
  useEffect(() => { if (playing) setCycle(value => value + 1); }, [playing]);
  useEffect(() => {
    if (!playing || count < 2) return;
    const timer = window.setTimeout(() => go(currentRef.current + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [playing, cycle, count, go]);

  // Trackpad and horizontal wheel scroll the carousel directly, without the arrows.
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    let accumulated = 0;
    let settle = 0;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      accumulated -= event.deltaX;
      setDrag(accumulated);
      window.clearTimeout(settle);
      settle = window.setTimeout(() => { commit(accumulated); accumulated = 0; }, 140);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => { element.removeEventListener('wheel', onWheel); window.clearTimeout(settle); };
  }, [commit]);

  // Pointer drag (mouse or touch) moves the cards with the finger, then settles on the nearest card.
  const pointer = useRef<{ id: number; x: number; moved: boolean } | null>(null);
  const onPointerDown = (event: ReactPointerEvent) => { pointer.current = { id: event.pointerId, x: event.clientX, moved: false }; };
  const onPointerMove = (event: ReactPointerEvent) => {
    const start = pointer.current;
    if (!start || start.id !== event.pointerId) return;
    const offset = event.clientX - start.x;
    if (!start.moved && Math.abs(offset) > 6) {
      start.moved = true;
      try { stage.current?.setPointerCapture(event.pointerId); } catch { /* pointer already released */ }
    }
    if (start.moved) setDrag(offset);
  };
  const onPointerEnd = (event: ReactPointerEvent) => {
    const start = pointer.current;
    pointer.current = null;
    if (!start?.moved) return;
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    commit(event.clientX - start.x);
  };

  if (!count) return null;
  return <section ref={section} id="recommandations" className={`origin-suggestions im-section${compact ? ' is-rows' : ''}`} aria-labelledby="suggestions-title">
    <div className="reco-glow" aria-hidden="true">{programs.map((program, index) => <img key={program.id} src={program.poster} alt="" className={index === current ? 'is-on' : ''} loading="lazy" />)}</div>
    <span className="im-spot" aria-hidden="true" />
    <h2 id="suggestions-title" className="reco-title im-words"><RevealWords text="Ce qui pourrait vous plaire" /></h2>
    <p className="reco-subtitle" data-reveal style={{ '--d': '.3s' } as CSSProperties}>Sélectionné d’après vos dernières histoires.</p>
    <p className="sr-only" role="status" aria-live="polite">{`${programs[current]?.title ?? ''}, ${current + 1} sur ${count}`}</p>

    {compact ? <div className="reco-rows" data-reveal style={{ '--d': '.45s' } as CSSProperties}>
      <div className="reco-halo" aria-hidden="true" />
      {[0, 1].map(lane => <div key={lane} className="reco-row" role="group" aria-label={`Suggestions, rangée ${lane + 1}`}>
        {programs.filter((_, index) => index % 2 === lane).map(program => <RecoTile key={program.id} program={program} />)}
      </div>)}
    </div> : <>
    <div className="reco-stage-wrap" data-reveal style={{ '--d': '.45s' } as CSSProperties}>
      <div ref={stage} className={`reco-stage ${drag ? 'is-dragging' : ''}`} role="group" aria-roledescription="carrousel" aria-label="Suggestions de programmes" tabIndex={0}
        onKeyDown={event => { if (event.key === 'ArrowLeft') { event.preventDefault(); go(current - 1); } if (event.key === 'ArrowRight') { event.preventDefault(); go(current + 1); } }}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
        onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); } }}>
        {programs.map((program, index) => {
          let offset = index - current;
          if (offset > count / 2) offset -= count;
          if (offset < -count / 2) offset += count;
          const distance = Math.abs(offset);
          const isCurrent = distance === 0;
          const style = {
            transform: `translateX(calc(-50% + ${offset * step + drag}px)) scale(${isCurrent ? 1 : 'var(--reco-side-scale, .88)'}) rotateY(calc(${offset} * var(--reco-tilt, -8deg)))`,
            zIndex: 10 - distance,
            opacity: distance > 1 ? 0 : 1,
            filter: isCurrent ? 'none' : 'var(--reco-side-filter, blur(4px) brightness(.24) saturate(.6))',
            pointerEvents: distance > 1 ? 'none' : 'auto',
          } as CSSProperties;
          return <article key={program.id} className={`reco-card ${isCurrent ? 'is-current' : ''}`} style={style} aria-hidden={!isCurrent} onClick={event => { if (!isCurrent) { go(index); return; } if (!(event.target as Element).closest('a, button')) void navigate({ to: '/production/$slug', params: { slug: program.id }, search: {} }); }}>
            <div className={`reco-frame im-tilt im-neon ${isCurrent ? 'is-lit' : ''}`} data-tilt="6">
              <div className="reco-clip"><img src={program.poster} alt={program.imageAlt} width={768} height={1152} loading="lazy" draggable={false} /><span className="reco-shade" /></div>
              <span className="im-glare" aria-hidden="true" />
              <div className="reco-copy">
                <h3 className="reco-card-title">{program.titleLines.map(line => <span key={line}>{line}</span>)}</h3>
                {program.tagline && <p className="reco-tagline">{program.tagline}</p>}
                <p className="reco-category">{program.category}</p>
                <div className="reco-actions">
                  <Link to="/production/$slug" params={{ slug: program.id }} search={{}} className="im-cta" tabIndex={isCurrent ? 0 : -1}><span className="im-cta-icon"><Play fill="currentColor" /></span>Voir maintenant</Link>
                  <span className="reco-duration">{program.duration}</span>
                </div>
              </div>
            </div>
          </article>;
        })}
      </div>
      <button type="button" className="im-round reco-side reco-prev" aria-label="Suggestion précédente" onClick={() => go(current - 1)}><ChevronLeft /></button>
      <button type="button" className="im-round reco-side reco-next" aria-label="Suggestion suivante" onClick={() => go(current + 1)}><ChevronRight /></button>
    </div>

    <div data-reveal style={{ '--d': '.6s' } as CSSProperties}><div className={`reco-dots ${playing ? '' : 'is-paused'}`} style={{ '--autoplay': `${AUTOPLAY_MS}ms` } as CSSProperties}>
      {programs.map((program, index) => <button key={program.id} type="button" aria-label={`Afficher ${program.title}`} aria-current={index === current} className={index === current ? 'is-on' : ''} onClick={() => go(index)}>
        <span>{index === current && <span key={cycle} className="reco-dot-fill" />}</span>
      </button>)}
    </div></div>
    </>}
  </section>;
}

/** Phone tile: poster washed by its own colour inside the card, with a miniature « Regarder » button. */
function RecoTile({ program }: { program: SuggestedProgram }) {
  const tint = useImageTint(program.poster, true);
  const style = tint ? { '--t1': tint.c1, '--t2': tint.c2, '--t3': tint.c3 } as CSSProperties : undefined;
  return <article className="reco-tile" style={style}>
    <img src={program.poster} alt={program.imageAlt} width={768} height={1152} loading="lazy" draggable={false} />
    <span className="reco-tile-halo" aria-hidden="true" />
    <span className="reco-tile-shade" aria-hidden="true" />
    <Link to="/production/$slug" params={{ slug: program.id }} search={{}} className="reco-tile-link" aria-label={`${program.title}, ${program.category}`} draggable={false} />
    <span className="reco-tile-copy">
      <span className="reco-tile-title">{program.titleLines.join(' ')}</span>
      <span className="reco-tile-meta">{program.category}</span>
      <Link to="/production/$slug" params={{ slug: program.id }} search={{}} className="reco-tile-play" aria-label={`Regarder ${program.title}`}><Play fill="currentColor" aria-hidden="true" />Regarder</Link>
    </span>
  </article>;
}
