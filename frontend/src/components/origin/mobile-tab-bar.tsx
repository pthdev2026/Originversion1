import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useActiveSection } from '@/components/origin/origin-navigation';
import { SearchOverlay } from '@/components/origin/search-overlay';
import { BookmarkIcon, FilmsIcon, GridIcon, HomeIcon, SearchIcon } from '@/components/menu/menu-icons';
import { MilleniumMenu } from '@/components/menu/millenium-menu';
import { scrollToSection, sectionAnchor } from '@/lib/origin-sections';
import { scrollPageTo } from '@/components/smooth-scroll';

const HIDDEN_ON = ['/connexion', '/inscription', '/mot-de-passe-oublie', '/bienvenue'];
const SCROLL_STEP = 8;
const TOP_ZONE = 80;

/**
 * Navigation principale du téléphone : une pastille de verre flottante en bas (comme les apps de streaming),
 * plus un bouton rond de recherche. Elle se retire quand on descend dans la page et revient quand on remonte.
 * Visible uniquement sous 768 px (CSS) ; la teinte du verre suit le film de la Hero (--hg-*).
 */
export function MobileTabBar() {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const section = useActiveSection();
  const go = useNavigate();
  const [search, setSearch] = useState(false);
  const [menu, setMenu] = useState(false);
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);
  const onHome = pathname === '/';

  useEffect(() => {
    last.current = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      if (y < TOP_ZONE) setHidden(false);
      else if (y - last.current > SCROLL_STEP) setHidden(true);
      else if (last.current - y > SCROLL_STEP) setHidden(false);
      last.current = y;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, []);
  // Une nouvelle page s'ouvre en haut : la barre est de nouveau visible.
  useEffect(() => { setHidden(false); }, [pathname]);

  if (HIDDEN_ON.includes(pathname)) return null;

  const home = () => (onHome ? scrollPageTo(0) : void go({ to: '/' }));
  const films = () => (onHome ? scrollToSection('films-series') : void go({ to: '/', hash: sectionAnchor('films-series') }));
  const item = (on: boolean) => `mtb-item ${on ? 'is-on' : ''}`;

  return (
    <>
      <nav className={`mtb ${hidden ? 'is-hidden' : ''}`} aria-label="Navigation principale">
        <div className="mtb-pill">
          <button type="button" className={item(onHome && section === 'accueil')} aria-current={onHome && section === 'accueil' ? 'page' : undefined} onClick={home}><HomeIcon aria-hidden="true" /><span>Accueil</span></button>
          <button type="button" className={item(onHome && section === 'films-series')} aria-label="Films & Séries" aria-current={onHome && section === 'films-series' ? 'location' : undefined} onClick={films}><FilmsIcon aria-hidden="true" /><span>Films</span></button>
          <Link to="/ma-liste" className={item(pathname.startsWith('/ma-liste'))} aria-current={pathname.startsWith('/ma-liste') ? 'page' : undefined}><BookmarkIcon aria-hidden="true" /><span>Ma liste</span></Link>
          <button type="button" className={item(menu)} aria-haspopup="dialog" onClick={() => setMenu(true)}><GridIcon aria-hidden="true" /><span>Menu</span></button>
        </div>
        <button type="button" className="mtb-search" aria-label="Rechercher" aria-haspopup="dialog" onClick={() => setSearch(true)}><SearchIcon aria-hidden="true" /></button>
      </nav>
      <MilleniumMenu open={menu} onOpenChange={setMenu} activeSection={onHome ? section : undefined} onSearch={() => { setMenu(false); setSearch(true); }} />
      <SearchOverlay open={search} onOpenChange={setSearch} />
    </>
  );
}
