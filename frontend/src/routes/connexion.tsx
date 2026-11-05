import { createFileRoute } from '@tanstack/react-router';
import { SignInPage } from '@/features/account/auth/sign-in-page';

export const Route = createFileRoute('/connexion')({
  head: () => ({ meta: [{ title: 'Se connecter — MILLENIUM' }, { name: 'robots', content: 'noindex' }] }),
  component: SignInPage,
});
