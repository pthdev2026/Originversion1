import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

let instance: Lenis | null = null;

/** Jumps to an absolute page position, through Lenis when it runs so its own target stays in step. */
export function jumpTo(top: number) {
  if (instance) instance.scrollTo(top, { immediate: true, force: true });
  else window.scrollTo({ top, behavior: 'instant' });
}

/** Freezes or releases page scrolling (used while the page loader covers the screen). */
export function setScrollLocked(locked: boolean) {
  document.documentElement.classList.toggle('is-scroll-locked', locked);
  if (!instance) return;
  if (locked) instance.stop(); else instance.start();
}

/** Smoothly scrolls the page to an absolute position, through Lenis when it runs. */
export function scrollPageTo(top: number) {
  if (instance) instance.scrollTo(top, { duration: 1.1 });
  else window.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/**
 * Only dialogs (and anything marked data-lenis-prevent) keep native scrolling. Horizontal rails stay smooth for vertical
 * scrolling: Lenis ignores purely horizontal gestures (gestureOrientation 'vertical'), so swiping them still works natively,
 * while a vertical scroll that crosses them no longer drops out of the smooth scroll.
 */
const NATIVE_SCROLL = '[role="dialog"], [data-lenis-prevent]';

/**
 * Site-wide smooth scrolling (Lenis) driven by the GSAP ticker, so ScrollTrigger scenes
 * read exactly the same scroll position. Skipped for reduced motion.
 */
export function SmoothScroll() {
  useEffect(() => {
    // No restored scroll position: a page opens on its top unless the address targets an anchor.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    // A reload is a fresh start: drop any anchor left in the address (e.g. #createurs) and open on the hero.
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.type === 'reload' && window.location.hash) history.replaceState(history.state, '', window.location.pathname + window.location.search);
    if (!window.location.hash) window.scrollTo({ top: 0, behavior: 'instant' });
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({ duration: 1.1, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true, gestureOrientation: 'vertical', prevent: node => node instanceof Element && node.closest(NATIVE_SCROLL) !== null });
    instance = lenis;
    if (document.documentElement.classList.contains('is-scroll-locked')) lenis.stop();
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    // While a dialog (menu, search…) is open the page behind must not move: Radix marks the body with data-scroll-locked.
    const syncLock = () => { if (document.body.hasAttribute('data-scroll-locked')) lenis.stop(); else if (!document.documentElement.classList.contains('is-scroll-locked')) lenis.start(); };
    // Hover effects pause only while the wheel is actually turning (not during the whole easing tail), so a click
    // right after scrolling always goes through.
    let wheeling = 0;
    const onWheel = () => {
      document.documentElement.classList.add('is-wheeling');
      window.clearTimeout(wheeling);
      wheeling = window.setTimeout(() => document.documentElement.classList.remove('is-wheeling'), 140);
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    const watcher = new MutationObserver(syncLock);
    watcher.observe(document.body, { attributes: true, attributeFilter: ['data-scroll-locked'] });
    return () => { window.removeEventListener('wheel', onWheel); window.clearTimeout(wheeling); document.documentElement.classList.remove('is-wheeling'); watcher.disconnect(); gsap.ticker.remove(tick); lenis.destroy(); instance = null; };
  }, []);
  return null;
}
