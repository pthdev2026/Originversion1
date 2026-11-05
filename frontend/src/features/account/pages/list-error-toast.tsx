import { dismissListError, useListError } from '@/features/account/session/list-store';

/** Message court quand une modification de « Ma liste » est refusée par le serveur (l'écran est déjà revenu à l'état réel). */
export function ListErrorToast() {
  const message = useListError();
  if (!message) return null;
  return <p className="sp-toast" role="alert" style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 1000 }}>
    {message}<button type="button" className="sp-btn" onClick={dismissListError}>Fermer</button>
  </p>;
}
