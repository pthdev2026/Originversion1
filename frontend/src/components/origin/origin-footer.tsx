import { Link, useRouterState } from '@tanstack/react-router';
import { ArrowUp, ArrowUpRight, Globe } from 'lucide-react';
import { footerColumns, footerLegal, type FooterLink } from '@/lib/origin-footer';
import { scrollToSection } from '@/lib/origin-sections';
import { useSession } from '@/features/account/session/demo-session';

function scrollToHash(hash: string) {
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(hash)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
}

function FooterEntry({ link, onHome }: { link: FooterLink; onHome: boolean }) {
  // Away from the homepage, section entries lead back to it at the right anchor.
  if ('section' in link) return onHome
    ? <button type="button" className="of-link" onClick={() => scrollToSection(link.section)}>{link.label}</button>
    : <Link to="/" className="of-link">{link.label}</Link>;
  if ('hash' in link) return onHome
    ? <button type="button" className="of-link" onClick={() => scrollToHash(link.hash)}>{link.label}</button>
    : <Link to="/" hash={link.hash} className="of-link">{link.label}</Link>;
  if ('to' in link) return <Link to={link.to} className="of-link">{link.label}</Link>;
  return <span className="of-link is-soon" aria-disabled="true" title="Bientôt disponible">{link.label}</span>;
}

/** MILLENIUM footer, on every page (hidden during video playback): a quiet closing, with one neon hairline as its only light. */
export function OriginFooter() {
  const user = useSession();
  const onHome = useRouterState({ select: state => state.location.pathname }) === '/';
  const year = new Date().getFullYear();
  const top = () => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });

  return <footer className="origin-footer" aria-labelledby="footer-title">
    <span className="of-glow" aria-hidden="true" />
    <div className="of-top">
      <div className="of-brand">
        <h2 id="footer-title" className="of-wordmark">MILLENIUM</h2>
        <p>Des histoires qui nous transforment.</p>
      </div>
      {user
        ? <p className="of-hello">Bonne séance, {user.name.split(' ')[0]}.</p>
        : <div className="of-join">
            <p>Créez votre compte pour enregistrer vos histoires et reprendre là où vous vous êtes arrêté.</p>
            <Link to="/inscription" className="mx-btn">Créer un compte<ArrowUpRight aria-hidden="true" /></Link>
          </div>}
    </div>

    <nav className="of-columns" aria-label="Pied de page">
      {footerColumns.map(column => <div key={column.title} className="of-column">
        <h3>{column.title}</h3>
        <ul>{column.links.map(link => <li key={link.label}><FooterEntry link={link} onHome={onHome} /></li>)}</ul>
      </div>)}
      <div className="of-column of-column-end">
        <button type="button" className="im-round of-up" onClick={top} aria-label="Revenir en haut de la page"><ArrowUp /></button>
      </div>
    </nav>

    <div className="of-bottom">
      <p className="of-copy">© {year} MILLENIUM · Partage Ton Histoire</p>
      <ul className="of-legal">{footerLegal.map(link => <li key={link.label}><FooterEntry link={link} onHome={onHome} /></li>)}</ul>
      <span className="of-lang"><Globe aria-hidden="true" />Français</span>
    </div>
  </footer>;
}
