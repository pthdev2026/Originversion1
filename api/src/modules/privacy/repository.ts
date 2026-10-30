/** Module « privacy » — lecture des données personnelles d'un compte (SQL uniquement). */
import type { Sql } from '../../platform/database/client.ts';
import { getPreferences, listSearches, listUserThemes } from '../account/repository.ts';

export interface PersonalDataExport {
  generatedAt: string;
  account: {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
    emailVerified: boolean;
    twoFactorEnabled: boolean;
    locale: string;
    /** Type de photo de profil (`preset`, `photo`) ou null — le fichier lui-même n'est pas inclus. */
    avatarKind: string | null;
    createdAt: string;
    lastLoginAt: string | null;
  };
  watchProgress: { playbackId: string; programSlug: string | null; positionSeconds: number; durationSeconds: number | null; completed: boolean; updatedAt: string }[];
  myList: { slug: string; addedAt: string }[];
  preferences: Record<string, unknown>;
  favoriteThemes: string[];
  recentSearches: string[];
  activeSessions: number;
  /** Journal des événements de sécurité de CE compte (connexions, changements de mot de passe…). Aucune adresse IP n'est conservée. */
  securityEvents: { event: string; at: string }[];
}

export async function exportPersonalData(sql: Sql, userId: string): Promise<PersonalDataExport | null> {
  const [account] = await sql<{
    id: string; email: string; display_name: string | null; role: string; email_verified_at: Date | null;
    two_factor_enabled: boolean; created_at: Date; last_login_at: Date | null; locale: string; avatar_kind: string | null;
  }[]>`SELECT id, email, display_name, role, email_verified_at, two_factor_enabled, created_at, last_login_at, locale, avatar_kind FROM users WHERE id = ${userId}`;
  if (!account) return null;

  const [progress, list, sessions, events, preferences, favoriteThemes, recentSearches] = await Promise.all([
    sql<{ playback_id: string; program_slug: string | null; position_seconds: string; duration_seconds: string | null; completed: boolean; updated_at: Date }[]>`
      SELECT playback_id, program_slug, position_seconds::text, duration_seconds::text, completed, updated_at
      FROM watch_progress WHERE user_id = ${userId} ORDER BY updated_at DESC`,
    sql<{ slug: string; added_at: Date }[]>`SELECT slug, added_at FROM my_list WHERE user_id = ${userId} ORDER BY added_at DESC`,
    sql<{ count: string }[]>`SELECT count(*)::text AS count FROM sessions WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > now()`,
    sql<{ event: string; created_at: Date }[]>`SELECT event, created_at FROM audit_log WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 1000`,
    getPreferences(sql, userId),
    listUserThemes(sql, userId),
    listSearches(sql, userId, 20),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    account: {
      id: account.id, email: account.email, displayName: account.display_name, role: account.role,
      emailVerified: account.email_verified_at !== null, twoFactorEnabled: account.two_factor_enabled, locale: account.locale, avatarKind: account.avatar_kind,
      createdAt: account.created_at.toISOString(), lastLoginAt: account.last_login_at?.toISOString() ?? null,
    },
    watchProgress: progress.map(row => ({
      playbackId: row.playback_id, programSlug: row.program_slug, positionSeconds: Number(row.position_seconds),
      durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds), completed: row.completed, updatedAt: row.updated_at.toISOString(),
    })),
    myList: list.map(row => ({ slug: row.slug, addedAt: row.added_at.toISOString() })),
    preferences: preferences as unknown as Record<string, unknown>,
    favoriteThemes,
    recentSearches,
    activeSessions: Number(sessions[0]?.count ?? 0),
    securityEvents: events.map(row => ({ event: row.event, at: row.created_at.toISOString() })),
  };
}
