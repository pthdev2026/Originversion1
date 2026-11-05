import { avatarArtColors } from './avatar-art';
import type { Tint } from '@/lib/adaptive';
import type { Profile } from './types';

const hueOf = (text: string) => [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7);

/** Couleur de base d'un profil : son préréglage, sinon une teinte stable tirée de son nom (cas des initiales). */
export function profileColor(profile: Profile): string {
  const { avatar } = profile;
  if (avatar?.kind === 'preset') return `color-mix(in srgb, ${avatarArtColors[avatar.index] ?? avatarArtColors[0]!} 55%, #000)`;
  return `hsl(${hueOf(profile.user.name)} 45% 26%)`;
}

/** Teinte d'une couleur : éclaircie pour le halo, assombrie pour le fond. */
export const colorTint = (color: string): Tint => ({
  c1: `color-mix(in srgb, ${color} 55%, #fff 45%)`,
  c2: `color-mix(in srgb, ${color} 80%, #000 20%)`,
  c3: `color-mix(in srgb, ${color} 25%, #fff 75%)`,
});

export const profileTint = (profile: Profile): Tint => colorTint(profileColor(profile));
