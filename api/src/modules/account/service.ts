/**
 * Module « account » — règles de l'espace personnel : changement d'adresse e-mail par code, photo de profil.
 *
 * Principes (mêmes que pour la réinitialisation du mot de passe) :
 *  - le changement d'adresse exige le mot de passe ET la preuve de contrôle de la NOUVELLE adresse (code à 6 chiffres) ;
 *  - la réponse ne révèle jamais si une adresse est déjà utilisée par un autre compte ;
 *  - 5 essais au plus, 15 minutes ; le code n'est stocké que sous forme d'empreinte ;
 *  - l'ancienne adresse est prévenue (c'est elle qui permet de réagir à un vol de compte) ;
 *  - une photo remplacée ou supprimée disparaît du disque (donnée personnelle).
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Sql } from '../../platform/database/client.ts';
import { AppError, errors } from '../../platform/errors.ts';
import type { Logger } from '../../platform/logger.ts';
import type { Mailer } from '../../platform/mail.ts';
import type { AuthenticatedUser } from '../../platform/http/types.ts';
import { detectImageFormat } from '../../platform/storage/image-format.ts';
import { resolveInside, type StorageLayout } from '../../platform/storage/layout.ts';
import { verifyPassword } from '../identity/password.ts';
import * as identity from '../identity/repository.ts';
import * as repo from './repository.ts';

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const EMAIL_CHANGE_TTL_MS = 15 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const AVATAR_FILE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

const hashCode = (userId: string, code: string): string => createHash('sha256').update(`${userId}:${code}`).digest('hex');
const sameHash = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export interface AccountContext {
  requestId: string | null;
}

export type AccountService = ReturnType<typeof createAccountService>;

export function createAccountService(deps: { sql: Sql; logger: Logger; mailer: Mailer; storage: StorageLayout }) {
  const { sql, logger, mailer, storage } = deps;

  const avatarPath = (file: string): string | null => (AVATAR_FILE.test(file) ? resolveInside(storage.avatarsRoot, file) : null);
  const removeAvatarFile = async (key: string | null): Promise<void> => {
    const target = key ? avatarPath(key) : null;
    if (target) await rm(target, { force: true });
  };
  const send = (message: { to: string; subject: string; text: string }) =>
    void mailer.send(message).catch(error => logger.error({ err: error }, 'e-mail du compte non envoyé'));

  async function audit(userId: string, event: string, ctx: AccountContext): Promise<void> {
    try {
      await identity.insertAudit(sql, { userId, event, requestId: ctx.requestId });
    } catch (error) {
      logger.error({ err: error, event }, 'écriture du journal d’audit impossible');
    }
  }

  return {
    avatarPath,

    /** Étape 1 : mot de passe + nouvelle adresse → un code part vers la NOUVELLE adresse, un avertissement vers l'ancienne. */
    async requestEmailChange(user: AuthenticatedUser, input: { newEmail: string; password: string }, ctx: AccountContext): Promise<void> {
      const account = await identity.findUserById(sql, user.id);
      if (!account || !(await verifyPassword(input.password, account.passwordHash))) throw new AppError('unauthorized', 401, 'Mot de passe incorrect.');
      const newEmail = input.newEmail.trim().toLowerCase();
      if (newEmail === account.email) throw errors.badRequest('C’est déjà l’adresse de votre compte.');

      // Adresse prise par un autre compte : même réponse que si tout allait bien (on ne révèle pas qui est inscrit) ; aucun code n'est envoyé.
      if (await identity.findUserByEmail(sql, newEmail)) {
        await audit(user.id, 'email_change_refused_taken', ctx);
        return;
      }
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await repo.savePendingEmailChange(sql, user.id, { newEmail, codeHash: hashCode(user.id, code), expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS) });
      await audit(user.id, 'email_change_requested', ctx);
      send({
        to: newEmail,
        subject: 'Votre code de confirmation ORIGIN',
        text: `Votre code pour confirmer cette nouvelle adresse : ${code}\n\nIl est valable 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
      });
      send({
        to: account.email,
        subject: 'Demande de changement d’adresse e-mail sur ORIGIN',
        text: 'Une demande de changement d’adresse e-mail vient d’être faite sur votre compte ORIGIN.\n\nSi c’est vous, confirmez avec le code envoyé à la nouvelle adresse. Sinon, changez votre mot de passe immédiatement et déconnectez vos appareils.',
      });
    },

    /** Étape 2 : le code confirme la nouvelle adresse. Les autres appareils sont déconnectés (la session en cours reste ouverte). */
    async confirmEmailChange(user: AuthenticatedUser, code: string, currentTokenHash: string | null, ctx: AccountContext): Promise<void> {
      const pending = await repo.findPendingEmailChange(sql, user.id);
      const invalid = errors.badRequest('Code invalide ou expiré.');
      if (!pending || pending.expiresAt.getTime() < Date.now()) {
        if (pending) await repo.deletePendingEmailChange(sql, user.id);
        throw invalid;
      }
      if ((await repo.countEmailChangeAttempt(sql, user.id)) > MAX_CODE_ATTEMPTS) {
        await repo.deletePendingEmailChange(sql, user.id);
        throw new AppError('rate_limited', 429, 'Trop d’essais. Recommencez la demande de changement d’adresse.');
      }
      if (!sameHash(pending.codeHash, hashCode(user.id, code.trim()))) throw invalid;

      const previous = user.email;
      try {
        await sql.begin(async tx => {
          await repo.changeEmail(tx, user.id, pending.newEmail);
          await repo.deletePendingEmailChange(tx, user.id);
          await repo.revokeOtherDevices(tx, user.id, currentTokenHash);
        });
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new AppError('conflict', 409, 'Cette adresse est déjà utilisée.');
        throw error;
      }
      await audit(user.id, 'email_changed', ctx);
      send({
        to: previous,
        subject: 'Votre adresse e-mail ORIGIN a été modifiée',
        text: 'L’adresse e-mail de votre compte ORIGIN vient d’être remplacée. Si ce n’était pas vous, contactez-nous sans attendre.',
      });
    },

    /** Enregistre une photo de profil envoyée (jpg, png ou webp, 5 Mo au plus) et supprime la précédente. */
    async savePhoto(userId: string, bytes: Uint8Array): Promise<void> {
      if (bytes.byteLength === 0) throw errors.badRequest('Fichier vide.');
      if (bytes.byteLength > MAX_AVATAR_BYTES) throw errors.tooLarge('Photo trop volumineuse (5 Mo au plus).');
      const format = detectImageFormat(bytes);
      if (format !== 'jpg' && format !== 'png' && format !== 'webp') throw errors.badRequest('Formats acceptés : JPG, PNG ou WebP.');

      const key = `${randomBytes(16).toString('hex')}.${format}`;
      const target = avatarPath(key);
      if (!target) throw errors.badRequest('Nom de fichier invalide.');
      const previous = await repo.getAvatarKey(sql, userId);
      await mkdir(storage.avatarsRoot, { recursive: true });
      const temporary = `${target}.${process.pid}.tmp`;
      await writeFile(temporary, bytes);
      await rename(temporary, target);
      await repo.setAvatarPhoto(sql, userId, key);
      await removeAvatarFile(previous).catch(error => logger.warn({ err: error }, 'ancienne photo non supprimée'));
    },

    async setPreset(userId: string, preset: number): Promise<void> {
      const previous = await repo.getAvatarKey(sql, userId);
      await repo.setAvatarPreset(sql, userId, preset);
      await removeAvatarFile(previous).catch(error => logger.warn({ err: error }, 'ancienne photo non supprimée'));
    },

    async clearAvatar(userId: string): Promise<void> {
      const previous = await repo.getAvatarKey(sql, userId);
      await repo.clearAvatar(sql, userId);
      await removeAvatarFile(previous).catch(error => logger.warn({ err: error }, 'ancienne photo non supprimée'));
    },

    /** À brancher sur la suppression de compte (identity) : la photo ne doit pas survivre au compte. */
    afterAccountDeleted: async (info: { avatarKey: string | null }): Promise<void> => removeAvatarFile(info.avatarKey),
  };
}
