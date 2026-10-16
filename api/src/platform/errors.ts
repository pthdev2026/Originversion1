/**
 * Erreurs métier de l'application.
 *
 * Une `AppError` est une erreur « attendue » : l'utilisateur a demandé quelque chose d'impossible
 * (programme absent, jeton expiré…). Le gestionnaire d'erreurs la transforme en réponse JSON propre.
 * Toute autre exception est un BUG : elle est journalisée et le client reçoit un message neutre.
 */
export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 503;

export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'two_factor_required'
  | 'forbidden'
  | 'not_found'
  | 'not_available'
  | 'conflict'
  | 'payload_too_large'
  | 'rate_limited'
  | 'internal_error'
  | 'unavailable';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: ErrorStatus;

  constructor(code: ErrorCode, status: ErrorStatus, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

/** Fabriques d'erreurs : un seul endroit où se décident le code et le statut HTTP. */
export const errors = {
  badRequest: (message = 'Requête invalide.') => new AppError('bad_request', 400, message),
  unauthorized: (message = 'Connexion requise.') => new AppError('unauthorized', 401, message),
  forbidden: (message = 'Accès refusé.') => new AppError('forbidden', 403, message),
  notFound: (message = 'Ressource introuvable.') => new AppError('not_found', 404, message),
  /** Contenu connu mais pas encore lisible : ce n'est pas une panne. */
  notAvailable: (message = 'Ce programme n’est pas encore disponible à la lecture.') => new AppError('not_available', 404, message),
  tooLarge: (message = 'Requête trop volumineuse.') => new AppError('payload_too_large', 413, message),
  rateLimited: (message = 'Trop de requêtes. Réessayez dans un instant.') => new AppError('rate_limited', 429, message),
  unavailable: (message = 'Service momentanément indisponible.') => new AppError('unavailable', 503, message),
};
