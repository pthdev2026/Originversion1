/**
 * Module « identity » — accès aux données (SEUL fichier du module qui écrit du SQL).
 */
import type { Executor, Sql } from '../../platform/database/client.ts';
import type { AuthenticatedUser, Role } from '../../platform/http/types.ts';

export type { Role };
/** Défini dans le socle (platform/http/types.ts) pour que le socle ne dépende pas de ce module. */
export type User = AuthenticatedUser;

export interface UserWithSecrets extends User {
  passwordHash: string;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  role: Role;
  status: 'active' | 'disabled';
  email_verified_at: Date | null;
  two_factor_enabled: boolean;
  locale: 'fr' | 'en';
  avatar_kind: 'preset' | 'photo' | null;
  avatar_preset: number | null;
  avatar_key: string | null;
  avatar_zoom: number;
  created_at: Date;
  password_hash: string;
  failed_login_count: number;
  locked_until: Date | null;
}

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  role: row.role,
  status: row.status,
  emailVerified: row.email_verified_at !== null,
  twoFactorEnabled: row.two_factor_enabled,
  createdAt: row.created_at,
  locale: row.locale,
  avatar: row.avatar_kind === 'preset' && row.avatar_preset !== null
    ? { kind: 'preset', preset: row.avatar_preset }
    : row.avatar_kind === 'photo' && row.avatar_key !== null ? { kind: 'photo', key: row.avatar_key, zoom: row.avatar_zoom } : null,
});

const toUserWithSecrets = (row: UserRow): UserWithSecrets => ({
  ...toUser(row),
  passwordHash: row.password_hash,
  failedLoginCount: row.failed_login_count,
  lockedUntil: row.locked_until,
});

export async function findUserByEmail(sql: Sql, email: string): Promise<UserWithSecrets | null> {
  const [row] = await sql<UserRow[]>`SELECT * FROM users WHERE email = ${email}`;
  return row ? toUserWithSecrets(row) : null;
}

export async function findUserById(sql: Sql, id: string): Promise<UserWithSecrets | null> {
  const [row] = await sql<UserRow[]>`SELECT * FROM users WHERE id = ${id}`;
  return row ? toUserWithSecrets(row) : null;
}

/** Crée un compte. Retourne null si l'adresse existe déjà (contrainte d'unicité). */
export async function insertUser(
  sql: Executor,
  input: { id: string; email: string; passwordHash: string; displayName: string | null; role: Role; emailVerified?: boolean },
): Promise<User | null> {
  const [row] = await sql<UserRow[]>`
    INSERT INTO users (id, email, password_hash, display_name, role, email_verified_at)
    VALUES (${input.id}, ${input.email}, ${input.passwordHash}, ${input.displayName}, ${input.role}, ${input.emailVerified ? new Date() : null})
    ON CONFLICT (email) DO NOTHING
    RETURNING *`;
  return row ? toUser(row) : null;
}

export async function recordLoginFailure(sql: Sql, userId: string, maxFailures: number, lockSeconds: number): Promise<{ locked: boolean }> {
  const [row] = await sql<{ failed_login_count: number; locked_until: Date | null }[]>`
    UPDATE users
    SET failed_login_count = failed_login_count + 1,
        locked_until = CASE WHEN failed_login_count + 1 >= ${maxFailures} THEN now() + make_interval(secs => ${lockSeconds}) ELSE locked_until END,
        updated_at = now()
    WHERE id = ${userId}
    RETURNING failed_login_count, locked_until`;
  return { locked: Boolean(row?.locked_until && row.locked_until > new Date()) };
}

export async function recordLoginSuccess(sql: Sql, userId: string): Promise<void> {
  await sql`UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now(), updated_at = now() WHERE id = ${userId}`;
}

export async function updatePassword(sql: Sql, userId: string, passwordHash: string): Promise<void> {
  await sql`UPDATE users SET password_hash = ${passwordHash}, failed_login_count = 0, locked_until = NULL, updated_at = now() WHERE id = ${userId}`;
}

export async function deleteUser(sql: Sql, userId: string): Promise<void> {
  await sql`DELETE FROM users WHERE id = ${userId}`;
}

// ── Sessions ───────────────────────────────────────────────────────────────

export async function insertSession(sql: Sql, input: { tokenHash: string; userId: string; expiresAt: Date; device?: string | null }): Promise<void> {
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at, device) VALUES (${input.tokenHash}, ${input.userId}, ${input.expiresAt}, ${input.device ?? null})`;
}

export interface ActiveSession {
  user: User;
  lastSeenAt: Date;
  expiresAt: Date;
}

export async function findActiveSession(sql: Sql, tokenHash: string): Promise<ActiveSession | null> {
  const [row] = await sql<(UserRow & { last_seen_at: Date; expires_at: Date })[]>`
    SELECT u.*, s.last_seen_at, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash} AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active'`;
  return row ? { user: toUser(row), lastSeenAt: row.last_seen_at, expiresAt: row.expires_at } : null;
}

export async function touchSession(sql: Sql, tokenHash: string, expiresAt: Date): Promise<void> {
  await sql`UPDATE sessions SET last_seen_at = now(), expires_at = ${expiresAt} WHERE token_hash = ${tokenHash}`;
}

export async function revokeSession(sql: Sql, tokenHash: string): Promise<void> {
  await sql`UPDATE sessions SET revoked_at = now() WHERE token_hash = ${tokenHash} AND revoked_at IS NULL`;
}

/** Révoque toutes les sessions d'un compte, sauf éventuellement une (celle qui vient de changer le mot de passe). */
export async function revokeUserSessions(sql: Sql, userId: string, exceptTokenHash?: string): Promise<void> {
  if (exceptTokenHash) {
    await sql`UPDATE sessions SET revoked_at = now() WHERE user_id = ${userId} AND revoked_at IS NULL AND token_hash <> ${exceptTokenHash}`;
  } else {
    await sql`UPDATE sessions SET revoked_at = now() WHERE user_id = ${userId} AND revoked_at IS NULL`;
  }
}

/** Nettoyage : supprime les sessions expirées ou révoquées depuis plus de 7 jours. */
export async function purgeSessions(sql: Sql): Promise<number> {
  const result = await sql`DELETE FROM sessions WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days'`;
  return result.count;
}

// ── Réinitialisation du mot de passe ───────────────────────────────────────

export async function insertPasswordReset(sql: Sql, input: { tokenHash: string; userId: string; expiresAt: Date }): Promise<void> {
  await sql`UPDATE password_resets SET used_at = now() WHERE user_id = ${input.userId} AND used_at IS NULL`;
  await sql`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (${input.tokenHash}, ${input.userId}, ${input.expiresAt})`;
}

/** Consomme un jeton de réinitialisation valide (usage unique). Retourne l'utilisateur concerné ou null. */
export async function consumePasswordReset(sql: Sql, tokenHash: string): Promise<string | null> {
  const [row] = await sql<{ user_id: string }[]>`
    UPDATE password_resets SET used_at = now()
    WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > now()
    RETURNING user_id`;
  return row?.user_id ?? null;
}

// ── Vérification d'adresse e-mail ──────────────────────────────────────────

/** Nouveau jeton : les précédents non utilisés sont invalidés (un seul lien valable à la fois). */
export async function insertEmailVerification(sql: Sql, input: { tokenHash: string; userId: string; email: string; expiresAt: Date }): Promise<void> {
  await sql`UPDATE email_verifications SET used_at = now() WHERE user_id = ${input.userId} AND used_at IS NULL`;
  await sql`INSERT INTO email_verifications (token_hash, user_id, email, expires_at) VALUES (${input.tokenHash}, ${input.userId}, ${input.email}, ${input.expiresAt})`;
}

export async function lastEmailVerificationAt(sql: Sql, userId: string): Promise<Date | null> {
  const [row] = await sql<{ created_at: Date }[]>`SELECT created_at FROM email_verifications WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 1`;
  return row?.created_at ?? null;
}

/**
 * Consomme un jeton valide (usage unique) et marque l'adresse comme vérifiée — seulement si le compte porte toujours
 * l'adresse pour laquelle le jeton a été émis. Retourne l'identifiant du compte, ou null.
 */
export async function consumeEmailVerification(sql: Executor, tokenHash: string): Promise<string | null> {
  const [row] = await sql<{ user_id: string }[]>`
    WITH used AS (
      UPDATE email_verifications SET used_at = now()
      WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > now()
      RETURNING user_id, email
    )
    UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
    FROM used WHERE users.id = used.user_id AND users.email = used.email
    RETURNING users.id AS user_id`;
  return row?.user_id ?? null;
}

export async function markEmailVerified(sql: Executor, userId: string): Promise<void> {
  await sql`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = ${userId}`;
}

// ── Double authentification ────────────────────────────────────────────────

export interface TotpRecord {
  secretEnc: string;
  enabledAt: Date | null;
  lastStep: number;
}

export async function findTotp(sql: Executor, userId: string): Promise<TotpRecord | null> {
  const [row] = await sql<{ secret_enc: string; enabled_at: Date | null; last_step: string }[]>`
    SELECT secret_enc, enabled_at, last_step::text FROM user_totp WHERE user_id = ${userId}`;
  return row ? { secretEnc: row.secret_enc, enabledAt: row.enabled_at, lastStep: Number(row.last_step) } : null;
}

/** Démarre (ou redémarre) un enrôlement non confirmé. Ne touche pas un enrôlement déjà actif. */
export async function upsertPendingTotp(sql: Executor, userId: string, secretEnc: string): Promise<boolean> {
  const rows = await sql`
    INSERT INTO user_totp (user_id, secret_enc) VALUES (${userId}, ${secretEnc})
    ON CONFLICT (user_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, last_step = 0, created_at = now()
    WHERE user_totp.enabled_at IS NULL
    RETURNING user_id`;
  return rows.length > 0;
}

/** Accepte un pas strictement plus récent que le dernier utilisé (un code ne sert qu'une fois). Atomique. */
export async function advanceTotpStep(sql: Executor, userId: string, step: number): Promise<boolean> {
  const rows = await sql`UPDATE user_totp SET last_step = ${step} WHERE user_id = ${userId} AND last_step < ${step} RETURNING user_id`;
  return rows.length > 0;
}

export async function enableTotp(sql: Executor, userId: string, recoveryHashes: string[]): Promise<void> {
  await sql`UPDATE user_totp SET enabled_at = now() WHERE user_id = ${userId}`;
  await sql`UPDATE users SET two_factor_enabled = true, updated_at = now() WHERE id = ${userId}`;
  await sql`DELETE FROM user_recovery_codes WHERE user_id = ${userId}`;
  for (const hash of recoveryHashes) await sql`INSERT INTO user_recovery_codes (code_hash, user_id) VALUES (${hash}, ${userId})`;
}

export async function disableTotp(sql: Executor, userId: string): Promise<void> {
  await sql`DELETE FROM user_totp WHERE user_id = ${userId}`;
  await sql`DELETE FROM user_recovery_codes WHERE user_id = ${userId}`;
  await sql`UPDATE users SET two_factor_enabled = false, updated_at = now() WHERE id = ${userId}`;
}

/** Consomme un code de secours (usage unique). */
export async function consumeRecoveryCode(sql: Executor, userId: string, codeHash: string): Promise<boolean> {
  const rows = await sql`
    UPDATE user_recovery_codes SET used_at = now()
    WHERE user_id = ${userId} AND code_hash = ${codeHash} AND used_at IS NULL RETURNING code_hash`;
  return rows.length > 0;
}

export async function countRecoveryCodes(sql: Executor, userId: string): Promise<number> {
  const [row] = await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM user_recovery_codes WHERE user_id = ${userId} AND used_at IS NULL`;
  return Number(row?.count ?? 0);
}

// ── Invitations ────────────────────────────────────────────────────────────

export async function insertInvitation(sql: Sql, input: { codeHash: string; createdBy: string | null; note: string | null; maxUses: number; expiresAt: Date | null }): Promise<void> {
  await sql`INSERT INTO invitations (code_hash, created_by, note, max_uses, expires_at) VALUES (${input.codeHash}, ${input.createdBy}, ${input.note}, ${input.maxUses}, ${input.expiresAt})`;
}

/** Consomme une utilisation d'invitation si elle est valide. Atomique : deux inscriptions ne peuvent pas dépasser `max_uses`. */
export async function consumeInvitation(sql: Executor, codeHash: string): Promise<boolean> {
  const [row] = await sql<{ code_hash: string }[]>`
    UPDATE invitations SET use_count = use_count + 1
    WHERE code_hash = ${codeHash} AND use_count < max_uses AND (expires_at IS NULL OR expires_at > now())
    RETURNING code_hash`;
  return Boolean(row);
}

// ── Journal d'audit ────────────────────────────────────────────────────────

export async function insertAudit(sql: Sql, input: { userId: string | null; event: string; requestId: string | null; details?: Record<string, unknown> }): Promise<void> {
  await sql`INSERT INTO audit_log (user_id, event, request_id, details) VALUES (${input.userId}, ${input.event}, ${input.requestId}, ${sql.json((input.details ?? {}) as never)})`;
}

/** Adresses des administrateurs actifs (alertes d'exploitation). */
export async function listAdminEmails(sql: Sql): Promise<string[]> {
  const rows = await sql<{ email: string }[]>`SELECT email FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at`;
  return rows.map(row => row.email);
}

// ── Appareils connus ───────────────────────────────────────────────────────────────────────────────────

/** Note l'appareil d'une connexion. `isNew` : jamais vu pour ce compte ; `hadOthers` : le compte avait déjà d'autres appareils (sinon c'est la première connexion). */
export async function touchLoginDevice(sql: Sql, userId: string, device: string): Promise<{ isNew: boolean; hadOthers: boolean }> {
  const [others] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM login_devices WHERE user_id = ${userId} AND device <> ${device}`;
  const [row] = await sql<{ inserted: boolean }[]>`
    INSERT INTO login_devices (user_id, device) VALUES (${userId}, ${device})
    ON CONFLICT (user_id, device) DO UPDATE SET last_seen = now()
    RETURNING (xmax = 0) AS inserted`;
  return { isNew: row?.inserted === true, hadOthers: Number(others?.n ?? 0) > 0 };
}
