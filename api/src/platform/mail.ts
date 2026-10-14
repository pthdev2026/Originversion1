/**
 * Envoi d'e-mails (interface minimale, deux implémentations).
 *
 *  - `createLogMailer` : écrit le message dans les journaux. En développement, c'est là qu'on lit le lien de
 *    réinitialisation. En production, le CORPS n'est pas journalisé (il contient un lien secret).
 *  - `createResendMailer` : envoi réel par l'API HTTP de Resend (aucune dépendance, un simple `fetch`).
 *
 * Brancher un autre service = écrire une autre fonction `send`, sans toucher au reste du code.
 */
import type { Logger } from './logger.ts';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export function createLogMailer(logger: Logger, options: { includeBody: boolean } = { includeBody: true }): Mailer {
  return {
    async send(message) {
      logger.info(
        { to: message.to, subject: message.subject, ...(options.includeBody ? { text: message.text } : {}) },
        'e-mail (non envoyé : mode journal)',
      );
    },
  };
}

export interface ResendOptions {
  apiKey: string;
  /** Expéditeur : « ORIGIN <no-reply@votre-domaine> » (le domaine doit être vérifié chez Resend). */
  from: string;
  /** Injectable pour les tests. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createResendMailer(options: ResendOptions): Mailer {
  const doFetch = options.fetch ?? fetch;
  return {
    async send(message) {
      const response = await doFetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: options.from, to: [message.to], subject: message.subject, text: message.text }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });
      if (!response.ok) {
        // Jamais la clé ni le corps du message dans l'erreur : seulement le statut.
        throw new Error(`envoi d'e-mail refusé par le fournisseur (HTTP ${response.status})`);
      }
    },
  };
}
