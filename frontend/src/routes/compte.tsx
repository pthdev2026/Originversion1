import { createFileRoute } from '@tanstack/react-router';
import { AccountPage } from '@/features/account/pages/account-page';

export const Route = createFileRoute('/compte')({
  head: () => ({ meta: [{ title: 'Mon compte — MILLENIUM' }, { name: 'robots', content: 'noindex' }] }),
  component: AccountPage,
});
