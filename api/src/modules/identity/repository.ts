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
  createdAt: row.created_at,
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
  input: { id: string; email: string; passwordHash: string; displayName: string | null; role: Role },
): Promise<User | null> {
  const [row] = await sql<UserRow[]>`
    INSERT INTO users (id, email, password_hash, display_name, role)
    VALUES (${input.id}, ${input.email}, ${input.passwordHash}, ${input.displayName}, ${input.role})
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

export async function insertSession(sql: Sql, input: { tokenHash: string; userId: string; expiresAt: Date }): Promise<void> {
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${input.tokenHash}, ${input.userId}, ${input.expiresAt})`;
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
