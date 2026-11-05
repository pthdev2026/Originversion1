import { createFileRoute } from '@tanstack/react-router';
import { ListPage } from '@/features/account/pages/list-page';

export const Route = createFileRoute('/ma-liste')({
  head: () => ({ meta: [{ title: 'Ma liste — MILLENIUM' }, { name: 'robots', content: 'noindex' }] }),
  component: ListPage,
});
