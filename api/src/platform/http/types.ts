/** Variables que les middlewares déposent dans le contexte de requête et que les routes peuvent lire. */
import type { User } from '../../modules/identity/repository.ts';

export interface AppEnv {
  Variables: {
    requestId: string;
    /** Utilisateur connecté, ou null (visiteur anonyme). Renseigné par le middleware de session. */
    user: User | null;
    /** Empreinte de la session courante (pour la révoquer). */
    sessionTokenHash: string | null;
  };
}
