/**
 * Module « contact » — formulaire « Nous contacter ».
 *  - Public (avec ou sans compte), strictement limité : 5 messages par heure et par adresse IP.
 *  - Piège à robots : un champ caché `website` doit rester vide ; rempli, le message est ignoré SANS le dire (réponse identique).
 *  - Le message est conservé (consultable par l'administration) et signalé par e-mail à `SUPPORT_EMAIL` si configuré.
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';
import type { Logger } from '../../platform/logger.ts';
import type { Mailer } from '../../platform/mail.ts';
import { rateLimit } from '../../platform/http/rate-limit.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { requireAdmin } from '../identity/middleware.ts';
import { insertContactMessage, listContactMessages, markHandled } from './repository.ts';

const schema = z.object({
  name: z.string({ required_error: 'Votre nom est requis.' }).trim().min(1, 'Votre nom est requis.').max(100, 'Nom trop long.'),
  email: z.string({ required_error: 'Votre adresse e-mail est requise.' }).trim().email('Adresse e-mail invalide.').max(254),
  topic: z.enum(['general', 'account', 'playback', 'content', 'press', 'other']).default('general'),
  message: z.string({ required_error: 'Votre message est requis.' }).trim().min(10, 'Votre message est trop court (10 caractères au moins).').max(4000, 'Message trop long (4 000 caractères au plus).'),
  /** Champ caché du formulaire : un humain ne le remplit jamais. */
  website: z.string().max(200).optional(),
}).strict();

export interface ContactRoutesDeps {
  sql: Sql;
  logger: Logger;
  mailer: Mailer;
  /** Adresse qui reçoit un signalement à chaque message. Absente : les messages sont seulement conservés. */
  supportEmail: string | null;
  clientKey: (c: Context) => string;
  /** Messages autorisés par heure et par adresse IP (défaut 5). */
  perHour?: number;
}

export function contactRoutes(deps: ContactRoutesDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('/api/contact', rateLimit({ windowMs: 60 * 60_000, max: deps.perHour ?? 5, keyOf: c => `contact:${deps.clientKey(c)}` }));

  routes.post('/api/contact', async c => {
    let raw: unknown;
    try { raw = await c.req.json(); } catch { throw errors.badRequest('Corps JSON invalide.'); }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw errors.badRequest(parsed.error.issues[0]?.message ?? 'Requête invalide.');
    const answer = c.json({ message: 'Merci, votre message a bien été envoyé. Nous vous répondrons dès que possible.' }, 202);
    if (parsed.data.website) return answer; // robot : on fait semblant que tout va bien

    const { name, email, topic, message } = parsed.data;
    await insertContactMessage(deps.sql, { id: randomUUID(), name, email: email.toLowerCase(), topic, message, userId: c.get('user')?.id ?? null });
    if (deps.supportEmail) {
      void deps.mailer
        .send({ to: deps.supportEmail, subject: `Contact ORIGIN (${topic}) — ${name}`, text: `De : ${name} <${email}>\nSujet : ${topic}\n\n${message}` })
        .catch(error => deps.logger.error({ err: error }, 'signalement du message de contact non envoyé'));
    }
    return answer;
  });

  routes.get('/api/admin/contact', async c => {
    requireAdmin(c);
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 50) || 50, 1), 200);
    const status = c.req.query('status');
    if (status !== undefined && status !== 'new' && status !== 'handled') throw errors.badRequest('Statut invalide (new ou handled).');
    const messages = await listContactMessages(deps.sql, limit, status);
    return c.json({
      messages: messages.map(item => ({
        id: item.id, name: item.name, email: item.email, topic: item.topic, message: item.message, status: item.status,
        createdAt: item.createdAt.toISOString(), handledAt: item.handledAt?.toISOString() ?? null, hasAccount: item.userId !== null,
      })),
    });
  });

  routes.post('/api/admin/contact/:id/handled', async c => {
    requireAdmin(c);
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw errors.badRequest('Identifiant invalide.');
    if (!(await markHandled(deps.sql, id))) throw errors.notFound('Message introuvable ou déjà traité.');
    return c.body(null, 204);
  });

  return routes;
}
