import { createFileRoute } from '@tanstack/react-router';
import { SignUpPage } from '@/features/account/auth/sign-up-page';

export const Route = createFileRoute('/inscription')({
  head: () => ({ meta: [{ title: 'Créer un compte — MILLENIUM' }, { name: 'robots', content: 'noindex' }] }),
  component: SignUpPage,
});
