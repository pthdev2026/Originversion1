import { createFileRoute } from '@tanstack/react-router';
import { ContinuePage } from '@/features/account/pages/continue-page';

export const Route = createFileRoute('/continuer')({
  head: () => ({ meta: [{ title: 'Continuer à regarder — MILLENIUM' }, { name: 'robots', content: 'noindex' }] }),
  component: ContinuePage,
});
