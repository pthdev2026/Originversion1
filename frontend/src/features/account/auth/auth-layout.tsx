import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { Eye, EyeOff, X, type LucideIcon } from 'lucide-react';

/** Shared stage for the account pages: perceptible blurred scene, smoked-glass card, MILLENIUM wordmark. */
export function AuthLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <main className="auth-page">
    <div className="auth-bg" aria-hidden="true" />
    <Link to="/" className="auth-close" aria-label="Retour à l’accueil"><X /></Link>
    <section className={`auth-card ${wide ? 'is-wide' : ''}`}>
      <p className="auth-wordmark">MILLENIUM</p>
      {children}
    </section>
  </main>;
}

export function AuthHeading({ title, text }: { title: string; text: string }) {
  return <header className="auth-heading"><h1>{title}</h1><p>{text}</p></header>;
}

/** Labelled field with icon; password fields get a show/hide toggle. Neon only lights the focused field. */
export function AuthField({ id, label, icon: Icon, type = 'text', value, onChange, error, autoComplete, placeholder }: {
  id: string; label: string; icon: LucideIcon; type?: 'text' | 'email' | 'password'; value: string; onChange: (value: string) => void;
  error?: string | undefined; autoComplete?: string; placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  return <div className="auth-field">
    <label htmlFor={id}>{label}</label>
    <div className={`auth-input ${error ? 'has-error' : ''}`}>
      <Icon aria-hidden="true" />
      <input id={id} type={isPassword && !visible ? 'password' : isPassword ? 'text' : type} value={value} onChange={event => onChange(event.target.value)}
        autoComplete={autoComplete} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
      {isPassword && <button type="button" className="auth-eye" onClick={() => setVisible(v => !v)} aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{visible ? <EyeOff /> : <Eye />}</button>}
    </div>
    {error && <p id={`${id}-error`} className="auth-error" role="alert">{error}</p>}
  </div>;
}

export function GoogleLogo() {
  return <svg viewBox="0 0 48 48" aria-hidden="true" className="auth-brand-logo">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z" />
  </svg>;
}

export function AppleLogo() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="auth-brand-logo"><path fill="currentColor" d="M16.4 12.6c0-2.4 2-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.8-3.5.8s-1.8-.8-3-.8C7 7.2 5.5 8.1 4.7 9.6c-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.7 2.4 3 2.4 1.2 0 1.6-.8 3-.8s1.8.8 3.1.8c1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.8-1.1-2.8-4zM14.2 5.5c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.2-.5 2.8-1.3z" /></svg>;
}
