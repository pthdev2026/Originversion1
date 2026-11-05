import { createFileRoute } from '@tanstack/react-router';
import { WelcomePage } from '@/features/account/auth/welcome-page';

export const Route = createFileRoute('/bienvenue')({
  head: () => ({ meta: [{ title: 'Bienvenue — MILLENIUM' }, { name: 'robots', content: 'noindex' }] }),
  component: WelcomePage,
});
