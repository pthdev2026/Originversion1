import { useOfflinePreview } from '@/lib/offline-preview';

/** Bandeau discret permanent : l'interface est montrée avec des contenus de démonstration, sans serveur. */
export function OfflineBanner() {
  const active = useOfflinePreview();
  if (!active) return null;
  return <p className="offline-banner" role="status">Aperçu hors connexion · contenus de démonstration (lecture et comptes indisponibles)</p>;
}
