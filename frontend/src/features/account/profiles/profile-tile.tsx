import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type { CSSProperties } from 'react';
import { tintVars } from '@/lib/adaptive';
import { avatarArt } from './avatar-art';
import { profileTint } from './profile-tint';
import { initials } from '@/features/account/session/demo-session';
import type { Profile } from './types';

/** Carré plein : un profil. Fond de couleurs floues tiré de son avatar (ou de sa photo), nom en bas à gauche. */
export function ProfileTile({ profile, index, managing, autoFocus, onLit }: {
  profile: Profile; index: number; managing: boolean; autoFocus: boolean; onLit: () => void;
}) {
  const photo = profile.avatar?.kind === 'photo' ? profile.avatar : undefined;
  const preset = profile.avatar?.kind === 'preset' ? profile.avatar : undefined;
  const style = { ...tintVars(profileTint(profile), 'pk'), '--i': index } as CSSProperties;
  const inside = <>
    <span className="pk-tile-card">
      <span className="pk-tile-pic">
        {photo && <img src={photo.src} alt="" style={{ transform: `scale(${photo.zoom / 100})` }} />}
        {preset && <img src={avatarArt[preset.index] ?? avatarArt[0]} alt="" />}
        {!photo && !preset && <span className="pk-tile-initials" aria-hidden="true">{initials(profile.user)}</span>}
      </span>
    </span>
    <span className="pk-tile-name">{profile.user.name}{managing && <i>Modifier</i>}</span>
  </>;
  const common = { className: 'pk-tile is-filled', style, onMouseEnter: onLit, onFocus: onLit };
  return profile.real
    ? <Link to={managing ? '/compte' : '/'} {...common} {...(autoFocus ? { 'data-autofocus': true } : {})} aria-label={managing ? `Modifier le profil ${profile.user.name}` : `Regarder en tant que ${profile.user.name}`}>{inside}</Link>
    : <button type="button" {...common} aria-disabled="true" title="Aperçu de dessin : profil d'exemple">{inside}</button>;
}

/** Carré à lignes : emplacement libre, transparent, hachuré. « Ajouter un profil » (bientôt : le back-end ne gère qu'un profil). */
export function AddTile({ index }: { index: number }) {
  return <button type="button" className="pk-tile is-empty" style={{ '--i': index } as CSSProperties} aria-disabled="true" title="Plusieurs profils par compte : bientôt disponible">
    <span className="pk-tile-card"><span className="pk-tile-pic"><Plus className="pk-tile-plus" aria-hidden="true" /></span></span>
    <span className="pk-tile-name">Ajouter <i>Bientôt</i></span>
  </button>;
}
