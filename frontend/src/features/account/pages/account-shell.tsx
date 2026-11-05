import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { Pencil } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { SignOutConfirm } from '@/features/account/pages/sign-out-confirm';
import { UserAvatar } from '@/features/account/profiles/user-avatar';
import { useMySpace } from '@/features/account/session/demo-space';
import { useSessionStatus } from '@/features/account/session/session';
import { AccountIcon, BookmarkIcon, ContinueIcon, LogoutIcon, SettingsIcon, type MenuIcon } from '@/components/menu/menu-icons';

const menu = [
  { to: '/compte', label: 'Mon compte', icon: AccountIcon },
  { to: '/ma-liste', label: 'Ma liste', icon: BookmarkIcon, count: 'list' },
  { to: '/continuer', label: 'Continuer à regarder', icon: ContinueIcon, count: 'progress' },
] as const;
const options = [{ to: '/parametres', label: 'Paramètres', icon: SettingsIcon }] as const;

/**
 * Frame of every « Votre espace » page: a frosted-glass side menu (Menu / Options, profile at the bottom) and the page content.
 * A visitor is sent to the sign-in page once the browser session is known.
 */
export function AccountShell({ children }: { children: ReactNode }) {
  const { user, space, loading } = useMySpace();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: state => state.location.pathname });
  // Le serveur doit d'abord avoir dit s'il y a une session : sinon un utilisateur connecté qui ouvre /compte directement serait renvoyé à la connexion.
  const sessionStatus = useSessionStatus();
  useEffect(() => { if (sessionStatus === 'ready' && !user) void navigate({ to: '/connexion' }); }, [sessionStatus, user, navigate]);

  if (!user || !space) return <main className="sp-page sp-waiting" aria-busy="true" />;
  const item = (to: '/compte' | '/ma-liste' | '/continuer' | '/parametres', label: string, Icon: MenuIcon, count = 0) => <Link key={to} to={to} className={`sp-side-link ${pathname === to ? 'is-on' : ''}`} aria-current={pathname === to ? 'page' : undefined}>
    <Icon aria-hidden="true" /><span className="sp-side-text">{label}</span>{count > 0 && <span className="sp-count">{count}</span>}
  </Link>;
  return <main className="sp-page">
    <div className="sp-layout">
      <aside className="sp-side" aria-label="Votre espace">
        <span className="sp-label">Menu</span>
        <nav aria-label="Menu de l’espace">
          {menu.map(entry => item(entry.to, entry.label, entry.icon, 'count' in entry ? (entry.count === 'list' ? space.list.length : space.progress.length) : 0))}
        </nav>
        <span className="sp-rule" aria-hidden="true" />
        <span className="sp-label">Options</span>
        <nav aria-label="Options">
          {options.map(entry => item(entry.to, entry.label, entry.icon))}
          <SignOutConfirm trigger={<button type="button" className="sp-side-link"><LogoutIcon aria-hidden="true" /><span className="sp-side-text">Déconnexion</span></button>} />
        </nav>
        <Link to="/compte" className="sp-who" aria-label="Modifier mon profil">
          <UserAvatar user={user} avatar={space.avatar} className="sp-who-avatar" />
          <span className="sp-who-text"><strong>{user.name}</strong><small>{user.email}</small></span>
          <Pencil aria-hidden="true" />
        </Link>
      </aside>
      <div className="sp-content">{loading ? <ContentSkeleton /> : children}</div>
    </div>
  </main>;
}

/** Placeholder shown while the server has not yet answered for the signed-in account (avoids flashing « Aucun titre »). */
function ContentSkeleton() {
  return <div className="sp-skeleton" role="status" aria-busy="true" aria-label="Chargement de votre espace">
    <span className="sp-sk sp-sk-title" /><span className="sp-sk sp-sk-line" />
    <span className="sp-sk sp-sk-feature" />
    <div className="sp-sk-grid">{Array.from({ length: 4 }, (_, index) => <span key={index} className="sp-sk sp-sk-poster" />)}</div>
  </div>;
}
