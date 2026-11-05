import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '@/features/account/pages/settings-page';

export const Route = createFileRoute('/parametres')({
  head: () => ({ meta: [{ title: 'Paramètres — MILLENIUM' }, { name: 'robots', content: 'noindex' }] }),
  component: SettingsPage,
});
