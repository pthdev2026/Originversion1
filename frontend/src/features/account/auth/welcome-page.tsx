import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ArrowUpRight, Check } from 'lucide-react';
import { AuthLayout } from '@/features/account/auth/auth-layout';
import { firstName, useSession } from '@/features/account/session/demo-session';

/** Delay before the automatic redirection to the user's space, matched by the progress bar. */
const REDIRECT_MS = 4500;

export function WelcomePage() {
  const navigate = useNavigate();
  const user = useSession();
  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => void navigate({ to: '/' }), REDIRECT_MS);
    return () => window.clearTimeout(timer);
  }, [user, navigate]);

  if (!user) return <AuthLayout>
    <header className="auth-heading"><h1>Aucun compte ouvert</h1><p>Connectez-vous pour accéder à votre espace.</p></header>
    <Link to="/connexion" className="mx-btn">Se connecter<ArrowUpRight aria-hidden="true" /></Link>
  </AuthLayout>;

  return <AuthLayout>
    <div className="auth-done">
      <span className="auth-ring" aria-hidden="true"><Check /></span>
      <header className="auth-heading"><h1>Bienvenue, {firstName(user)}</h1><p>Votre compte est prêt. Vous allez être redirigé vers votre espace.</p></header>
      <span className="auth-progress" style={{ ['--redirect' as string]: `${REDIRECT_MS}ms` }} role="progressbar" aria-label="Redirection en cours"><i /></span>
      <Link to="/" className="mx-btn">Accéder à mon espace<ArrowUpRight aria-hidden="true" /></Link>
      <Link to="/" hash="thematiques" className="auth-link is-quiet">Choisir mes thématiques préférées</Link>
    </div>
  </AuthLayout>;
}
