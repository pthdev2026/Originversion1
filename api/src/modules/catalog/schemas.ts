/** Module « catalog » — validation des documents envoyés par l'administration (zod). */
import { z } from 'zod';
import { errors } from '../../platform/errors.ts';
import type { CollectionInput, CreatorInput, ProgramInput, ThemeInput } from './admin.ts';

/** Adresse d'image : https://… ou chemin servi par l'API (/images/...). Jamais d'adresse « javascript: » ou relative libre. */
const assetUrl = z.string().max(500).refine(v => /^https:\/\/\S+$/.test(v) || /^\/images\/[a-z0-9][a-z0-9/_.-]*$/i.test(v) && !v.includes('..'), {
  message: 'Adresse https:// ou chemin /images/… attendu.',
});
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => text(max).nullable().default(null);
const optUrl = assetUrl.nullable().default(null);
const labels = z.array(text(80)).max(20).default([]);

const episode = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/),
  number: z.number().int().min(1).max(10_000),
  title: text(200),
  synopsis: optText(2000),
  durationLabel: optText(40),
  imageUrl: optUrl,
  imageAlt: optText(300),
}).strict();

const season = z.object({
  number: z.number().int().min(1).max(1000),
  title: optText(120),
  episodes: z.array(episode).max(500).default([]),
}).strict();

export const programSchema = z.object({
  kind: z.enum(['film', 'serie', 'documentaire']),
  title: text(200),
  titleLines: z.array(text(80)).max(6).default([]),
  tagline: optText(300),
  synopsis: optText(4000),
  category: optText(80),
  durationLabel: optText(40),
  year: z.number().int().min(1900).max(2100).nullable().default(null),
  language: optText(40),
  rating: optText(20),
  presenter: optText(120),
  genres: labels,
  /** Mots-clés de recherche (synonymes, thèmes, noms) : retrouvent le programme sans apparaître à l'écran. */
  keywords: labels,
  badges: labels,
  posterUrl: optUrl,
  heroUrl: optUrl,
  logoUrl: optUrl,
  heroVideoUrl: optUrl,
  trailerUrl: optUrl,
  imageAlt: optText(300),
  imageFocus: optText(40),
  titleStyle: z.enum(['condensed', 'serif', 'bebas', 'italic-serif']).nullable().default(null),
  isDemo: z.boolean().default(true),
  /** Par défaut : brouillon. Rien n'est public tant que l'administrateur ne le décide pas. */
  published: z.boolean().default(false),
  /** Sortie planifiée (ISO 8601 avec fuseau) : le programme, tant qu'il est brouillon, devient public à cette date. */
  publishAt: z.string().datetime({ offset: true }).nullable().default(null),
  /** Retrait planifié : un programme public repasse en brouillon à cette date. */
  unpublishAt: z.string().datetime({ offset: true }).nullable().default(null),
  /** Montrer la fiche résumée dans « Prochainement » avant la sortie (exige `publishAt`). */
  announced: z.boolean().default(false),
  themes: z.array(slug).max(30).default([]),
  seasons: z.array(season).max(100).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.publishAt && value.published) ctx.addIssue({ code: 'custom', message: 'Un programme déjà public n’a pas de date de sortie : retirez « publishAt » ou repassez-le en brouillon.' });
  if (value.announced && !value.publishAt) ctx.addIssue({ code: 'custom', message: 'Une annonce « Prochainement » exige une date de sortie.' });
  if (value.publishAt && value.unpublishAt && Date.parse(value.publishAt) >= Date.parse(value.unpublishAt)) ctx.addIssue({ code: 'custom', message: 'Le retrait doit être postérieur à la sortie.' });
  const numbers = new Set<number>();
  const keys = new Set<string>();
  for (const s of value.seasons) {
    if (numbers.has(s.number)) ctx.addIssue({ code: 'custom', message: `Saison ${s.number} en double.` });
    numbers.add(s.number);
    const episodeNumbers = new Set<number>();
    for (const e of s.episodes) {
      if (episodeNumbers.has(e.number)) ctx.addIssue({ code: 'custom', message: `Épisode ${e.number} en double (saison ${s.number}).` });
      episodeNumbers.add(e.number);
      if (keys.has(e.key)) ctx.addIssue({ code: 'custom', message: `Clé d'épisode « ${e.key} » en double.` });
      keys.add(e.key);
    }
  }
});

export const themeSchema = z.object({
  title: text(120),
  imageUrl: optUrl,
  position: z.number().int().min(0).max(10_000).default(0),
  subtitle: text(160).nullable().optional(),
  featuredSlug: slug.nullable().optional(),
}).strict();

const rgb = z.string().regex(/^\d{1,3} \d{1,3} \d{1,3}$/, 'Couleur « R G B » attendue (ex. 96 140 255).')
  .refine(value => value.split(' ').every(part => Number(part) <= 255), { message: 'Chaque valeur de couleur doit être comprise entre 0 et 255.' });
const chapter = z.object({ mark: text(8), title: text(80), text: text(500) }).strict();

export const creatorSchema = z.object({
  name: text(120),
  alias: optText(60),
  domain: optText(60),
  tagline: optText(400),
  accent: rgb.nullable().default(null),
  chapters: z.array(chapter).max(8, '8 chapitres au plus.').default([]),
  showTitle: optText(200),
  intro: optText(2000),
  themes: labels,
  ambience: z.enum(['ember', 'bordeaux', 'graphite', 'amber', 'night']).nullable().default(null),
  imageUrl: optUrl,
  imageAlt: optText(300),
  imageFocus: optText(40),
  isProvisional: z.boolean().default(true),
  published: z.boolean().default(false),
  position: z.number().int().min(0).max(10_000).default(0),
}).strict();

const creatorContent = z.object({
  program: slug,
  kind: z.enum(['message', 'conference', 'serie', 'live']),
  /** « À la une » : au plus un contenu par créateur. */
  featured: z.boolean().default(false),
  episodeLabel: optText(20),
  /** Créneau d'un direct (date et heure, ISO 8601). Seulement pour la rubrique `live`. */
  liveAt: z.string().datetime({ offset: true }).nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if (value.liveAt !== null && value.kind !== 'live') ctx.addIssue({ code: 'custom', message: 'Un créneau (liveAt) n’est possible que pour la rubrique « live ».' });
});

/** Remplace TOUS les contenus d'un créateur ; l'ordre de la liste est l'ordre d'affichage. */
export const creatorContentsSchema = z.object({
  contents: z.array(creatorContent).max(100, '100 contenus au plus.'),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>();
  for (const item of value.contents) {
    if (seen.has(item.program)) ctx.addIssue({ code: 'custom', message: `Programme « ${item.program} » en double.` });
    seen.add(item.program);
  }
  if (value.contents.filter(item => item.featured).length > 1) ctx.addIssue({ code: 'custom', message: 'Un seul contenu peut être « à la une ».' });
});

export const collectionSchema = z.object({
  title: text(160),
  layout: z.enum(['hero', 'ranked', 'rail', 'portrait', 'panels', 'universes']),
  badge: optText(60),
  viewAllUrl: z.string().max(300).regex(/^(\/|https:\/\/)\S*$/).nullable().default(null),
  homePosition: z.number().int().min(0).max(1000).nullable().default(null),
  published: z.boolean().default(false),
  items: z.array(slug).max(200).default([]).refine(items => new Set(items).size === items.length, { message: 'Programme en double dans la collection.' }),
}).strict();

/** Valide un corps JSON ; une erreur de validation devient un 400 lisible. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues.slice(0, 3).map(issue => `${issue.path.join('.') || 'corps'} : ${issue.message}`).join(' ; ');
    throw errors.badRequest(`Données invalides — ${detail}`);
  }
  return result.data;
}

// Les types inférés doivent rester alignés avec ceux de admin.ts : cette ligne casse la compilation sinon.
export type _Aligned = [ProgramInput, ThemeInput, CreatorInput, CollectionInput];
