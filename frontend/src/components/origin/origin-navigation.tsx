import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { navSections, scrollToSection, sectionAnchor, type NavSectionId } from '@/lib/origin-sections';
import { firstName } from '@/features/account/session/demo-session';
import { useMySpace } from '@/features/account/session/demo-space';
import { UserAvatar } from '@/features/account/profiles/user-avatar';
import { sectionLabel, ui, useLocale } from '@/lib/locale';
import { SearchIcon } from '@/components/menu/menu-icons';

interface NavigationProps {
  onMenu: () => void;
  onSearch: () => void;
  /** Optional override; by default « Se connecter » is a link to the sign-in page. */
  onAccount?: (() => void) | undefined;
}

/** Tracks which homepage section is in view so the menu reflects the reader's position. */
export function useActiveSection() {
  const [active, setActive] = useState<NavSectionId>('accueil');
  useEffect(() => {
    const update = () => {
      const line = window.innerHeight * 0.4;
      const passed = navSections.slice(1)
        .map(sec => ({ id: sec.id, top: document.querySelector<HTMLElement>(sec.selector)?.getBoundingClientRect().top ?? Infinity }))
        .filter(sec => sec.top < line).sort((x, y) => y.top - x.top)[0];
      setActive(passed ? passed.id : 'accueil');
    };
    // One layout read per frame at most: reading positions on every scroll event, right after GSAP writes its
    // transforms, forces a synchronous layout each time and makes scrolling stutter.
    let frame = 0;
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); }); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    return () => { window.removeEventListener('scroll', schedule); cancelAnimationFrame(frame); };
  }, []);
  return active;
}

export function OriginNavigation({ onMenu, onSearch, onAccount }: NavigationProps) {
  const active = useActiveSection();
  const { user, space } = useMySpace();
  const locale = useLocale();
  const t = ui(locale);
  const navigate = useNavigate();
  const onHome = useRouterState({ select: state => state.location.pathname }) === '/';
  // From an inner page, the homepage opens on the section's anchor (aimed again once the pinned scenes are measured).
  const goTo = (id: NavSectionId) => {
    if (onHome) { scrollToSection(id); return; }
    const anchor = sectionAnchor(id);
    void navigate(anchor ? { to: '/', hash: anchor } : { to: '/' });
  };
  return (
    <header className="origin-navigation">
      <div className="navigation-left">
        <Button variant="ghost" size="icon" className="menu-button" aria-label={t.menu} title="Menu" aria-haspopup="dialog" onClick={onMenu}><span className="menu-burger" aria-hidden="true"><span /><span /><span /></span></Button>
        <nav aria-label="Navigation principale" className="desktop-navigation">
          {navSections.map(s => (
            <a key={s.id} href={`#${s.id}`} className={`nav-link ${active === s.id ? 'nav-active' : ''}`} aria-current={active === s.id ? 'location' : undefined}
              onClick={e => { e.preventDefault(); goTo(s.id); }}>{sectionLabel(locale, s.id).toUpperCase()}</a>
          ))}
        </nav>
      </div>
      <span className="origin-wordmark" aria-label="MILLENIUM">MILLENIUM</span>
      <div className="navigation-right">
        <Button variant="ghost" size="icon" className="search-button" aria-label={t.searchLabel} title={t.search} onClick={onSearch}><SearchIcon /></Button>
        <span className="navigation-divider" />
        {user
          ? <Button variant="ghost" className="account-button is-signed" onClick={onMenu} title={t.yourSpace}><UserAvatar user={user} avatar={space?.avatar} className="account-avatar" /><span>{firstName(user)}</span></Button>
          : onAccount
            ? <Button variant="ghost" className="account-button" onClick={onAccount} title={t.signIn}><UserRound /><span>{t.signIn}</span></Button>
            : <Button asChild variant="ghost" className="account-button" title={t.signIn}><Link to="/connexion"><UserRound /><span>{t.signIn}</span></Link></Button>}
      </div>
    </header>
  );
}
