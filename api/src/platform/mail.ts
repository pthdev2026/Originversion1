/**
 * Envoi d'e-mails (interface minimale).
 *
 * Pour l'instant, l'implémentation écrit le message dans les journaux : en développement, c'est là
 * qu'on lit le lien de réinitialisation. Brancher un vrai service (SMTP, Resend…) = écrire une autre
 * fonction `send`, sans toucher au reste du code.
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

export function createLogMailer(logger: Logger): Mailer {
  return {
    async send(message) {
      logger.info({ to: message.to, subject: message.subject, text: message.text }, 'e-mail (non envoyé : mode journal)');
    },
  };
}
