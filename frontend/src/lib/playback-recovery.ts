// Politique de reprise après une erreur fatale du lecteur. Fonction pure : testée sans navigateur.

export const MAX_NETWORK_RETRIES = 3;
export const MAX_MEDIA_RECOVERIES = 2;
const BASE_RETRY_DELAY_MS = 500;

export type PlaybackFailureKind = 'expired' | 'network' | 'media' | 'unsupported';

export interface FatalErrorContext {
  type: 'network' | 'media' | 'other';
  /** Statut HTTP de la réponse en cause, quand le lecteur le fournit. */
  httpStatus?: number | undefined;
  networkRetries: number;
  mediaRecoveries: number;
  /** Un nouveau lien a déjà été demandé depuis la dernière lecture réussie. */
  refreshed: boolean;
}

export type RecoveryAction =
  | { action: 'refresh' }
  | { action: 'retry'; delayMs: number }
  | { action: 'recover-media' }
  | { action: 'fail'; kind: PlaybackFailureKind };

export function nextRecovery(context: FatalErrorContext): RecoveryAction {
  if (context.type === 'network') {
    // 401/403 : le jeton est invalide ou expiré. Un seul nouveau lien est demandé, puis on s'arrête.
    if (context.httpStatus === 401 || context.httpStatus === 403) {
      return context.refreshed ? { action: 'fail', kind: 'expired' } : { action: 'refresh' };
    }
    if (context.networkRetries < MAX_NETWORK_RETRIES) {
      return { action: 'retry', delayMs: BASE_RETRY_DELAY_MS * 2 ** context.networkRetries };
    }
    return { action: 'fail', kind: 'network' };
  }
  if (context.type === 'media') {
    return context.mediaRecoveries < MAX_MEDIA_RECOVERIES ? { action: 'recover-media' } : { action: 'fail', kind: 'media' };
  }
  return { action: 'fail', kind: 'unsupported' };
}
