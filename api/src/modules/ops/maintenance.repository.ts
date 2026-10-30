/**
 * Module « ops » — entretien périodique : ne garder que ce qui est utile (minimisation des données, RGPD) et éviter
 * que les tables grossissent sans fin. Appelé toutes les heures par l'API.
 */
import type { Sql } from '../../platform/database/client.ts';

export interface Retention {
  /** Mesures de lecture (anonymes) conservées N jours. */
  telemetryDays: number;
  /** Journal d'audit conservé N jours. */
  auditDays: number;
}

export interface PurgeReport {
  sessions: number;
  tokens: number;
  telemetry: number;
  audit: number;
}

export async function purgeExpired(sql: Sql, retention: Retention): Promise<PurgeReport> {
  const sessions = await sql`
    DELETE FROM sessions WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days'`;
  // Jetons à usage unique (réinitialisation, vérification d'e-mail) : inutiles une fois expirés ou utilisés.
  const resets = await sql`DELETE FROM password_resets WHERE expires_at < now() - interval '7 days' OR used_at < now() - interval '7 days'`;
  const verifications = await sql`DELETE FROM email_verifications WHERE expires_at < now() - interval '7 days' OR used_at < now() - interval '7 days'`;
  const recovery = await sql`DELETE FROM user_recovery_codes WHERE used_at < now() - interval '30 days'`;
  const telemetry = await sql`DELETE FROM playback_sessions WHERE started_at < now() - make_interval(days => ${retention.telemetryDays})`;
  const audit = await sql`DELETE FROM audit_log WHERE created_at < now() - make_interval(days => ${retention.auditDays})`;
  // Les messages du formulaire de contact (nom, adresse, texte libre) suivent la même durée que le journal.
  const contacts = await sql`DELETE FROM contact_messages WHERE created_at < now() - make_interval(days => ${retention.auditDays})`;
  return {
    sessions: sessions.count,
    tokens: resets.count + verifications.count + recovery.count,
    telemetry: telemetry.count,
    audit: audit.count + contacts.count,
  };
}
