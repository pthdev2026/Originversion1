/**
 * Photos de simulation pour l'écran des profils — DÉVELOPPEMENT UNIQUEMENT.
 * Ce module n'est chargé que derrière `import.meta.env.DEV` (voir use-profiles.ts) : il disparaît du build de production.
 * Les fichiers (`src/assets/dev-preview/`) sont ignorés par git.
 */
const files = import.meta.glob<string>('/src/assets/dev-preview/*.jpg', { eager: true, import: 'default', query: '?url' });

export const previewPhotos: string[] = Object.keys(files).sort().map(path => files[path]!);
