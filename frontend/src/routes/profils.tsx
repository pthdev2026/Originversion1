import { createFileRoute } from '@tanstack/react-router';
import { ProfilePicker } from '@/features/account/profiles/profile-picker';

export const Route = createFileRoute('/profils')({
  head: () => ({ meta: [{ title: 'Qui regarde ? — MILLENIUM' }, { name: 'robots', content: 'noindex' }] }),
  component: ProfilePicker,
});
