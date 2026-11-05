import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Mail, MailCheck } from 'lucide-react';
import { AuthField, AuthHeading, AuthLayout } from '@/features/account/auth/auth-layout';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Password reset request. No e-mail service is connected yet, so the confirmation is a demonstration;
 * it never reveals whether an account exists for the address.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [sentTo, setSentTo] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!EMAIL.test(email.trim())) { setError('Saisissez une adresse e-mail valide.'); return; }
    setError(undefined);
    setSentTo(email.trim());
  }

  if (sentTo) return <AuthLayout>
    <div className="auth-done">
      <span className="auth-ring" aria-hidden="true"><MailCheck /></span>
      <AuthHeading title="Vérifiez votre boîte mail" text={`Si un compte existe pour ${sentTo}, vous recevrez un lien pour choisir un nouveau mot de passe.`} />
      <Link to="/connexion" className="mx-btn">Retour à la connexion<ArrowUpRight aria-hidden="true" /></Link>
      <button type="button" className="auth-link is-quiet" onClick={() => setSentTo(null)}>Utiliser une autre adresse</button>
      <p className="auth-notice">Démonstration : aucun e-mail n’est envoyé pour l’instant.</p>
    </div>
  </AuthLayout>;

  return <AuthLayout>
    <AuthHeading title="Mot de passe oublié" text="Indiquez l’adresse e-mail de votre compte. Nous vous enverrons un lien pour en choisir un nouveau." />
    <form className="auth-form" onSubmit={submit} noValidate>
      <AuthField id="email" label="Adresse e-mail" icon={Mail} type="email" value={email} onChange={setEmail} error={error} autoComplete="email" placeholder="votre@email.com" />
      <button type="submit" className="mx-btn">Envoyer le lien<ArrowUpRight aria-hidden="true" /></button>
    </form>
    <p className="auth-foot">Vous vous en souvenez ? <Link to="/connexion" className="auth-link">Se connecter</Link></p>
  </AuthLayout>;
}
