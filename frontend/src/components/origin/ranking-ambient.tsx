import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { paletteFor, type RankedProgram } from '@/lib/origin-top-ten';

interface Layer { id: string; poster: string; leaving: boolean }

/** CSS custom properties that carry the universe of a program; the section registers them as colours so they cross-fade. */
export function universeStyle(program: Pick<RankedProgram, 'id' | 'palette'>, glowX?: number): CSSProperties {
  const [main, shade, accent] = paletteFor(program);
  return { ['--tt-c1' as string]: main, ['--tt-c2' as string]: shade, ['--tt-c3' as string]: accent, ...(glowX === undefined ? {} : { ['--tt-bx' as string]: `${Math.round(glowX)}px` }) };
}

/**
 * Immersive backdrop of the ranking: the key visual of the lit program, blurred but still recognisable, with the colours of its
 * universe drifting in front as a slow mesh gradient. Only the visual that leaves and the one that arrives are painted;
 * the drift pauses while the section is off screen.
 */
export function RankingAmbient({ program }: { program: Pick<RankedProgram, 'id' | 'poster'> }) {
  const root = useRef<HTMLDivElement>(null);
  const [layers, setLayers] = useState<Layer[]>(() => [{ id: program.id, poster: program.poster, leaving: false }]);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setLayers(current => current[current.length - 1]?.id === program.id ? current
      : [...current.map(layer => ({ ...layer, leaving: true })), { id: program.id, poster: program.poster, leaving: false }].slice(-3));
    const timer = window.setTimeout(() => setLayers(current => current.filter(layer => !layer.leaving)), 1800);
    return () => window.clearTimeout(timer);
  }, [program.id, program.poster]);

  useEffect(() => {
    const element = root.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { rootMargin: '120px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={root} className={`tt-ambient ${visible ? '' : 'is-paused'}`} aria-hidden="true">
    <div className="tt-bgwrap">{layers.map(layer => <i key={layer.id} className={`tt-bgi ${layer.leaving ? 'is-leaving' : ''}`} style={{ backgroundImage: `url(${layer.poster})` }} />)}</div>
    <div className="tt-veil" />
    <div className="tt-mesh"><i className="tt-b1" /><i className="tt-b2" /><i className="tt-b3" /><i className="tt-b4" /></div>
    <div className="tt-vig" />
  </div>;
}
