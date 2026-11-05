import { useEffect, useMemo, useState } from 'react';
import { useMySpace } from '@/features/account/session/demo-space';
import { MAX_PROFILES, type Profile } from './types';

/** Noms des profils d'exemple (aperçu de dessin : développement uniquement, `?apercu=profils`, jamais en production). */
const PREVIEW_NAMES = ['Maman', 'Lila', 'Papa', 'Noah'];

const wantsPreview = () => import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('apercu') === 'profils';

/**
 * Profils du compte connecté. Le back-end n'en gère qu'un (nom + avatar du compte) : la liste n'a donc qu'un élément.
 * Quand il proposera plusieurs profils, seule cette fonction change.
 */
export function useProfiles() {
  const { user, space } = useMySpace();
  const [photos, setPhotos] = useState<string[]>([]);
  const preview = wantsPreview();
  useEffect(() => {
    if (!preview || !import.meta.env.DEV) return;
    void import('./dev-preview').then(module => setPhotos(module.previewPhotos));
  }, [preview]);

  const profiles = useMemo<Profile[]>(() => {
    if (!user) return [];
    const own: Profile = { id: 'own', user, avatar: space?.avatar ?? undefined, real: true };
    if (!preview) return [own];
    const photo = (index: number) => photos[index] ? { kind: 'photo' as const, src: photos[index]!, zoom: 100 } : undefined;
    const samples = PREVIEW_NAMES.slice(1).map((name, index): Profile => ({ id: `preview-${index}`, user: { ...user, name }, avatar: photo(index + 1) ?? { kind: 'preset', index: index + 1 }, real: false }));
    return [{ ...own, avatar: photo(0) ?? own.avatar }, ...samples];
  }, [user, space?.avatar, preview, photos]);
  return { user, profiles, canAdd: profiles.length < MAX_PROFILES };
}
