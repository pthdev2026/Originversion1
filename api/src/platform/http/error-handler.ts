/**
 * Transforme toute erreur en réponse JSON cohérente :
 *   { "error": "<code>", "message": "<texte lisible>", "requestId": "<id>" }
 *
 * `error` et `message` sont le contrat historique avec le front ; `requestId` permet de retrouver
 * la requête dans les journaux quand quelqu'un signale un problème.
 */
import type { Hono } from 'hono';
import type { Logger } from '../logger.ts';
import { AppError } from '../errors.ts';

export function registerErrorHandlers(app: Hono, logger: Logger): void {
  app.onError((error, c) => {
    const requestId = c.get('requestId');
    if (error instanceof AppError) {
      return c.json({ error: error.code, message: error.message, requestId }, error.status);
    }
    // Exception inattendue = bug : on journalise le détail, le client ne reçoit qu'un message neutre.
    logger.error({ err: error, requestId }, 'erreur non gérée');
    return c.json({ error: 'internal_error', message: 'Une erreur interne est survenue.', requestId }, 500);
  });

  app.notFound(c => c.json({ error: 'not_found', message: 'Ressource introuvable.', requestId: c.get('requestId') }, 404));
}
