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
import { newRecoveryCode, openSecret, otpauthUrl, generateSecret, sealSecret, stepAt, verifyTotp } from './totp.ts';
import { checkPasswordPolicy, dummyPasswordHash, hashPassword, verifyPassword } from './password.ts';
import * as repo from './repository.ts';
import type { ActiveSession, User } from './repository.ts';

export interface IdentityConfig {
  registrationMode: 'open' | 'invite';
  sessionTtlSeconds: number;
  publicAppUrl: string;
  /**
   * Clé de chiffrement des secrets de double authentification (AUTH_ENCRYPTION_KEY).
   * `undefined` : clé de développement intégrée (tests, poste local) ; `null` : double authentification indisponible.
   */
  encryptionKey?: string | null;
}

/** Valeur de développement uniquement : ne protège rien en production (qui exige AUTH_ENCRYPTION_KEY). */
const DEV_ENCRYPTION_KEY = 'origin-dev-only-encryption-key-not-secret';

export interface RequestContext {
  requestId: string | null;
  /** Libellé approximatif de l'appareil (« Chrome · macOS »), jamais l'agent utilisateur brut ni l'adresse IP. */
  device?: string | null;
}

const MAX_LOGIN_FAILURES = 5;
const LOCK_SECONDS = 15 * 60;
const RESET_TTL_SECONDS = 60 * 60;
const VERIFY_TTL_SECONDS = 24 * 60 * 60;
const VERIFY_RESEND_COOLDOWN_MS = 60 * 1000;
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

export function createIdentityService(deps: {
  sql: Sql; config: IdentityConfig; mailer: Mailer; logger: Logger;
  /** Appelé APRÈS la suppression d'un compte : nettoyage de ce qui vit hors de la base (photo de profil). Un échec est journalisé, jamais bloquant. */
  afterAccountDeleted?: (info: { userId: string; avatarKey: string | null }) => Promise<void>;
}) {
  const { sql, config, mailer, logger } = deps;

  async function audit(userId: string | null, event: string, ctx: RequestContext, details?: Record<string, unknown>): Promise<void> {
    try {
      await repo.insertAudit(sql, { userId, event, requestId: ctx.requestId, ...(details ? { details } : {}) });
    } catch (error) {
      // Le journal d'audit ne doit jamais faire échouer l'action de l'utilisateur.
      logger.error({ err: error, event }, 'écriture du journal d’audit impossible');
    }
  }

  async function startSession(userId: string, device: string | null = null): Promise<string> {
    const token = newToken();
    await repo.insertSession(sql, {
      tokenHash: sha256(token),
      userId,
      device,
      expiresAt: new Date(Date.now() + config.sessionTtlSeconds * 1000),
    });
    return token;
  }

  /** Envoie le lien de vérification. Sans attendre et sans jamais échouer vers l'appelant (voir requestPasswordReset). */
  async function sendVerification(user: User): Promise<void> {
    const token = newToken();
    await repo.insertEmailVerification(sql, {
      tokenHash: sha256(token), userId: user.id, email: user.email, expiresAt: new Date(Date.now() + VERIFY_TTL_SECONDS * 1000),
    });
    void mailer
      .send({
        to: user.email,
        subject: 'Confirmez votre adresse e-mail ORIGIN',
        text: `Bienvenue sur ORIGIN. Pour confirmer votre adresse (lien valable 24 heures) : ${config.publicAppUrl}/verifier-email?token=${token}\n\nSi vous n'êtes pas à l'origine de cette inscription, ignorez ce message.`,
      })
      .catch(error => logger.error({ err: error, userId: user.id }, 'e-mail de vérification non envoyé'));
  }

  /** Alerte de sécurité : connexion depuis un appareil jamais vu sur un compte qui en avait déjà. Ne bloque ni n'échoue jamais la connexion. */
  async function alertIfNewDevice(user: User, device: string | null): Promise<void> {
    if (!device) return;
    try {
      const { isNew, hadOthers } = await repo.touchLoginDevice(sql, user.id, device);
      if (!isNew || !hadOthers) return;
      void mailer
        .send({
          to: user.email,
          subject: 'Nouvelle connexion à votre compte ORIGIN',
          text: `Une connexion à votre compte vient d'avoir lieu depuis un nouvel appareil : ${device}.\n\nSi c'est vous, vous n'avez rien à faire. Sinon, changez votre mot de passe : ${config.publicAppUrl}/reinitialiser, puis déconnectez les autres appareils depuis votre espace.`,
        })
        .catch(error => logger.error({ err: error, userId: user.id }, 'alerte de nouvelle connexion non envoyée'));
    } catch (error) {
      logger.error({ err: error, userId: user.id }, 'appareil de connexion non enregistré');
    }
  }

  const encryptionKey = (): string => {
    const key = config.encryptionKey === undefined ? DEV_ENCRYPTION_KEY : config.encryptionKey;
    if (!key) throw new AppError('unavailable', 503, 'La double authentification n’est pas configurée sur ce serveur (AUTH_ENCRYPTION_KEY).');
    return key;
  };

  /** Vérifie un code de double authentification (TOTP, sinon code de secours). Un TOTP ne sert qu'une fois. */
  async function checkSecondFactor(userId: string, code: string): Promise<boolean> {
    const totp = await repo.findTotp(sql, userId);
    if (!totp?.enabledAt) return false;
    const trimmed = code.trim();
    if (/^\d{6}$/.test(trimmed)) {
      const step = verifyTotp(openSecret(encryptionKey(), totp.secretEnc), trimmed, Date.now());
      return step !== null && (await repo.advanceTotpStep(sql, userId, step));
    }
    return repo.consumeRecoveryCode(sql, userId, sha256(trimmed.toLowerCase()));
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
      await sendVerification(user).catch(error => logger.error({ err: error, userId: user.id }, 'jeton de vérification non créé'));
      if (ctx.device) await repo.touchLoginDevice(sql, user.id, ctx.device).catch(() => undefined);
      return { user, sessionToken: await startSession(user.id, ctx.device ?? null) };
    },

    async login(input: { email: string; password: string; code?: string | undefined }, ctx: RequestContext): Promise<AuthResult> {
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

      // Deuxième facteur. Un code absent n'est pas un échec (le front affiche le champ) ; un code faux en est un.
      if (found.twoFactorEnabled) {
        if (!input.code) throw new AppError('two_factor_required', 401, 'Saisissez le code de votre application d’authentification.');
        if (!(await checkSecondFactor(found.id, input.code))) {
          const { locked } = await repo.recordLoginFailure(sql, found.id, MAX_LOGIN_FAILURES, LOCK_SECONDS);
          await audit(found.id, locked ? 'account_locked' : 'login_failure', ctx, { reason: 'second_factor' });
          throw new AppError('unauthorized', 401, 'Code de vérification incorrect.');
        }
      }

      await repo.recordLoginSuccess(sql, found.id);
      await audit(found.id, 'login_success', ctx);
      await alertIfNewDevice(found, ctx.device ?? null);
      const { passwordHash: _hash, failedLoginCount: _count, lockedUntil: _locked, ...user } = found;
      return { user, sessionToken: await startSession(found.id, ctx.device ?? null) };
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

    // ── Double authentification ──────────────────────────────────────────────────────────────────────────

    /** Étape 1 : génère un secret (non actif) à scanner dans l'application d'authentification. */
    async twoFactorSetup(userId: string, ctx: RequestContext): Promise<{ secret: string; otpauthUrl: string }> {
      const user = await repo.findUserById(sql, userId);
      if (!user) throw errors.unauthorized();
      const secret = generateSecret();
      const stored = await repo.upsertPendingTotp(sql, userId, sealSecret(encryptionKey(), secret));
      if (!stored) throw new AppError('conflict', 409, 'La double authentification est déjà activée. Désactivez-la d’abord pour la reconfigurer.');
      await audit(userId, 'two_factor_setup_started', ctx);
      return { secret, otpauthUrl: otpauthUrl({ secret, email: user.email, issuer: 'ORIGIN' }) };
    },

    /** Étape 2 : confirme avec un premier code ; retourne les codes de secours (affichés UNE seule fois). */
    async twoFactorEnable(userId: string, code: string, ctx: RequestContext): Promise<string[]> {
      const totp = await repo.findTotp(sql, userId);
      if (!totp || totp.enabledAt) throw errors.badRequest('Aucun enrôlement en cours. Recommencez la configuration.');
      const step = verifyTotp(openSecret(encryptionKey(), totp.secretEnc), code.trim(), Date.now());
      if (step === null) throw errors.badRequest('Code incorrect. Vérifiez l’heure de votre téléphone et réessayez.');
      const codes = Array.from({ length: 8 }, () => newRecoveryCode());
      await sql.begin(async tx => {
        await repo.advanceTotpStep(tx, userId, step);
        await repo.enableTotp(tx, userId, codes.map(value => sha256(value)));
      });
      await audit(userId, 'two_factor_enabled', ctx);
      return codes;
    },

    /** Désactivation : mot de passe ET un code (TOTP ou secours). */
    async twoFactorDisable(input: { userId: string; password: string; code: string }, ctx: RequestContext): Promise<void> {
      const user = await repo.findUserById(sql, input.userId);
      if (!user || !(await verifyPassword(input.password, user.passwordHash))) throw new AppError('unauthorized', 401, 'Mot de passe incorrect.');
      if (!user.twoFactorEnabled) return;
      if (!(await checkSecondFactor(user.id, input.code))) throw new AppError('unauthorized', 401, 'Code de vérification incorrect.');
      await repo.disableTotp(sql, user.id);
      await audit(user.id, 'two_factor_disabled', ctx);
    },

    async recoveryCodesLeft(userId: string): Promise<number> {
      return repo.countRecoveryCodes(sql, userId);
    },

    /** Confirme l'adresse avec le lien reçu. Jeton invalide, expiré ou déjà utilisé : 400. */
    async verifyEmail(token: string, ctx: RequestContext): Promise<void> {
      const userId = await repo.consumeEmailVerification(sql, sha256(token));
      if (!userId) throw errors.badRequest('Ce lien de confirmation est invalide ou expiré.');
      await audit(userId, 'email_verified', ctx);
    },

    /** Renvoie un lien (au plus un par minute). Sans effet si l'adresse est déjà confirmée. */
    async resendVerification(userId: string, ctx: RequestContext): Promise<void> {
      const user = await repo.findUserById(sql, userId);
      if (!user || user.emailVerified) return;
      const last = await repo.lastEmailVerificationAt(sql, userId);
      if (last && Date.now() - last.getTime() < VERIFY_RESEND_COOLDOWN_MS) {
        throw new AppError('rate_limited', 429, 'Un e-mail vient d’être envoyé. Patientez une minute avant d’en demander un autre.');
      }
      await sendVerification(user);
      await audit(userId, 'email_verification_resent', ctx);
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
      // Envoi « sans attendre » et sans jamais échouer vers l'appelant : la réponse (et son délai) doit être la même
      // que l'adresse existe ou non, et une panne du fournisseur d'e-mails ne doit pas révéler qu'un compte existe.
      void mailer
        .send({
          to: user.email,
          subject: 'Réinitialisation de votre mot de passe ORIGIN',
          text: `Pour choisir un nouveau mot de passe (lien valable 1 heure) : ${config.publicAppUrl}/reinitialiser?token=${token}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
        })
        .catch(error => logger.error({ err: error, userId: user.id }, 'e-mail de réinitialisation non envoyé'));
    },

    async resetPassword(input: { token: string; newPassword: string }, ctx: RequestContext): Promise<void> {
      const tokenHash = sha256(input.token);
      const policyError = checkPasswordPolicy(input.newPassword, '');
      if (policyError) throw errors.badRequest(policyError);
      const passwordHash = await hashPassword(input.newPassword);

      const userId = await repo.consumePasswordReset(sql, tokenHash);
      if (!userId) throw errors.badRequest('Ce lien de réinitialisation est invalide ou expiré.');

      await repo.updatePassword(sql, userId, passwordHash);
      await repo.markEmailVerified(sql, userId); // avoir reçu le lien de réinitialisation prouve le contrôle de l'adresse
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
      await deps.afterAccountDeleted?.({ userId: user.id, avatarKey: user.avatar?.kind === 'photo' ? user.avatar.key : null })
        .catch(error => logger.error({ err: error }, 'nettoyage après suppression de compte incomplet'));
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
