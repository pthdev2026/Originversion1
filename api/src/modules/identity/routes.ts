/**
 * Module « identity » — routes HTTP (voir docs/API-CONTRACT.md).
 *
 * Une route fait trois choses : lire et valider la requête, appeler le service, écrire la réponse.
 * Aucune règle métier ici.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { errors } from '../../platform/errors.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { rateLimit } from '../../platform/http/rate-limit.ts';
import { deviceLabel } from './device.ts';
import { requireAdmin, requireUser } from './middleware.ts';
import { clearSessionCookie, writeSessionCookie } from './session-cookie.ts';
import type { IdentityService } from './service.ts';
import type { User } from './repository.ts';

const email = z.string({ required_error: 'Adresse e-mail requise.' }).trim().email('Adresse e-mail invalide.').max(254, 'Adresse e-mail trop longue.');
const password = z.string({ required_error: 'Mot de passe requis.' }).max(128, 'Mot de passe trop long.');

const registerSchema = z.object({
  email,
  password,
  displayName: z.string().trim().min(1).max(60, 'Le nom ne doit pas dépasser 60 caractères.').optional(),
  inviteCode: z.string().trim().max(64).optional(),
});
const code = z.string().trim().min(6).max(24);
const loginSchema = z.object({ email, password, code: code.optional() });
const twoFactorEnableSchema = z.object({ code });
const twoFactorDisableSchema = z.object({ password, code });
const forgotSchema = z.object({ email });
const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
const resetSchema = z.object({ token: z.string().min(20).max(200), password });
const changePasswordSchema = z.object({ currentPassword: password, newPassword: password });
const deleteAccountSchema = z.object({ password });
const invitationSchema = z.object({
  note: z.string().trim().max(120).optional(),
  maxUses: z.number().int().min(1).max(1000).default(1),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

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

/** Ce qu'on expose d'un utilisateur : jamais d'empreinte de mot de passe ni d'état interne. */
export const avatarView = (avatar: User['avatar']) =>
  avatar === null ? null
    : avatar.kind === 'preset' ? { kind: 'preset' as const, preset: avatar.preset }
    : { kind: 'photo' as const, url: `/avatars/${avatar.key}`, zoom: avatar.zoom };

export const publicUser = (user: User) => ({
  id: user.id, email: user.email, displayName: user.displayName, role: user.role, emailVerified: user.emailVerified, twoFactorEnabled: user.twoFactorEnabled,
  createdAt: user.createdAt.toISOString(), locale: user.locale, avatar: avatarView(user.avatar),
});

export interface IdentityRoutesDeps {
  identity: IdentityService;
  cookieSecure: boolean;
  sessionTtlSeconds: number;
  authPerMinute: number;
  clientKey: (c: Context) => string;
}

export function identityRoutes(deps: IdentityRoutesDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const ctx = (c: Context<AppEnv>) => ({ requestId: c.get('requestId') ?? null, device: deviceLabel(c.req.header('user-agent')) });

  // Limite stricte sur tout ce qui touche aux mots de passe : ralentit les essais en série.
  routes.use('/api/auth/*', rateLimit({ windowMs: 60_000, max: deps.authPerMinute, keyOf: c => `auth:${deps.clientKey(c)}` }));

  routes.post('/api/auth/register', async c => {
    const body = await readJson(c, registerSchema);
    const { user, sessionToken } = await deps.identity.register(
      { email: body.email, password: body.password, displayName: body.displayName ?? null, inviteCode: body.inviteCode ?? null },
      ctx(c),
    );
    writeSessionCookie(c, deps.cookieSecure, sessionToken, deps.sessionTtlSeconds);
    return c.json({ user: publicUser(user) }, 201);
  });

  routes.post('/api/auth/login', async c => {
    const body = await readJson(c, loginSchema);
    const { user, sessionToken } = await deps.identity.login(body, ctx(c));
    writeSessionCookie(c, deps.cookieSecure, sessionToken, deps.sessionTtlSeconds);
    return c.json({ user: publicUser(user) });
  });

  routes.post('/api/auth/logout', async c => {
    const user = c.get('user');
    const tokenHash = c.get('sessionTokenHash');
    if (user && tokenHash) await deps.identity.logout(tokenHash, user.id, ctx(c));
    clearSessionCookie(c, deps.cookieSecure);
    return c.body(null, 204);
  });

  // Toujours 202, que l'adresse existe ou non.
  routes.post('/api/auth/password/forgot', async c => {
    const body = await readJson(c, forgotSchema);
    await deps.identity.requestPasswordReset(body.email, ctx(c));
    return c.json({ message: 'Si un compte existe pour cette adresse, un e-mail vient d’être envoyé.' }, 202);
  });

  routes.post('/api/auth/password/reset', async c => {
    const body = await readJson(c, resetSchema);
    await deps.identity.resetPassword({ token: body.token, newPassword: body.password }, ctx(c));
    return c.json({ message: 'Mot de passe mis à jour. Vous pouvez vous connecter.' });
  });

  // Lien reçu par e-mail. Pas besoin d'être connecté (le lien s'ouvre souvent dans un autre navigateur).
  routes.post('/api/auth/email/verify', async c => {
    const body = await readJson(c, verifyEmailSchema);
    await deps.identity.verifyEmail(body.token, ctx(c));
    return c.json({ message: 'Adresse e-mail confirmée.' });
  });

  routes.post('/api/me/email/verification', async c => {
    await deps.identity.resendVerification(requireUser(c).id, ctx(c));
    return c.json({ message: 'Si votre adresse n’est pas encore confirmée, un e-mail vient d’être envoyé.' }, 202);
  });

  // Double authentification (TOTP). Configuration en deux temps : setup (secret) puis enable (premier code).
  routes.post('/api/me/2fa/setup', async c => c.json(await deps.identity.twoFactorSetup(requireUser(c).id, ctx(c))));

  routes.post('/api/me/2fa/enable', async c => {
    const user = requireUser(c);
    const body = await readJson(c, twoFactorEnableSchema);
    const recoveryCodes = await deps.identity.twoFactorEnable(user.id, body.code, ctx(c));
    return c.json({ recoveryCodes });
  });

  routes.post('/api/me/2fa/disable', async c => {
    const user = requireUser(c);
    const body = await readJson(c, twoFactorDisableSchema);
    await deps.identity.twoFactorDisable({ userId: user.id, password: body.password, code: body.code }, ctx(c));
    return c.body(null, 204);
  });

  routes.get('/api/me', c => c.json({ user: publicUser(requireUser(c)) }));

  routes.post('/api/me/password', async c => {
    const user = requireUser(c);
    const body = await readJson(c, changePasswordSchema);
    await deps.identity.changePassword(
      { userId: user.id, currentPassword: body.currentPassword, newPassword: body.newPassword, currentTokenHash: c.get('sessionTokenHash') },
      ctx(c),
    );
    return c.json({ message: 'Mot de passe mis à jour. Vos autres appareils ont été déconnectés.' });
  });

  // Droit à l'effacement (RGPD). Confirmation par mot de passe.
  routes.post('/api/me/delete', async c => {
    const user = requireUser(c);
    const body = await readJson(c, deleteAccountSchema);
    await deps.identity.deleteAccount({ userId: user.id, password: body.password }, ctx(c));
    clearSessionCookie(c, deps.cookieSecure);
    return c.body(null, 204);
  });

  routes.post('/api/admin/invitations', async c => {
    const admin = requireAdmin(c);
    const body = await readJson(c, invitationSchema);
    const code = await deps.identity.createInvitation(
      { createdBy: admin.id, note: body.note ?? null, maxUses: body.maxUses, expiresInDays: body.expiresInDays ?? null },
      ctx(c),
    );
    return c.json({ code }, 201);
  });

  return routes;
}
