/**
 * Module « account » — préférences d'un compte (écran « Paramètres »).
 *
 * Des CODES stables (jamais des libellés français) : l'écran les traduit. Les valeurs absentes de la base valent les valeurs par défaut,
 * ce qui permet d'ajouter une préférence plus tard sans migration.
 */
import { z } from 'zod';

export const PREFERENCE_DEFAULTS = {
  /** Aperçus vidéo automatiques au survol. */
  previews: true,
  /** Enchaîner l'épisode suivant. */
  nextEpisode: true,
  /** Qualité vidéo : `auto`, `eco` (économie de données), `high` (haute). */
  quality: 'auto' as 'auto' | 'eco' | 'high',
  /** Sous-titres par défaut : `none`, `fr`, `en`. */
  subtitles: 'fr' as 'none' | 'fr' | 'en',
  subtitleSize: 'medium' as 'small' | 'medium' | 'large',
  /** Notifications : nouveaux épisodes de ma liste, nouveautés, e-mails. (L'ENVOI de ces messages n'existe pas encore : seul le choix est enregistré.) */
  newEpisodes: true,
  news: false,
  emails: true,
  reduceMotion: false,
  /** Historique de visionnage : s'il est désactivé, rien n'est enregistré pour « Continuer à regarder » ni pour les recommandations. */
  history: true,
};

export type Preferences = typeof PREFERENCE_DEFAULTS;

const shape = {
  previews: z.boolean(),
  nextEpisode: z.boolean(),
  quality: z.enum(['auto', 'eco', 'high']),
  subtitles: z.enum(['none', 'fr', 'en']),
  subtitleSize: z.enum(['small', 'medium', 'large']),
  newEpisodes: z.boolean(),
  news: z.boolean(),
  emails: z.boolean(),
  reduceMotion: z.boolean(),
  history: z.boolean(),
};

/** Modification partielle : seuls les champs fournis changent. Champ inconnu = refus (pas de données arbitraires en base). */
export const preferencesPatchSchema = z.object(shape).partial().strict()
  .refine(value => Object.keys(value).length > 0, { message: 'Aucune préférence à modifier.' });

/** Lit un document stocké de façon tolérante : on ne garde que les clés connues, bien typées ; le reste retombe sur le défaut. */
export function readPreferences(stored: unknown): Preferences {
  const result: Record<string, unknown> = { ...PREFERENCE_DEFAULTS };
  if (typeof stored === 'object' && stored !== null) {
    for (const [key, schema] of Object.entries(shape)) {
      const parsed = schema.safeParse((stored as Record<string, unknown>)[key]);
      if (parsed.success) result[key] = parsed.data;
    }
  }
  return result as Preferences;
}
