import { useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { MilleniumMenu } from '@/components/menu/millenium-menu';
import { SearchOverlay } from './search-overlay';
import { useActiveSection } from './origin-navigation';

/**
 * Menu button that stays at hand once the page has scrolled past its top bar, so the menu opens without scrolling
 * back up. Hidden at the top of the page (the bar is there) and during video playback.
 */
export function FloatingMenu() {
  const [shown, setShown] = useState(false);
  const [panel, setPanel] = useState<'menu' | 'search' | null>(null);
  const section = useActiveSection();
  // Sections exist only on the homepage: elsewhere no entry of the menu is marked as current.
  const onHome = useRouterState({ select: state => state.location.pathname }) === '/';
  const activeSection = onHome ? section : undefined;
  useEffect(() => {
    let frame = 0;
    const update = () => { frame = 0; setShown(window.scrollY > 220); };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, []);

  return <>
    <button type="button" className={`floating-menu ${shown ? 'is-shown' : ''}`} aria-label="Ouvrir le menu" aria-haspopup="dialog" tabIndex={shown ? 0 : -1} onClick={() => setPanel('menu')}>
      <span className="menu-burger" aria-hidden="true"><span /><span /><span /></span>
    </button>
    <MilleniumMenu open={panel === 'menu'} onOpenChange={open => { if (!open) setPanel(null); }} activeSection={activeSection} onSearch={() => setPanel('search')} />
    <SearchOverlay open={panel === 'search'} onOpenChange={open => setPanel(open ? 'search' : null)} />
  </>;
}
