/**
 * Module « identity » — règles métier des comptes.
 *
 * Ce fichier décide ; il ne connaît ni HTTP ni cookies. Les principes appliqués :
 *  - un message d'échec UNIQUE à la connexion (on ne révèle pas si l'adresse existe) ;
 *  - le même temps de calcul que l'adresse existe ou non (empreinte factice) ;
 *  - verrouillage temporaire après des échecs répétés ;
 *  - un jeton de session aléatoire de 256 bits, stocké uniquement sous forme d'empreinte ;
 *  - toute action sensible est inscrite au journal d'audit, sans donnée personnelle superflue.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Sql } from '../../platform/database/client.ts';
import { AppError, errors } from '../../platform/errors.ts';
import type { Logger } from '../../platform/logger.ts';
import type { Mailer } from '../../platform/mail.ts';
import { checkPasswordPolicy, dummyPasswordHash, hashPassword, verifyPassword } from './password.ts';
import * as repo from './repository.ts';
import type { ActiveSession, User } from './repository.ts';

export interface IdentityConfig {
  registrationMode: 'open' | 'invite';
  sessionTtlSeconds: number;
  publicAppUrl: string;
}

export interface RequestContext {
  requestId: string | null;
}

const MAX_LOGIN_FAILURES = 5;
const LOCK_SECONDS = 15 * 60;
const RESET_TTL_SECONDS = 60 * 60;
const SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000;
const GENERIC_LOGIN_ERROR = 'Adresse e-mail ou mot de passe incorrect.';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const newToken = (): string => randomBytes(32).toString('base64url');

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export interface AuthResult {
  user: User;
  /** Jeton de session en clair : à placer dans le cookie, jamais à stocker ni à journaliser. */
  sessionToken: string;
}

export function createIdentityService(deps: { sql: Sql; config: IdentityConfig; mailer: Mailer; logger: Logger }) {
  const { sql, config, mailer, logger } = deps;

  async function audit(userId: string | null, event: string, ctx: RequestContext, details?: Record<string, unknown>): Promise<void> {
    try {
      await repo.insertAudit(sql, { userId, event, requestId: ctx.requestId, ...(details ? { details } : {}) });
    } catch (error) {
      // Le journal d'audit ne doit jamais faire échouer l'action de l'utilisateur.
      logger.error({ err: error, event }, 'écriture du journal d’audit impossible');
    }
  }

  async function startSession(userId: string): Promise<string> {
    const token = newToken();
    await repo.insertSession(sql, {
      tokenHash: sha256(token),
      userId,
      expiresAt: new Date(Date.now() + config.sessionTtlSeconds * 1000),
    });
    return token;
  }

  return {
    async register(
      input: { email: string; password: string; displayName: string | null; inviteCode: string | null },
      ctx: RequestContext,
    ): Promise<AuthResult> {
      const email = normalizeEmail(input.email);
      const policyError = checkPasswordPolicy(input.password, email);
      if (policyError) throw errors.badRequest(policyError);

      const passwordHash = await hashPassword(input.password);
      const user = await sql.begin(async tx => {
        if (config.registrationMode === 'invite') {
          const ok = input.inviteCode ? await repo.consumeInvitation(tx, sha256(input.inviteCode.trim())) : false;
          if (!ok) throw new AppError('forbidden', 403, 'Un code d’invitation valide est nécessaire pour créer un compte.');
        }
        const created = await repo.insertUser(tx, { id: randomUUID(), email, passwordHash, displayName: input.displayName, role: 'viewer' });
        if (!created) throw new AppError('conflict', 409, 'Un compte existe déjà avec cette adresse e-mail.');
        return created;
      });

      await audit(user.id, 'register', ctx);
      return { user, sessionToken: await startSession(user.id) };
    },

    async login(input: { email: string; password: string }, ctx: RequestContext): Promise<AuthResult> {
      const email = normalizeEmail(input.email);
      const found = await repo.findUserByEmail(sql, email);

      if (!found || found.status !== 'active') {
        // Même durée de calcul qu'un vrai compte : le temps de réponse ne révèle rien.
        await verifyPassword(input.password, await dummyPasswordHash());
        await audit(null, 'login_failure', ctx, { reason: found ? 'disabled' : 'unknown' });
        throw new AppError('unauthorized', 401, GENERIC_LOGIN_ERROR);
      }

      if (found.lockedUntil && found.lockedUntil > new Date()) {
        await audit(found.id, 'login_blocked', ctx);
        throw new AppError('rate_limited', 429, 'Compte temporairement verrouillé après plusieurs tentatives. Réessayez dans quelques minutes.');
      }

      if (!(await verifyPassword(input.password, found.passwordHash))) {
        const { locked } = await repo.recordLoginFailure(sql, found.id, MAX_LOGIN_FAILURES, LOCK_SECONDS);
        await audit(found.id, locked ? 'account_locked' : 'login_failure', ctx);
        throw new AppError('unauthorized', 401, GENERIC_LOGIN_ERROR);
      }

      await repo.recordLoginSuccess(sql, found.id);
      await audit(found.id, 'login_success', ctx);
      const { passwordHash: _hash, failedLoginCount: _count, lockedUntil: _locked, ...user } = found;
      return { user, sessionToken: await startSession(found.id) };
    },

    /** Retrouve la session d'un jeton de cookie, et la prolonge au plus une fois par jour. */
    async authenticate(token: string): Promise<{ session: ActiveSession; tokenHash: string } | null> {
      const tokenHash = sha256(token);
      const session = await repo.findActiveSession(sql, tokenHash);
      if (!session) return null;
      if (Date.now() - session.lastSeenAt.getTime() > SESSION_RENEW_AFTER_MS) {
        await repo.touchSession(sql, tokenHash, new Date(Date.now() + config.sessionTtlSeconds * 1000));
      }
      return { session, tokenHash };
    },

    async logout(tokenHash: string, userId: string, ctx: RequestContext): Promise<void> {
      await repo.revokeSession(sql, tokenHash);
      await audit(userId, 'logout', ctx);
    },

    /** Réponse identique que l'adresse existe ou non : on ne permet pas de deviner qui a un compte. */
    async requestPasswordReset(emailInput: string, ctx: RequestContext): Promise<void> {
      const user = await repo.findUserByEmail(sql, normalizeEmail(emailInput));
      if (!user || user.status !== 'active') return;
      const token = newToken();
      await repo.insertPasswordReset(sql, {
        tokenHash: sha256(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TTL_SECONDS * 1000),
      });
      await audit(user.id, 'password_reset_requested', ctx);
      await mailer.send({
        to: user.email,
        subject: 'Réinitialisation de votre mot de passe ORIGIN',
        text: `Pour choisir un nouveau mot de passe (lien valable 1 heure) : ${config.publicAppUrl}/reinitialiser?token=${token}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
      });
    },

    async resetPassword(input: { token: string; newPassword: string }, ctx: RequestContext): Promise<void> {
      const tokenHash = sha256(input.token);
      const policyError = checkPasswordPolicy(input.newPassword, '');
      if (policyError) throw errors.badRequest(policyError);
      const passwordHash = await hashPassword(input.newPassword);

      const userId = await repo.consumePasswordReset(sql, tokenHash);
      if (!userId) throw errors.badRequest('Ce lien de réinitialisation est invalide ou expiré.');

      await repo.updatePassword(sql, userId, passwordHash);
      await repo.revokeUserSessions(sql, userId); // toute session existante est coupée
      await audit(userId, 'password_reset_done', ctx);
    },

    async changePassword(
      input: { userId: string; currentPassword: string; newPassword: string; currentTokenHash: string | null },
      ctx: RequestContext,
    ): Promise<void> {
      const user = await repo.findUserById(sql, input.userId);
      if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
        throw new AppError('unauthorized', 401, 'Mot de passe actuel incorrect.');
      }
      const policyError = checkPasswordPolicy(input.newPassword, user.email);
      if (policyError) throw errors.badRequest(policyError);

      await repo.updatePassword(sql, user.id, await hashPassword(input.newPassword));
      await repo.revokeUserSessions(sql, user.id, input.currentTokenHash ?? undefined); // les AUTRES appareils sont déconnectés
      await audit(user.id, 'password_change', ctx);
    },

    /** Droit à l'effacement (RGPD) : supprime le compte, ses sessions ; le journal d'audit est anonymisé. */
    async deleteAccount(input: { userId: string; password: string }, ctx: RequestContext): Promise<void> {
      const user = await repo.findUserById(sql, input.userId);
      if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
        throw new AppError('unauthorized', 401, 'Mot de passe incorrect.');
      }
      await audit(null, 'account_deleted', ctx);
      await repo.deleteUser(sql, user.id);
    },

    /** Crée un code d'invitation. Le code en clair n'est retourné qu'une fois ; la base n'en garde que l'empreinte. */
    async createInvitation(input: { createdBy: string | null; note: string | null; maxUses: number; expiresInDays: number | null }, ctx: RequestContext): Promise<string> {
      const code = randomBytes(9).toString('base64url');
      await repo.insertInvitation(sql, {
        codeHash: sha256(code),
        createdBy: input.createdBy,
        note: input.note,
        maxUses: input.maxUses,
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
      });
      await audit(input.createdBy, 'invitation_created', ctx, { maxUses: input.maxUses });
      return code;
    },

    /** Entretien : à appeler périodiquement. */
    purgeSessions: () => repo.purgeSessions(sql),
  };
}

export type IdentityService = ReturnType<typeof createIdentityService>;
