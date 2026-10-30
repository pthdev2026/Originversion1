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
  /** Vrai quand la personne a prouvé contrôler son adresse e-mail (lien reçu par e-mail). */
  emailVerified: boolean;
  /** Double authentification activée sur ce compte. */
  twoFactorEnabled: boolean;
  createdAt: Date;
  /** Langue de l'interface choisie par la personne. */
  locale: 'fr' | 'en';
  /** Photo de profil : avatar prédéfini, photo (clé de fichier + recadrage) ou aucune. */
  avatar: { kind: 'preset'; preset: number } | { kind: 'photo'; key: string; zoom: number } | null;
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
