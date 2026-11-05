import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Lock, Mail, UserRound } from 'lucide-react';
import { AuthField, AuthHeading, AuthLayout } from '@/features/account/auth/auth-layout';
import { signUp } from '@/features/account/session/demo-session';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRENGTH_LABELS = ['Trop court', 'Faible', 'Correct', 'Solide', 'Très solide'];

/** 0–4: length, then mixed case, digits and symbols. */
function strength(password: string) {
  if (password.length < 8) return 0;
  return 1 + [/[a-z]/.test(password) && /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
}

export function SignUpPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [news, setNews] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; terms?: string }>({});
  const score = strength(password);

  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = 'Indiquez votre prénom et votre nom.';
    if (!EMAIL.test(email.trim())) next.email = 'Saisissez une adresse e-mail valide.';
    if (score < 2) next.password = '8 caractères minimum, avec des majuscules, des chiffres ou des symboles.';
    if (!terms) next.terms = 'Acceptez les conditions d’utilisation pour continuer.';
    setErrors(next);
    if (Object.keys(next).length) return;
    if (busy) return;
    setBusy(true);
    const result = await signUp({ name, email, password });
    setBusy(false);
    if (!result.ok) { setErrors(result.field === 'password' ? { password: result.error } : result.field === 'form' ? { email: result.error } : { email: result.error }); return; }
    void navigate({ to: '/bienvenue' });
  }

  return <AuthLayout>
    <AuthHeading title="Créer un compte" text="Rejoignez MILLENIUM pour explorer et partager des histoires qui transforment." />
    <form className="auth-form" onSubmit={submit} noValidate>
      <AuthField id="name" label="Prénom et nom" icon={UserRound} value={name} onChange={setName} error={errors.name} autoComplete="name" placeholder="Votre prénom et votre nom" />
      <AuthField id="email" label="Adresse e-mail" icon={Mail} type="email" value={email} onChange={setEmail} error={errors.email} autoComplete="email" placeholder="votre@email.com" />
      <div>
        <AuthField id="password" label="Mot de passe" icon={Lock} type="password" value={password} onChange={setPassword} error={errors.password} autoComplete="new-password" placeholder="8 caractères minimum" />
        {password && <div className="auth-strength" aria-live="polite"><span className="auth-meter" aria-hidden="true">{[1, 2, 3, 4].map(level => <i key={level} className={score >= level ? 'is-on' : ''} />)}</span><span>{STRENGTH_LABELS[score]}</span></div>}
      </div>
      <div className="auth-checks">
        <label className="auth-check"><input type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)} aria-invalid={Boolean(errors.terms)} /><span className="auth-box" aria-hidden="true" />J’accepte les <span className="auth-link">conditions d’utilisation</span></label>
        {errors.terms && <p className="auth-error" role="alert">{errors.terms}</p>}
        <label className="auth-check"><input type="checkbox" checked={news} onChange={event => setNews(event.target.checked)} /><span className="auth-box" aria-hidden="true" />Recevoir les nouveautés MILLENIUM</label>
      </div>
      <button type="submit" className="mx-btn">Créer mon compte<ArrowUpRight aria-hidden="true" /></button>
    </form>
    <p className="auth-foot">Déjà un compte ? <Link to="/connexion" className="auth-link">Se connecter</Link></p>
  </AuthLayout>;
}
