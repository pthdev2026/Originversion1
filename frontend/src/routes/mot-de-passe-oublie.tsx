import { createFileRoute } from '@tanstack/react-router';
import { ForgotPasswordPage } from '@/features/account/auth/forgot-password-page';

export const Route = createFileRoute('/mot-de-passe-oublie')({
  head: () => ({ meta: [{ title: 'Mot de passe oublié — MILLENIUM' }, { name: 'robots', content: 'noindex' }] }),
  component: ForgotPasswordPage,
});
