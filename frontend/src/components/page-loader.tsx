import { useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { jumpTo, setScrollLocked } from '@/components/smooth-scroll';

/** Time the gauge takes to reach 100 %, then the curtain lifts. */
const FILL_MS = 750;
const LIFT_MS = 380;

/**
 * Branded curtain played when the site itself opens (first visit, reload): the MILLENIUM wordmark, a fine gauge and a
 * percentage counting to 100 %, then the curtain lifts. Moving between pages afterwards never replays it: it only brings the
 * new page back to its top.
 */
export function PageLoader() {
  const path = useRouterState({ select: state => state.location.pathname });
  const firstPath = useRef(path);
  const [run, setRun] = useState(0);
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState<'fill' | 'lift' | 'done'>('fill');

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setPhase('done'); return; }
    setRun(value => value + 1);
    // Nothing of the page may show or move behind the curtain: scrolling is frozen until it lifts.
    setScrollLocked(true);
    if (!window.location.hash) window.scrollTo({ top: 0, behavior: 'instant' });
    setPhase('fill');
    setPercent(0);
    const start = performance.now();
    let frame = 0;
    let lift = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / FILL_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setPercent(Math.round(eased * 100));
      if (t < 1) { frame = requestAnimationFrame(step); return; }
      setPhase('lift');
      setScrollLocked(false);
      lift = window.setTimeout(() => setPhase('done'), LIFT_MS);
    };
    frame = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(lift); setScrollLocked(false); };
  }, []);

  // Later page changes: no curtain, the new page simply opens at its top (or at its anchor, which the page aims at itself).
  useEffect(() => {
    if (path === firstPath.current) return;
    firstPath.current = path;
    if (!window.location.hash) jumpTo(0);
  }, [path]);

  if (phase === 'done') return null;
  return <div key={run} className={`page-loader ${phase === 'lift' ? 'is-lifting' : ''}`} role="status" aria-label={`Chargement ${percent} %`}>
    <span className="page-loader-mark">MILLENIUM</span>
    <span className="page-loader-gauge" aria-hidden="true"><i style={{ transform: `scaleX(${percent / 100})` }} /></span>
    <span className="page-loader-percent" aria-hidden="true">{String(percent).padStart(2, '0')}<small>%</small></span>
  </div>;
}
