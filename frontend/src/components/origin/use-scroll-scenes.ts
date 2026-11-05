import { useEffect, type RefObject } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { jumpTo } from '@/components/smooth-scroll';

/**
 * Scroll-driven scenes for the homepage, limited to the sections meant to be watched:
 * the hero leaves with depth, the Top 10 cards arrive,
 * PTH Originals and the testimonials reveal themselves, catalog rows arrive softly.
 * Everything is skipped for reduced motion, and torn down with the page.
 */
/** Fade-and-rise entrance with explicit end values, handing back to CSS once done (CSS opacity transitions stay intact). */
function rise(targets: gsap.TweenTarget, from: gsap.TweenVars, vars: gsap.TweenVars) {
  return gsap.fromTo(targets, { ...from, opacity: 0 }, { x: 0, y: 0, opacity: 1, clearProps: 'opacity,transform', ...vars });
}

export function useScrollScenes(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const scope = root.current;
    if (!scope) return;
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    const mm = gsap.matchMedia(scope);

    mm.add({ desktop: '(min-width: 1024px)', motion: '(prefers-reduced-motion: no-preference)' }, context => {
      const { motion } = context.conditions as { desktop: boolean; motion: boolean };
      if (!motion) return;

      // Hero: the backdrop sinks and slows while the editorial block lifts away.
      const hero = scope.querySelector<HTMLElement>('.origin-hero');
      if (hero) {
        const leave = { trigger: hero, start: 'top top', end: 'bottom top', scrub: true };
        gsap.to(hero.querySelector('.hero-backdrops'), { scale: 1.12, yPercent: 12, ease: 'none', scrollTrigger: leave });
        gsap.to(hero.querySelector('.hero-editorial'), { yPercent: -35, opacity: 0, ease: 'none', scrollTrigger: { ...leave, end: '60% top' } });
      }

      // Top 10: the heading and the cards arrive softly (the strip itself is driven by the pointer, not by the scroll).
      const top = scope.querySelector<HTMLElement>('.tt');
      if (top) {
        rise(top.querySelectorAll('.tt-head > *'), { y: 30 }, { duration: .9, ease: 'power3.out', stagger: .1, scrollTrigger: { trigger: top, start: 'top 80%', once: true } });
        rise(top.querySelectorAll('.tt-card'), { y: 60 }, { duration: 1, ease: 'power3.out', stagger: .07, scrollTrigger: { trigger: top, start: 'top 72%', once: true } });
      }

      // Creators: the stage fades up as it rises into view, then the controls settle.
      const creators = scope.querySelector<HTMLElement>('.creators');
      const stageEl = creators?.querySelector<HTMLElement>('.creators-stage');
      if (creators && stageEl) {
        // Opacity only: an animated clip-path (or a moving stage) repainted the whole stage on every frame.
        gsap.fromTo(stageEl, { opacity: .35 }, { opacity: 1, ease: 'none',
          scrollTrigger: { trigger: creators, start: 'top 85%', end: 'top top', scrub: true } });
        gsap.fromTo(creators.querySelectorAll('.creators-arrow, .creators-dots'), { opacity: 0 }, { opacity: 1, duration: .9, ease: 'power3.out', stagger: .08, clearProps: 'opacity', scrollTrigger: { trigger: creators, start: 'top 40%', once: true } });
        // Then the section holds the screen and the scroll walks through the creators, one per step.
        const count = Number(creators.dataset['creatorCount'] ?? 0);
        if (count > 1) {
          let last = -1;
          ScrollTrigger.create({ trigger: creators, start: 'top top', end: () => `+=${count * window.innerHeight * .45}`, pin: true, anticipatePin: 1,
            onUpdate: self => {
              const index = Math.min(count - 1, Math.floor(self.progress * count));
              if (index !== last) { last = index; creators.dispatchEvent(new CustomEvent('scene-index', { detail: index })); }
            } });
        }
      }

      // PTH Originals: slow parallax on the set, editorial lines rise in sequence.
      const pth = scope.querySelector<HTMLElement>('.pth-originals');
      if (pth) {
        gsap.fromTo(pth.querySelector('.pth-backdrops'), { yPercent: -6, scale: 1.08 }, { yPercent: 6, scale: 1, ease: 'none', scrollTrigger: { trigger: pth, start: 'top bottom', end: 'bottom top', scrub: true } });
        rise(pth.querySelectorAll('.pth-brand, .pth-editorial > *, .pth-presenter'), { y: 40 }, { duration: 1, ease: 'power3.out', stagger: .08, scrollTrigger: { trigger: pth, start: 'top 70%', once: true } });
        rise(pth.querySelectorAll('.pth-episode'), { x: 60 }, { duration: 1, ease: 'power3.out', stagger: .08, scrollTrigger: { trigger: pth, start: 'top 60%', once: true } });
      }

      // Testimonials: the panorama opens panel by panel, the signature settles.
      const universes = scope.querySelector<HTMLElement>('.origin-universes');
      if (universes) {
        gsap.from(universes.querySelectorAll('.universe-panel'), { clipPath: 'inset(100% 0 0 0)', duration: 1.3, ease: 'expo.out', stagger: .1, scrollTrigger: { trigger: universes, start: 'top 75%', once: true } });
        gsap.fromTo(universes.querySelector('.universes-wordmark'), { letterSpacing: '.4em', opacity: 0 }, { letterSpacing: '0em', opacity: 1, ease: 'none', scrollTrigger: { trigger: universes.querySelector('.universes-editorial') ?? universes, start: 'top 90%', end: 'top 45%', scrub: true } });
        rise(universes.querySelectorAll('.universes-heading, .universes-invitation, .universes-explore'), { y: 30 }, { duration: .9, ease: 'power3.out', stagger: .1, scrollTrigger: { trigger: universes.querySelector('.universes-editorial') ?? universes, start: 'top 75%', once: true } });
      }

      // Catalog rows: a soft, single entrance.
      scope.querySelectorAll<HTMLElement>('.origin-catalog').forEach(row => {
        rise(row.querySelectorAll('.catalog-header, .catalog-slide'), { y: 40 }, { duration: .9, ease: 'power3.out', stagger: .06, scrollTrigger: { trigger: row, start: 'top 85%', once: true } });
      });

      // Story hand-off: each section brightens as it arrives and dims slightly as it leaves,
      // so the page reads as a sequence of scenes. Opacity only, to keep sticky and blur effects intact.
      scope.querySelectorAll<HTMLElement>(':scope > section').forEach(scene => {
        gsap.fromTo(scene, { opacity: .3 }, { opacity: 1, ease: 'none', immediateRender: false, scrollTrigger: { trigger: scene, start: 'top 98%', end: 'top 50%', scrub: .6 } });
        gsap.fromTo(scene, { opacity: 1 }, { opacity: .45, ease: 'none', immediateRender: false, scrollTrigger: { trigger: scene, start: 'bottom 45%', end: 'bottom 2%', scrub: .6 } });
      });

      // Footer: the wordmark comes up last.
      const footer = scope.querySelector('.origin-footer');
      if (footer) rise(footer.querySelectorAll('.of-top, .of-columns, .of-bottom'), { y: 30 }, { duration: 1, ease: 'power3.out', stagger: .12, scrollTrigger: { trigger: footer, start: 'top 90%', once: true } });

    });

    // Arriving with an anchor (e.g. « Retour aux créateurs » → /#createurs): the pinned Top 10 adds scroll space
    // after the browser already jumped, so re-aim at the anchor once the scenes are measured.
    // Aim only once the page curtain has lifted: while it freezes scrolling, ScrollTrigger's own measuring resets the page.
    const locked = () => document.documentElement.classList.contains('is-scroll-locked');
    const settleHash = () => {
      if (locked()) return;
      const target = window.location.hash ? document.getElementById(decodeURIComponent(window.location.hash.slice(1))) : null;
      if (target) jumpTo(target.getBoundingClientRect().top + window.scrollY);
    };
    let wasLocked = locked();
    const unlockWatch = new MutationObserver(() => {
      const now = locked();
      if (wasLocked && !now && aiming) { ScrollTrigger.refresh(); settleHash(); }
      wasLocked = now;
    });
    unlockWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    // Every re-measure during the first seconds (lazy images, pin spacer) re-aims at the anchor; any user scroll stops it.
    let aiming = Boolean(window.location.hash);
    const stopAiming = () => {
      if (!aiming) return;
      aiming = false;
      // Once arrived, the anchor leaves the address so that a later reload opens on the hero.
      if (window.location.hash) history.replaceState(history.state, '', window.location.pathname + window.location.search);
    };
    const onRefresh = () => { if (aiming) settleHash(); };
    ScrollTrigger.addEventListener('refresh', onRefresh);
    window.addEventListener('wheel', stopAiming, { passive: true, once: true });
    window.addEventListener('touchstart', stopAiming, { passive: true, once: true });
    window.addEventListener('keydown', stopAiming, { once: true });
    const hashTimers = [60, 400, 900, 1600, 2400, 3200].map(delay => window.setTimeout(() => { if (aiming && !locked()) { ScrollTrigger.refresh(); settleHash(); } }, delay));
    hashTimers.push(window.setTimeout(stopAiming, 4000));

    // Lazy images change section heights. Re-measuring pins in the middle of a scroll makes the page jump right where a
    // pinned scene ends, so a real height change is only applied once scrolling has been idle for a moment.
    let frame = 0;
    let idle = 0;
    let measured = scope.offsetHeight;
    let lastScroll = performance.now();
    const onScroll = () => { lastScroll = performance.now(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    const refreshWhenIdle = () => {
      window.clearTimeout(idle);
      const wait = Math.max(0, 350 - (performance.now() - lastScroll));
      idle = window.setTimeout(() => {
        if (performance.now() - lastScroll < 350) { refreshWhenIdle(); return; }
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => { measured = scope.offsetHeight; ScrollTrigger.refresh(); });
      }, wait);
    };
    const observer = new ResizeObserver(() => { if (Math.abs(scope.offsetHeight - measured) > 2) refreshWhenIdle(); });
    observer.observe(scope);
    return () => { unlockWatch.disconnect(); hashTimers.forEach(window.clearTimeout); ScrollTrigger.removeEventListener('refresh', onRefresh); window.removeEventListener('wheel', stopAiming); window.removeEventListener('touchstart', stopAiming); window.removeEventListener('keydown', stopAiming); observer.disconnect(); window.removeEventListener('scroll', onScroll); window.clearTimeout(idle); cancelAnimationFrame(frame); mm.revert(); };
  }, [root]);
}
