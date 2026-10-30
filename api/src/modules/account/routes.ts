/** Module « account » — routes HTTP de l'espace personnel (voir docs/API-CONTRACT.md). Toutes exigent un compte, sauf la distribution des photos. */
import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { AppError, errors } from '../../platform/errors.ts';
import { rateLimit } from '../../platform/http/rate-limit.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import type { Sql } from '../../platform/database/client.ts';
import { requireUser } from '../identity/middleware.ts';
import { avatarView, publicUser } from '../identity/routes.ts';
import * as identity from '../identity/repository.ts';
import { foldQuery } from '../catalog/content.ts';
import { preferencesPatchSchema } from './preferences.ts';
import * as repo from './repository.ts';
import { MAX_AVATAR_BYTES, type AccountService } from './service.ts';

const email = z.string({ required_error: 'Adresse e-mail requise.' }).trim().email('Adresse e-mail invalide.').max(254, 'Adresse e-mail trop longue.');
const profileSchema = z.object({
  displayName: z.string().trim().min(1, 'Le nom ne peut pas être vide.').max(60, 'Le nom ne doit pas dépasser 60 caractères.').nullable().optional(),
  locale: z.enum(['fr', 'en']).optional(),
}).strict().refine(value => Object.keys(value).length > 0, { message: 'Rien à modifier.' });
const themesSchema = z.object({ themes: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/)).max(12, '12 thématiques au plus.') }).strict();
const avatarSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('preset'), preset: z.number().int().min(0).max(7) }).strict(),
  z.object({ kind: z.literal('photo'), zoom: z.number().min(1).max(4) }).strict(),
  z.object({ kind: z.literal(null) }).strict(),
]);
const searchSchema = z.object({ q: z.string().trim().min(2, 'Recherche trop courte.').max(80, 'Recherche trop longue.') }).strict();
const emailChangeSchema = z.object({ newEmail: email, password: z.string().max(128) }).strict();
const emailConfirmSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Le code comporte 6 chiffres.') }).strict();

async function readJson<T>(c: Context, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw errors.badRequest('Corps JSON invalide.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw errors.badRequest(parsed.error.issues[0]?.message ?? 'Requête invalide.');
  return parsed.data;
}

export interface AccountRoutesDeps {
  sql: Sql;
  account: AccountService;
  authPerMinute: number;
  clientKey: (c: Context) => string;
}

export function accountRoutes(deps: AccountRoutesDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const ctx = (c: Context<AppEnv>) => ({ requestId: c.get('requestId') ?? null });
  /** Relit l'utilisateur après modification : la réponse reflète toujours l'état réel. */
  const fresh = async (id: string) => {
    const user = await identity.findUserById(deps.sql, id);
    if (!user) throw errors.notFound('Compte introuvable.');
    return publicUser(user);
  };

  // ---- Profil ---------------------------------------------------------------------------------------------------------
  routes.patch('/api/me', async c => {
    const user = requireUser(c);
    const body = await readJson(c, profileSchema);
    await repo.updateProfile(deps.sql, user.id, { ...(body.displayName !== undefined ? { displayName: body.displayName } : {}), ...(body.locale ? { locale: body.locale } : {}) });
    return c.json({ user: await fresh(user.id) });
  });

  // ---- Préférences ----------------------------------------------------------------------------------------------------
  routes.get('/api/me/preferences', async c => c.json({ preferences: await repo.getPreferences(deps.sql, requireUser(c).id) }));

  routes.put('/api/me/preferences', async c => {
    const user = requireUser(c);
    const patch = await readJson(c, preferencesPatchSchema);
    const merged = { ...(await repo.getPreferences(deps.sql, user.id)), ...patch };
    await repo.savePreferences(deps.sql, user.id, merged);
    return c.json({ preferences: merged });
  });

  // ---- Appareils connectés --------------------------------------------------------------------------------------------
  routes.get('/api/me/sessions', async c => {
    const user = requireUser(c);
    const current = c.get('sessionTokenHash');
    const sessions = await repo.listDeviceSessions(deps.sql, user.id);
    return c.json({
      sessions: sessions.map(session => ({
        id: session.id, device: session.device, current: session.tokenHash === current,
        createdAt: session.createdAt.toISOString(), lastSeenAt: session.lastSeenAt.toISOString(),
      })),
    });
  });

  routes.post('/api/me/sessions/revoke-others', async c => {
    const user = requireUser(c);
    return c.json({ revoked: await repo.revokeOtherDevices(deps.sql, user.id, c.get('sessionTokenHash')) });
  });

  routes.delete('/api/me/sessions/:id', async c => {
    const user = requireUser(c);
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw errors.badRequest('Identifiant invalide.');
    const result = await repo.revokeDevice(deps.sql, user.id, id, c.get('sessionTokenHash'));
    if (result === 'missing') throw errors.notFound('Appareil introuvable.');
    if (result === 'current') throw new AppError('conflict', 409, 'C’est l’appareil en cours : utilisez « Se déconnecter ».');
    return c.body(null, 204);
  });

  // ---- Thématiques préférées ------------------------------------------------------------------------------------------
  routes.get('/api/me/themes', async c => c.json({ themes: await repo.listUserThemes(deps.sql, requireUser(c).id) }));

  routes.put('/api/me/themes', async c => {
    const user = requireUser(c);
    const body = await readJson(c, themesSchema);
    const themes = [...new Set(body.themes)];
    const unknown = await repo.replaceUserThemes(deps.sql, user.id, themes);
    if (unknown.length > 0) throw errors.badRequest(`Thématiques inconnues : ${unknown.join(', ')}.`);
    return c.json({ themes });
  });

  // ---- Photo de profil ------------------------------------------------------------------------------------------------
  // Réglage (avatar prédéfini, recadrage, retrait) : JSON. L'envoi d'une photo (octets) passe par /files/me/avatar (pas de limite de 64 Ko).
  routes.put('/api/me/avatar', async c => {
    const user = requireUser(c);
    const body = await readJson(c, avatarSchema);
    if (body.kind === 'preset') await deps.account.setPreset(user.id, body.preset);
    else if (body.kind === 'photo') {
      if (!(await repo.setAvatarZoom(deps.sql, user.id, body.zoom))) throw errors.badRequest('Aucune photo à recadrer : envoyez d’abord une photo.');
    } else await deps.account.clearAvatar(user.id);
    return c.json({ avatar: avatarView((await identity.findUserById(deps.sql, user.id))?.avatar ?? null) });
  });

  routes.put(
    '/files/me/avatar',
    bodyLimit({ maxSize: MAX_AVATAR_BYTES, onError: () => { throw errors.tooLarge('Photo trop volumineuse (5 Mo au plus).'); } }),
    async c => {
      const user = requireUser(c);
      await deps.account.savePhoto(user.id, new Uint8Array(await c.req.arrayBuffer()));
      return c.json({ avatar: avatarView((await identity.findUserById(deps.sql, user.id))?.avatar ?? null) }, 201);
    },
  );

  // Distribution publique (balise <img>) : la clé de 128 bits n'est pas devinable, et change à chaque nouvelle photo (cache long sûr).
  routes.get('/avatars/:file', async c => {
    const target = deps.account.avatarPath(c.req.param('file'));
    if (!target) throw errors.notFound();
    let bytes: Buffer;
    try {
      bytes = await readFile(target);
    } catch {
      throw errors.notFound();
    }
    const type = target.endsWith('.png') ? 'image/png' : target.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
    });
  });

  // ---- Changement d'adresse e-mail ------------------------------------------------------------------------------------
  routes.use('/api/me/email/change', rateLimit({ windowMs: 60_000, max: deps.authPerMinute, keyOf: c => `email-change:${deps.clientKey(c)}` }));
  routes.use('/api/me/email/change/confirm', rateLimit({ windowMs: 60_000, max: deps.authPerMinute, keyOf: c => `email-confirm:${deps.clientKey(c)}` }));

  routes.post('/api/me/email/change', async c => {
    const user = requireUser(c);
    const body = await readJson(c, emailChangeSchema);
    await deps.account.requestEmailChange(user, body, ctx(c));
    return c.json({ message: 'Si cette adresse peut être utilisée, un code à 6 chiffres vient d’y être envoyé (valable 15 minutes).' }, 202);
  });

  routes.post('/api/me/email/change/confirm', async c => {
    const user = requireUser(c);
    const body = await readJson(c, emailConfirmSchema);
    await deps.account.confirmEmailChange(user, body.code, c.get('sessionTokenHash'), ctx(c));
    return c.json({ user: await fresh(user.id) });
  });

  // ---- Dernières recherches (comme l'historique de visionnage, désactivées avec lui) -----------------------------------------
  routes.get('/api/me/searches', async c => {
    const user = requireUser(c);
    const items = (await repo.isHistoryEnabled(deps.sql, user.id)) ? await repo.listSearches(deps.sql, user.id, 10) : [];
    return c.json({ searches: items });
  });

  // Appelé par le front quand la personne VALIDE une recherche (pas à chaque lettre). Historique désactivé : rien n'est gardé.
  routes.post('/api/me/searches', async c => {
    const user = requireUser(c);
    const { q } = await readJson(c, searchSchema);
    const folded = foldQuery(q).join(' ');
    if (folded.length >= 2 && (await repo.isHistoryEnabled(deps.sql, user.id))) await repo.rememberSearch(deps.sql, user.id, folded, q);
    return c.body(null, 204);
  });

  routes.delete('/api/me/searches', async c => {
    await repo.clearSearches(deps.sql, requireUser(c).id);
    return c.body(null, 204);
  });

  routes.delete('/api/me/searches/item', async c => {
    const user = requireUser(c);
    const { q } = await readJson(c, searchSchema);
    await repo.forgetSearch(deps.sql, user.id, foldQuery(q).join(' '));
    return c.body(null, 204);
  });

  return routes;
}
