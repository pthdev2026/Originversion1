import { Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type TouchEvent } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { OriginCreator } from '@/lib/origin-creators';
import { getCreatorUniverse } from '@/lib/creator-universes';
import { useImmersion } from './use-immersion';
import { RevealWords } from './reveal-words';

/** Horizontal trackpad distance (px) that moves to the next creator. */
const WHEEL_STEP = 60;

export function OriginCreators({ creators }: { creators: OriginCreator[] }) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const touchX = useRef<number | null>(null);
  const touchY = useRef<number>(0);
  const count = creators.length;
  const navigate = useNavigate();
  const go = useCallback((step: number) => setActive(i => (i + step + count) % count), [count]);
  useImmersion(section);
  // The pinned scroll scene walks through the creators: it announces the index through a `scene-index` event.
  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const onIndex = (event: Event) => setActive((event as CustomEvent<number>).detail);
    element.addEventListener('scene-index', onIndex);
    return () => element.removeEventListener('scene-index', onIndex);
  }, []);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  };
  const onTouchStart = (e: TouchEvent) => { touchX.current = e.touches[0]?.clientX ?? null; touchY.current = e.touches[0]?.clientY ?? 0; };
  const onTouchEnd = (e: TouchEvent) => {
    if (touchX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
    const dy = (e.changedTouches[0]?.clientY ?? touchY.current) - touchY.current;
    // A mostly vertical gesture is the page scrolling, not a swipe between creators.
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  };

  // Horizontal trackpad gestures move between creators without the arrows.
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    let accumulated = 0, locked = false, release = 0;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      if (locked) return;
      accumulated += event.deltaX;
      if (Math.abs(accumulated) < WHEEL_STEP) return;
      go(accumulated > 0 ? 1 : -1);
      accumulated = 0; locked = true;
      window.clearTimeout(release);
      release = window.setTimeout(() => { locked = false; }, 450);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => { element.removeEventListener('wheel', onWheel); window.clearTimeout(release); };
  }, [go]);

  const current = creators[active];

  // GSAP pins the section by moving it into a spacer; the wrapper keeps that move inside a node React owns.
  return <div className="creators-pin"><section ref={section} id="createurs" data-creator-count={count} className="creators im-section" aria-roledescription="carrousel" aria-labelledby="creators-title">
    <h2 id="creators-title" className="creators-title im-words"><RevealWords text="Découvrez vos créateurs préférés" breakAfter={1} /></h2>

    <div ref={stage} className="creators-stage" tabIndex={0} onKeyDown={onKey} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      aria-label="Créateurs ORIGIN, utilisez les flèches gauche et droite">
      {creators.map((creator, index) => {
        let offset = index - active;
        if (offset > count / 2) offset -= count;
        if (offset < -count / 2) offset += count;
        const isActive = offset === 0;
        const hidden = Math.abs(offset) > 1;
        const universe = getCreatorUniverse(creator.id);
        return <article key={creator.id}
          className={`creator-card im-neon ambience-${creator.ambience}${isActive ? ' is-active is-lit' : ''}`}
          style={{ '--offset': offset } as CSSProperties}
          aria-hidden={!isActive}
          aria-roledescription="diapositive"
          aria-label={`${index + 1} sur ${count} : ${creator.name}`}
          data-hidden={hidden || undefined}
          data-side={offset < 0 ? 'before' : offset > 0 ? 'after' : undefined}
          onClick={event => { if (!isActive) { setActive(index); return; } if (getCreatorUniverse(creator.id) && !(event.target as Element).closest('a, button')) void navigate({ to: '/createur/$slug', params: { slug: creator.id } }); }}>
          <img src={creator.image} alt={creator.imageAlt} style={{ objectPosition: creator.focus }} loading="lazy" />
          <div className="creator-veil" />
          {isActive ? <div className="creator-copy">
            <p className="creator-themes">{creator.themes.join(' · ')}</p>
            <h3 className="creator-name">{creator.name}</h3>
            {creator.showTitle && <p className="creator-show">{creator.showTitle}</p>}
            {universe && <p className="creator-intro">{universe.tagline}</p>}
            {universe && <p className="creator-count">{universe.contents.length} contenus dans son univers</p>}
            {universe
              ? <Link to="/createur/$slug" params={{ slug: creator.id }} className="im-cta creator-cta"><span className="im-cta-icon"><ArrowUpRight /></span>Découvrir son univers</Link>
              : <p className="creator-notice">Son univers arrive bientôt sur ORIGIN.</p>}
          </div> : <div className="creator-mini">
            <h3>{creator.name}</h3>
            <p>{creator.themes[0]}</p>
          </div>}
        </article>;
      })}
      <button type="button" className="im-round creators-arrow is-prev" onClick={() => go(-1)} aria-label="Créateur précédent"><ChevronLeft /></button>
      <button type="button" className="im-round creators-arrow is-next" onClick={() => go(1)} aria-label="Créateur suivant"><ChevronRight /></button>
    </div>

    <div className="creators-dots" role="tablist" aria-label="Choisir un créateur">
      {creators.map((creator, index) => <button key={creator.id} type="button" role="tab"
        aria-selected={index === active} aria-label={creator.name}
        className={index === active ? 'is-active' : ''} onClick={() => setActive(index)}><span /></button>)}
    </div>
    {/* Mobile only: a gallery wall — the chosen creator hangs in the central frame, the others in small frames around. */}
    {current && <div className="cg-wall" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="cg-frames">
        {creators.map((creator, index) => index === active ? null :
          <button key={creator.id} type="button" className={`cg-mini cg-pos-${(index - active + count) % count}`} onClick={() => setActive(index)} aria-label={`Voir ${creator.name}`}>
            <img src={creator.image} alt="" style={{ objectPosition: creator.focus }} loading="lazy" />
          </button>)}
        <figure key={current.id} className="cg-main">
          <img src={current.image} alt={current.imageAlt} style={{ objectPosition: current.focus }} loading="lazy" />
        </figure>
      </div>
      <div key={`copy-${current.id}`} className="cg-copy">
        <p className="creator-themes">{current.themes.join(' · ')}</p>
        <h3 className="cg-name">{current.name}</h3>
        {current.showTitle && <p className="creator-show">{current.showTitle}</p>}
        <p className="cg-intro">{getCreatorUniverse(current.id)?.tagline ?? current.intro}</p>
        {getCreatorUniverse(current.id)
          ? <Link to="/createur/$slug" params={{ slug: current.id }} className="im-cta creator-cta cg-cta"><span className="im-cta-icon"><ArrowUpRight /></span>Accéder à ce contenu</Link>
          : <p className="creator-notice">Son univers arrive bientôt sur ORIGIN.</p>}
      </div>
    </div>}
    <p className="sr-only" aria-live="polite">{current ? `${active + 1} sur ${count} : ${current.name}` : ''}</p>
  </section></div>;
}
