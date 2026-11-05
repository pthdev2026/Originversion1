import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Lock, Mail } from 'lucide-react';
import { AppleLogo, AuthField, AuthHeading, AuthLayout, GoogleLogo } from '@/features/account/auth/auth-layout';
import { signIn } from '@/features/account/session/demo-session';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [notice, setNotice] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!EMAIL.test(email.trim())) next.email = 'Saisissez une adresse e-mail valide.';
    if (!password) next.password = 'Saisissez votre mot de passe.';
    setErrors(next);
    if (next.email || next.password) return;
    if (busy) return;
    setBusy(true);
    const result = await signIn(email, password, remember);
    setBusy(false);
    if (!result.ok) { setErrors({ form: result.error }); return; }
    void navigate({ to: '/profils' });
  }

  return <AuthLayout>
    <AuthHeading title="Se connecter" text="Retrouvez votre compte et reprenez vos histoires là où vous les avez laissées." />
    <form className="auth-form" onSubmit={submit} noValidate>
      <AuthField id="email" label="Adresse e-mail" icon={Mail} type="email" value={email} onChange={setEmail} error={errors.email} autoComplete="email" placeholder="votre@email.com" />
      <AuthField id="password" label="Mot de passe" icon={Lock} type="password" value={password} onChange={setPassword} error={errors.password} autoComplete="current-password" placeholder="Votre mot de passe" />
      <div className="auth-row">
        <label className="auth-check"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} /><span className="auth-box" aria-hidden="true" />Se souvenir de moi</label>
        <Link to="/mot-de-passe-oublie" className="auth-link">Mot de passe oublié ?</Link>
      </div>
      {errors.form && <p className="auth-error is-form" role="alert">{errors.form}</p>}
      {notice && <p className="auth-notice" role="status">{notice}</p>}
      <button type="submit" className="mx-btn" disabled={busy} aria-busy={busy}>Se connecter<ArrowUpRight aria-hidden="true" /></button>
    </form>
    <div className="auth-divider">ou</div>
    <div className="auth-socials">
      <button type="button" className="auth-social" onClick={() => setNotice('La connexion avec Google arrive bientôt.')}><GoogleLogo />Google</button>
      <button type="button" className="auth-social" onClick={() => setNotice('La connexion avec Apple arrive bientôt.')}><AppleLogo />Apple</button>
    </div>
    <p className="auth-foot">Pas encore de compte ? <Link to="/inscription" className="auth-link">Créer un compte</Link></p>
  </AuthLayout>;
}
