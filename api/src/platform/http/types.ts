/** Variables que les middlewares déposent dans le contexte de requête et que les routes peuvent lire. */

export type Role = 'viewer' | 'admin';

/**
 * Utilisateur connecté, tel que vu par n'importe quel module. Défini ICI (socle) et non dans « identity » :
 * le socle ne dépend jamais d'un module fonctionnel. Aucun secret (jamais d'empreinte de mot de passe).
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string | null;
  role: Role;
  status: 'active' | 'disabled';
  createdAt: Date;
}

export interface AppEnv {
  Variables: {
    requestId: string;
    /** Utilisateur connecté, ou null (visiteur anonyme). Renseigné par le middleware de session. */
    user: AuthenticatedUser | null;
    /** Empreinte de la session courante (pour la révoquer). */
    sessionTokenHash: string | null;
  };
}
