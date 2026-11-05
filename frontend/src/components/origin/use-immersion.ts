import { useEffect, type RefObject } from 'react';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * Shared immersion layer for the editorial sections: pointer light and parallax (--im-mx/--im-my, --im-px/--im-py),
 * 3D tilt with glare on `.im-tilt` children, scroll parallax (--im-sy) and scroll reveals on `[data-reveal]` / `.im-words`.
 * Content stays visible without JavaScript: the hidden reveal state only applies once the section is armed.
 */
export function useImmersion(section: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = section.current;
    if (!root) return;
    const still = reducedMotion();
    root.dataset['imArmed'] = '';

    const targets = root.querySelectorAll<HTMLElement>('[data-reveal], .im-words');
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      (entry.target as HTMLElement).dataset['revealed'] = '';
      observer.unobserve(entry.target);
    }), { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(target => observer.observe(target));
    // Views rebuilt later (a theme opened from « Toutes les thématiques », a new selection) bring fresh reveal targets:
    // watch for them too, or they would stay hidden.
    const added = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (!(node instanceof HTMLElement)) return;
      if (node.matches('[data-reveal], .im-words')) observer.observe(node);
      node.querySelectorAll<HTMLElement>('[data-reveal], .im-words').forEach(target => observer.observe(target));
    })));
    added.observe(root, { childList: true, subtree: true });

    let tilted: HTMLElement | null = null;
    const resetTilt = () => { tilted?.style.removeProperty('--im-rx'); tilted?.style.removeProperty('--im-ry'); tilted = null; };
    // Pointer effects write only to the elements that use them, at most once per frame: setting variables on the
    // section root restyled the whole section on every pointer move and made the page stutter under the cursor.
    const spot = root.querySelector<HTMLElement>(':scope > .im-spot');
    const fine = finePointer();
    let pending: PointerEvent | null = null, moveFrame = 0;
    const apply = () => {
      moveFrame = 0;
      const event = pending;
      if (!event) return;
      const box = root.getBoundingClientRect();
      spot?.style.setProperty('--im-mx', `${event.clientX - box.left}px`);
      spot?.style.setProperty('--im-my', `${event.clientY - box.top}px`);
      if (still) return;
      const px = `${((event.clientX - box.left) / box.width - 0.5) * -26}px`, py = `${((event.clientY - box.top) / box.height - 0.5) * -16}px`;
      // Looked up each frame: the featured block is rebuilt when the theme changes.
      root.querySelectorAll<HTMLElement>('.tx-backdrop, .tx-feature-wrap').forEach(element => { element.style.setProperty('--im-px', px); element.style.setProperty('--im-py', py); });
      if (!fine) return;
      const card = (event.target as Element).closest<HTMLElement>('.im-tilt');
      if (card !== tilted) resetTilt();
      if (!card) return;
      tilted = card;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
      const strength = Number(card.dataset['tilt'] ?? 7);
      card.style.setProperty('--im-rx', `${(0.5 - y) * strength}deg`);
      card.style.setProperty('--im-ry', `${(x - 0.5) * strength}deg`);
      card.style.setProperty('--im-gx', `${x * 100}%`);
      card.style.setProperty('--im-gy', `${y * 100}%`);
    };
    const onMove = (event: PointerEvent) => { pending = event; if (!moveFrame) moveFrame = requestAnimationFrame(apply); };
    // Scroll parallax moves only the element that uses it (the theme backdrop), only while the section is near the
    // screen, once per frame: setting a variable on the section root restyled the whole section on every scroll event.
    const parallax = root.querySelector<HTMLElement>('.tx-backdrop');
    let near = false, frame = 0;
    const paint = () => {
      frame = 0;
      if (!parallax || !near) return;
      const box = root.getBoundingClientRect();
      const progress = (window.innerHeight - box.top) / (window.innerHeight + box.height);
      parallax.style.transform = `translate3d(0, ${((progress - 0.5) * -90).toFixed(1)}px, 0)`;
    };
    const onScroll = () => { if (near && !frame) frame = requestAnimationFrame(paint); };
    const nearby = new IntersectionObserver(([entry]) => { near = Boolean(entry?.isIntersecting); onScroll(); }, { rootMargin: '200px 0px' });
    if (parallax) nearby.observe(root);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', resetTilt);
    if (!still && parallax) window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      added.disconnect();
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', resetTilt);
      window.removeEventListener('scroll', onScroll);
      nearby.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(moveFrame);
    };
  }, [section]);
}

export { reducedMotion };
