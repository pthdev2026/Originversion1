import type { Avatar } from '@/features/account/session/demo-space';
import { avatarArt } from './avatar-art';
import { initials, type SessionUser } from '@/features/account/session/demo-session';

/** The user's picture: their photo, a chosen MILLENIUM avatar, or their initials. */
export function UserAvatar({ user, avatar, className = '' }: { user: SessionUser; avatar: Avatar | undefined; className?: string }) {
  if (avatar?.kind === 'photo') return <span className={`user-avatar ${className}`} aria-hidden="true"><img src={avatar.src} alt="" style={{ transform: `scale(${avatar.zoom / 100})` }} /></span>;
  if (avatar?.kind === 'preset') return <span className={`user-avatar is-preset ${className}`} aria-hidden="true"><img src={avatarArt[avatar.index] ?? avatarArt[0]} alt="" /></span>;
  return <span className={`user-avatar ${className}`} aria-hidden="true">{initials(user)}</span>;
}
