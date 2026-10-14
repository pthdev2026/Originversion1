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
  themes: z.array(slug).max(30).default([]),
  seasons: z.array(season).max(100).default([]),
}).strict().superRefine((value, ctx) => {
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
}).strict();

export const creatorSchema = z.object({
  name: text(120),
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
