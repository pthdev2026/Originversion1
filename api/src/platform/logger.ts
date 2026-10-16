/**
 * Journalisation structurée (JSON, une ligne par événement).
 *
 * Pourquoi du JSON : un outil de supervision peut filtrer et compter ces lignes
 * (« combien d'erreurs 5xx ce soir ? »). En développement, on les rend lisibles.
 * Règle : ne jamais journaliser un secret, un jeton de lecture ni un mot de passe.
 */
import pino, { type Logger } from 'pino';

export type { Logger };

export function createLogger(options: { level: string; pretty: boolean }): Logger {
  return pino({
    level: options.level,
    base: { service: 'origin-api' },
    redact: { paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.newPassword', '*.currentPassword', '*.token', '*.code', '*.secret', '*.recoveryCodes', '*.apiKey'], censor: '[masqué]' },
    ...(options.pretty
      ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' } } }
      : {}),
  });
}
