/**
 * Transforme toute erreur en réponse JSON cohérente :
 *   { "error": "<code>", "message": "<texte lisible>", "requestId": "<id>" }
 *
 * `error` et `message` sont le contrat historique avec le front ; `requestId` permet de retrouver
 * la requête dans les journaux quand quelqu'un signale un problème.
 */
import type { Hono } from 'hono';
import type { AppEnv } from './types.ts';
import type { Logger } from '../logger.ts';
import { AppError } from '../errors.ts';

/**
 * Erreurs de la base de données qui ne sont PAS des bugs : on les traduit en réponse honnête plutôt qu'en « 500 ».
 *  - panne / saturation / délai dépassé / interblocage → 503 : le client peut réessayer ;
 *  - doublon (23505) → 409 ; référence inexistante (23503) → 400.
 * Retourne null pour tout le reste (vrai bug : 500 et journalisation).
 */
export function mapDatabaseError(error: unknown): AppError | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, errno } = error as { code?: unknown; errno?: unknown };
  const key = typeof code === 'string' ? code : typeof errno === 'string' ? errno : '';
  if (key === '23505') return new AppError('conflict', 409, 'Cet élément existe déjà.');
  if (key === '23503') return new AppError('bad_request', 400, 'Référence vers un élément inexistant.');
  const unavailable = new Set([
    'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'CONNECTION_CLOSED', 'CONNECTION_ENDED', 'CONNECTION_DESTROYED',
    'CONNECT_TIMEOUT', '57P01', '57P02', '57P03', '53300', '57014', '40001', '40P01', '08006', '08001', '08004',
  ]);
  if (unavailable.has(key)) return new AppError('unavailable', 503, 'Service momentanément indisponible. Réessayez dans un instant.');
  return null;
}

export function registerErrorHandlers(app: Hono<AppEnv>, logger: Logger): void {
  app.onError((error, c) => {
    const requestId = c.get('requestId');
    if (error instanceof AppError) {
      return c.json({ error: error.code, message: error.message, requestId }, error.status);
    }
    const mapped = mapDatabaseError(error);
    if (mapped) {
      logger.warn({ err: error, requestId }, 'erreur de base de données traduite');
      if (mapped.status === 503) c.header('Retry-After', '5');
      return c.json({ error: mapped.code, message: mapped.message, requestId }, mapped.status);
    }
    // Exception inattendue = bug : on journalise le détail, le client ne reçoit qu'un message neutre.
    logger.error({ err: error, requestId }, 'erreur non gérée');
    return c.json({ error: 'internal_error', message: 'Une erreur interne est survenue.', requestId }, 500);
  });

  app.notFound(c => c.json({ error: 'not_found', message: 'Ressource introuvable.', requestId: c.get('requestId') }, 404));
}
