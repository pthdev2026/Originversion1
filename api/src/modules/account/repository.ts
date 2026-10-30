/** Module « account » — accès aux données de l'espace personnel (SQL uniquement). */
import type { Executor, Sql } from '../../platform/database/client.ts';
import { readPreferences, type Preferences } from './preferences.ts';

// ---- Préférences ---------------------------------------------------------------------------------------------------------

export async function getPreferences(sql: Executor, userId: string): Promise<Preferences> {
  const [row] = await sql<{ data: unknown }[]>`SELECT data FROM user_preferences WHERE user_id = ${userId}`;
  return readPreferences(row?.data);
}

/** Enregistre le document COMPLET (valeurs par défaut incluses : un changement de défaut futur ne modifie pas un choix déjà fait). */
export async function savePreferences(sql: Sql, userId: string, preferences: Preferences): Promise<void> {
  await sql`
    INSERT INTO user_preferences (user_id, data) VALUES (${userId}, ${sql.json(preferences as never)})
    ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
}

/** L'historique de visionnage est-il activé ? Une seule lecture par clé primaire (appelé à chaque enregistrement de position). */
export async function isHistoryEnabled(sql: Executor, userId: string): Promise<boolean> {
  const [row] = await sql<{ history: string | null }[]>`SELECT data->>'history' AS history FROM user_preferences WHERE user_id = ${userId}`;
  return row?.history !== 'false'; // absent = valeur par défaut (activé)
}

// ---- Profil -------------------------------------------------------------------------------------------------------------

export async function updateProfile(sql: Sql, userId: string, changes: { displayName?: string | null; locale?: 'fr' | 'en' }): Promise<void> {
  const name = changes.displayName !== undefined ? sql`display_name = ${changes.displayName},` : sql``;
  const locale = changes.locale !== undefined ? sql`locale = ${changes.locale},` : sql``;
  await sql`UPDATE users SET ${name} ${locale} updated_at = now() WHERE id = ${userId}`;
}

// ---- Appareils (sessions) ---------------------------------------------------------------------------------------------------

export interface DeviceSession {
  id: string;
  device: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  tokenHash: string;
}

export async function listDeviceSessions(sql: Sql, userId: string): Promise<DeviceSession[]> {
  const rows = await sql<{ public_id: string; device: string | null; created_at: Date; last_seen_at: Date; token_hash: string }[]>`
    SELECT public_id, device, created_at, last_seen_at, token_hash FROM sessions
    WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > now() ORDER BY last_seen_at DESC, created_at DESC`;
  return rows.map(row => ({ id: row.public_id, device: row.device, createdAt: row.created_at, lastSeenAt: row.last_seen_at, tokenHash: row.token_hash }));
}

/** Déconnecte UN appareil de CE compte. Retourne `current` si c'est la session en cours (refusé : utiliser la déconnexion), `missing` si inconnu. */
export async function revokeDevice(sql: Sql, userId: string, publicId: string, currentTokenHash: string | null): Promise<'revoked' | 'current' | 'missing'> {
  const [row] = await sql<{ token_hash: string }[]>`SELECT token_hash FROM sessions WHERE public_id = ${publicId} AND user_id = ${userId} AND revoked_at IS NULL`;
  if (!row) return 'missing';
  if (row.token_hash === currentTokenHash) return 'current';
  await sql`UPDATE sessions SET revoked_at = now() WHERE public_id = ${publicId} AND user_id = ${userId} AND revoked_at IS NULL`;
  return 'revoked';
}

export async function revokeOtherDevices(sql: Executor, userId: string, currentTokenHash: string | null): Promise<number> {
  const rows = await sql`
    UPDATE sessions SET revoked_at = now()
    WHERE user_id = ${userId} AND revoked_at IS NULL AND token_hash <> ${currentTokenHash ?? ''} RETURNING public_id`;
  return rows.length;
}

// ---- Thématiques préférées --------------------------------------------------------------------------------------------------

export async function listUserThemes(sql: Executor, userId: string): Promise<string[]> {
  const rows = await sql<{ theme_slug: string }[]>`SELECT theme_slug FROM user_themes WHERE user_id = ${userId} ORDER BY theme_slug`;
  return rows.map(row => row.theme_slug);
}

/** Remplace la liste ; retourne les thématiques inconnues (la liste n'est alors PAS modifiée). */
export async function replaceUserThemes(sql: Sql, userId: string, themes: string[]): Promise<string[]> {
  return sql.begin(async tx => {
    if (themes.length > 0) {
      const known = await tx<{ slug: string }[]>`SELECT slug FROM themes WHERE slug IN ${tx(themes)}`;
      const unknown = themes.filter(theme => !known.some(row => row.slug === theme));
      if (unknown.length > 0) return unknown;
    }
    await tx`DELETE FROM user_themes WHERE user_id = ${userId}`;
    for (const theme of themes) await tx`INSERT INTO user_themes (user_id, theme_slug) VALUES (${userId}, ${theme})`;
    return [];
  });
}

// ---- Photo de profil --------------------------------------------------------------------------------------------------------

export async function getAvatarKey(sql: Executor, userId: string): Promise<string | null> {
  const [row] = await sql<{ avatar_key: string | null }[]>`SELECT avatar_key FROM users WHERE id = ${userId}`;
  return row?.avatar_key ?? null;
}

export async function setAvatarPreset(sql: Sql, userId: string, preset: number): Promise<void> {
  await sql`UPDATE users SET avatar_kind = 'preset', avatar_preset = ${preset}, avatar_key = NULL, avatar_zoom = 1, updated_at = now() WHERE id = ${userId}`;
}

export async function setAvatarPhoto(sql: Sql, userId: string, key: string): Promise<void> {
  await sql`UPDATE users SET avatar_kind = 'photo', avatar_preset = NULL, avatar_key = ${key}, avatar_zoom = 1, updated_at = now() WHERE id = ${userId}`;
}

/** Règle le recadrage de la photo ; retourne false s'il n'y a pas de photo. */
export async function setAvatarZoom(sql: Sql, userId: string, zoom: number): Promise<boolean> {
  const rows = await sql`UPDATE users SET avatar_zoom = ${zoom}, updated_at = now() WHERE id = ${userId} AND avatar_kind = 'photo' RETURNING id`;
  return rows.length > 0;
}

export async function clearAvatar(sql: Sql, userId: string): Promise<void> {
  await sql`UPDATE users SET avatar_kind = NULL, avatar_preset = NULL, avatar_key = NULL, avatar_zoom = 1, updated_at = now() WHERE id = ${userId}`;
}

// ---- Changement d'adresse e-mail ---------------------------------------------------------------------------------------------

export interface PendingEmailChange {
  newEmail: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
}

export async function savePendingEmailChange(sql: Sql, userId: string, input: { newEmail: string; codeHash: string; expiresAt: Date }): Promise<void> {
  await sql`
    INSERT INTO email_changes (user_id, new_email, code_hash, expires_at) VALUES (${userId}, ${input.newEmail}, ${input.codeHash}, ${input.expiresAt})
    ON CONFLICT (user_id) DO UPDATE SET new_email = EXCLUDED.new_email, code_hash = EXCLUDED.code_hash, attempts = 0, created_at = now(), expires_at = EXCLUDED.expires_at`;
}

export async function findPendingEmailChange(sql: Executor, userId: string): Promise<PendingEmailChange | null> {
  const [row] = await sql<{ new_email: string; code_hash: string; attempts: number; expires_at: Date }[]>`
    SELECT new_email, code_hash, attempts, expires_at FROM email_changes WHERE user_id = ${userId}`;
  return row ? { newEmail: row.new_email, codeHash: row.code_hash, attempts: row.attempts, expiresAt: row.expires_at } : null;
}

/** Compte un essai (atomique) et retourne le nombre d'essais APRÈS celui-ci. */
export async function countEmailChangeAttempt(sql: Sql, userId: string): Promise<number> {
  const [row] = await sql<{ attempts: number }[]>`UPDATE email_changes SET attempts = attempts + 1 WHERE user_id = ${userId} RETURNING attempts`;
  return row?.attempts ?? 0;
}

export async function deletePendingEmailChange(sql: Executor, userId: string): Promise<void> {
  await sql`DELETE FROM email_changes WHERE user_id = ${userId}`;
}

/** Remplace l'adresse du compte (le contrôle de la nouvelle adresse vient d'être prouvé : elle est donc vérifiée). 23505 = adresse déjà prise. */
export async function changeEmail(sql: Executor, userId: string, newEmail: string): Promise<void> {
  await sql`UPDATE users SET email = ${newEmail}, email_verified_at = now(), updated_at = now() WHERE id = ${userId}`;
}

// ---- Recherches récentes ---------------------------------------------------------------------------------------------------

export async function listSearches(sql: Executor, userId: string, limit: number): Promise<string[]> {
  const rows = await sql<{ query: string }[]>`SELECT query FROM search_history WHERE user_id = ${userId} ORDER BY searched_at DESC LIMIT ${limit}`;
  return rows.map(row => row.query);
}

/** Mémorise une recherche (la même recherche remonte en tête) et ne garde que les 20 dernières. */
export async function rememberSearch(sql: Sql, userId: string, folded: string, query: string): Promise<void> {
  await sql`
    INSERT INTO search_history (user_id, folded, query) VALUES (${userId}, ${folded}, ${query})
    ON CONFLICT (user_id, folded) DO UPDATE SET query = EXCLUDED.query, searched_at = now()`;
  await sql`
    DELETE FROM search_history WHERE user_id = ${userId} AND folded IN (
      SELECT folded FROM search_history WHERE user_id = ${userId} ORDER BY searched_at DESC OFFSET 20)`;
}

export async function forgetSearch(sql: Sql, userId: string, folded: string): Promise<void> {
  await sql`DELETE FROM search_history WHERE user_id = ${userId} AND folded = ${folded}`;
}

export async function clearSearches(sql: Sql, userId: string): Promise<void> {
  await sql`DELETE FROM search_history WHERE user_id = ${userId}`;
}
