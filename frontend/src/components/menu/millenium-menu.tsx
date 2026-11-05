import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { navSections, scrollToSection, sectionAnchor, type NavSectionId } from '@/lib/origin-sections';
import { useMySpace } from '@/features/account/session/demo-space';
import { scrollPageTo } from '@/components/smooth-scroll';
import { UserAvatar } from '@/features/account/profiles/user-avatar';
import { SignOutConfirm } from '@/features/account/pages/sign-out-confirm';
import { sectionLabel, useLocale } from '@/lib/locale';
import { catalogThemes, themeRailOrder } from '@/lib/origin-catalogs';
import { requestTheme } from '@/lib/theme-pick';
import { BellIcon, BookmarkIcon, ContinueIcon, ExploreIcon, FilmsIcon, HomeIcon, LogoutIcon, OriginalsIcon, RecommendIcon, SearchIcon, SettingsIcon, type MenuIcon } from '@/components/menu/menu-icons';
import { useRestoreFocus } from '@/lib/use-restore-focus';

const sectionIcons = { accueil: HomeIcon, originals: OriginalsIcon, 'films-series': FilmsIcon, explorer: ExploreIcon };
const MINI_KEY = 'millenium-menu-mini';
/** Themes listed in the menu: the featured ones, then a link to all of them. */
/** Calculé à l'affichage (et non au chargement du module) : les thématiques viennent du serveur une fois l'accueil chargé. */
const menuThemesNow = () => catalogThemes.filter(theme => theme.id !== 'all' && theme.id !== 'tendances')
  .sort((a, b) => (themeRailOrder.indexOf(a.id) + 1 || 99) - (themeRailOrder.indexOf(b.id) + 1 || 99)).slice(0, 5);

/**
 * MILLENIUM menu: a frosted-glass panel (side drawer on every screen; icons only on request on wide screens).
 * Sections: the platform, the reader's library, categories, general; the account sits at the bottom.
 * A visitor sees the platform and an invitation to sign in; a signed-in user sees their space.
 */
export function MilleniumMenu({ open, onOpenChange, activeSection, onSearch }: {
  open: boolean; onOpenChange: (open: boolean) => void; activeSection?: NavSectionId | undefined; onSearch: () => void;
}) {
  const restoreFocus = useRestoreFocus(open);
  const { user, space } = useMySpace();
  const locale = useLocale();
  const close = () => onOpenChange(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: state => state.location.pathname });
  const onHome = pathname === '/';
  const [mini, setMini] = useState(false);
  useEffect(() => { try { setMini(window.localStorage.getItem(MINI_KEY) === '1'); } catch { /* storage unavailable */ } }, []);
  const toggleMini = () => setMini(value => { try { window.localStorage.setItem(MINI_KEY, value ? '0' : '1'); } catch { /* storage unavailable */ } return !value; });

  // From an inner page, the homepage opens first, then the section is reached.
  const go = (id: NavSectionId) => {
    close();
    if (onHome) { window.setTimeout(() => scrollToSection(id), 220); return; }
    const anchor = sectionAnchor(id);
    void navigate(anchor ? { to: '/', hash: anchor } : { to: '/' });
  };
  const goRecommendations = () => {
    close();
    if (onHome) { window.setTimeout(() => { const top = document.getElementById('recommandations')?.getBoundingClientRect().top; if (top !== undefined) scrollPageTo(top + window.scrollY - 24); }, 220); return; }
    void navigate({ to: '/', hash: 'recommandations' });
  };
  const goTheme = (id?: string) => {
    close();
    if (id) requestTheme(id);
    if (onHome) { window.setTimeout(() => scrollToSection('explorer'), 220); return; }
    void navigate({ to: '/', hash: sectionAnchor('explorer') });
  };

  const link = (to: '/ma-liste' | '/continuer' | '/compte' | '/parametres', label: string, Icon: MenuIcon, count?: number) => <Link to={to} title={label} className={`mm-item ${pathname === to ? 'is-on' : ''}`} aria-current={pathname === to ? 'page' : undefined} onClick={close}>
    <span className="mm-chip"><Icon aria-hidden="true" /></span><span className="mm-text">{label}</span>{count ? <span className="mm-count">{count}</span> : null}
  </Link>;
  const action = (label: string, Icon: MenuIcon, onClick: () => void, current = false) => <button type="button" title={label} className={`mm-item ${current ? 'is-on' : ''}`} aria-current={current ? 'location' : undefined} onClick={onClick}>
    <span className="mm-chip"><Icon aria-hidden="true" /></span><span className="mm-text">{label}</span>
  </button>;

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="mm-overlay" />
      <Dialog.Content className={`mm-drawer${mini ? ' is-mini' : ''}`} aria-describedby={undefined} onCloseAutoFocus={restoreFocus}>
        <header className="mm-head">
          <Dialog.Title className="mm-wordmark">MILLENIUM</Dialog.Title>
          <button type="button" className="mm-collapse" aria-label={mini ? 'Déplier le menu' : 'Réduire le menu'} aria-pressed={mini} onClick={toggleMini}>{mini ? <ChevronRight /> : <ChevronLeft />}</button>
          <Dialog.Close className="mm-close" aria-label="Fermer le menu"><X /></Dialog.Close>
        </header>
        <span className="mm-rule" aria-hidden="true" />

        <div className="mm-scroll">
          <nav className="mm-group" aria-label="La plateforme">
            <span className="mm-label">Menu</span>
            {navSections.map(section => action(sectionLabel(locale, section.id), sectionIcons[section.id], () => go(section.id), activeSection === section.id))}
            {action('Recommandations', RecommendIcon, goRecommendations)}
          </nav>

          {user && <nav className="mm-group" aria-label="Votre bibliothèque">
            <span className="mm-label">Ma bibliothèque</span>
            {link('/ma-liste', 'Ma liste', BookmarkIcon, space?.list.length)}
            {link('/continuer', 'Continuer à regarder', ContinueIcon, space?.progress.length)}
            <span className="mm-item is-soon" title="Notifications"><span className="mm-chip"><BellIcon aria-hidden="true" /></span><span className="mm-text">Notifications</span><span className="mm-soon">Bientôt</span></span>
          </nav>}

          <nav className="mm-group" aria-label="Catégories">
            <span className="mm-label">Catégories</span>
            {menuThemesNow().map(theme => <button key={theme.id} type="button" title={theme.title} className="mm-item" onClick={() => goTheme(theme.id)}>
              <span className="mm-chip mm-chip-image"><img src={theme.image} alt="" loading="lazy" /></span><span className="mm-text">{theme.title}</span>
            </button>)}
            {action('Toutes les thématiques', ExploreIcon, () => goTheme())}
          </nav>

          <nav className="mm-group" aria-label="Général">
            <span className="mm-label">Général</span>
            {action('Rechercher', SearchIcon, onSearch)}
            {user && link('/parametres', 'Paramètres', SettingsIcon)}
            {user && <SignOutConfirm onSignedOut={close} trigger={<button type="button" title="Déconnexion" className="mm-item mm-logout"><span className="mm-chip"><LogoutIcon aria-hidden="true" /></span><span className="mm-text">Déconnexion</span></button>} />}
          </nav>
        </div>

        <footer className="mm-account">
          {user
            ? <Link to="/compte" className="mm-profile" title="Mon compte" onClick={close}><UserAvatar user={user} avatar={space?.avatar} className="mm-avatar" /><span className="mm-text"><strong>{user.name}</strong><small>Compte personnel</small></span><ChevronRight aria-hidden="true" /></Link>
            : <div className="mm-join-actions">
                <Link to="/connexion" className="mx-btn" onClick={close}><span className="mm-text">Se connecter</span><ArrowUpRight aria-hidden="true" /></Link>
                <Link to="/inscription" className="mx-btn is-ghost" onClick={close}><span className="mm-text">Créer un compte</span></Link>
              </div>}
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
