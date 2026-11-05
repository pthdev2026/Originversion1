import type { Avatar } from '@/features/account/session/demo-space';
import type { SessionUser } from '@/features/account/session/demo-session';

/** Nombre maximal de profils par compte (comme Netflix) — voir docs/API-REQUESTS.md, « Profils multiples ». */
export const MAX_PROFILES = 5;

export interface Profile {
  id: string;
  user: SessionUser;
  avatar: Avatar | undefined;
  /** `false` : profil d'exemple (aperçu de dessin en développement), sans effet. */
  real: boolean;
}
