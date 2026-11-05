/**
 * Images prédéfinies des profils (dégradés abstraits dessinés pour MILLENIUM, `src/assets/avatars/`).
 * L'indice 0..7 est celui de l'avatar « préréglé » du contrat API (`{kind: "preset", preset}`). `avatarArtColors` : couleur dominante, pour teinter le verre.
 */
const files = import.meta.glob<string>('/src/assets/avatars/preset-*.svg', { eager: true, import: 'default', query: '?url' });

export const avatarArt: string[] = Array.from({ length: 8 }, (_, index) => files[`/src/assets/avatars/preset-${index}.svg`] ?? '');
export const avatarArtColors = ['#e2582a', '#8a4fd0', '#2f9a78', '#d6a33a', '#2f6fe0', '#d03a5a', '#4ab6d6', '#4a3fa8'];
