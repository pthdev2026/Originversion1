// Exporte le catalogue de démonstration « en dur » du front (app/src/lib/origin-*.ts) vers un fichier JSON
// importable par `npm run catalog:import`, et copie les visuels dans storage/images/<slug>/.
// Usage : node scripts/catalog-export-front.ts [--front ../app] [--out seed/catalog-demo.json] [--copy]
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name: string, fallback: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
};
const frontRoot = path.resolve(here, '..', arg('--front', '../app'));
const outFile = path.resolve(here, '..', arg('--out', 'seed/catalog-demo.json'));
const imagesRoot = path.resolve(here, '..', '..', 'storage', 'images');
const copy = process.argv.includes('--copy');

// Le front importe '@/assets/x.jpg' (bundler) : on remplace chaque image par un marqueur « asset:<fichier> ».
const loader = `
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/assets/')) return { url: 'asset:' + specifier.slice(9), shortCircuit: true };
  if (specifier.startsWith('@/')) return next(${JSON.stringify(pathToFileURL(path.join(frontRoot, 'src') + '/').href)} + specifier.slice(2) + '.ts', context);
  if (specifier.startsWith('.') && !/\\.[a-z]+$/.test(specifier)) return next(specifier + '.ts', context);
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.startsWith('asset:')) return { format: 'module', source: 'export default ' + JSON.stringify(url), shortCircuit: true };
  return next(url, context);
}`;
register('data:text/javascript,' + encodeURIComponent(loader), import.meta.url);

const lib = (name: string) => import(pathToFileURL(path.join(frontRoot, 'src', 'lib', `${name}.ts`)).href);
const [programsMod, topTenMod, suggestionsMod, testimonialsMod, creatorsMod, catalogsMod, productionsMod] = await Promise.all([
  lib('origin-programs'), lib('origin-top-ten'), lib('origin-suggestions'), lib('origin-testimonials'),
  lib('origin-creators'), lib('origin-catalogs'), lib('productions'),
]);

const copies: { from: string; to: string }[] = [];
/** « asset:x.jpg » → « /images/<slug>/x.jpg » et mémorise la copie à faire. */
function image(slug: string, marker: string | undefined | null): string | null {
  if (!marker) return null;
  const file = marker.replace(/^asset:/, '');
  copies.push({ from: path.join(frontRoot, 'src', 'assets', file), to: path.join(imagesRoot, slug, file) });
  return `/images/${slug}/${file}`;
}

const kindOf = (category: string): 'film' | 'serie' | 'documentaire' => {
  const c = category.toLowerCase();
  if (c.includes('série') || c.includes('serie') || c.includes('podcast')) return 'serie';
  if (c.includes('documentaire') || c.includes('témoignage')) return 'documentaire';
  return 'film';
};

interface Draft {
  kind: 'film' | 'serie' | 'documentaire'; title: string; titleLines?: string[]; tagline?: string; synopsis?: string; category?: string;
  durationLabel?: string; year?: number; language?: string; presenter?: string; genres?: string[]; badges?: string[];
  posterUrl?: string | null; heroUrl?: string | null; heroVideoUrl?: string | null; imageAlt?: string; titleStyle?: string;
  themes?: string[]; seasons?: unknown[]; isDemo: boolean; published: boolean;
}
const programs = new Map<string, Draft>();
const merge = (slug: string, patch: Partial<Draft> & { kind: Draft['kind']; title: string }) => {
  const current = programs.get(slug);
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)));
  programs.set(slug, { isDemo: true, published: true, ...current, ...clean } as Draft);
};

// Ordre de priorité : les sources les plus riches passent en dernier et complètent les précédentes.
for (const p of topTenMod.originTopTen) {
  merge(p.id, { kind: kindOf(p.category), title: p.title, category: p.category, posterUrl: image(p.id, p.poster), imageAlt: p.imageAlt });
}
for (const c of catalogsMod.catalogContents) {
  merge(c.id, { kind: kindOf(c.category), title: c.title, category: c.category, synopsis: c.synopsis, posterUrl: image(c.id, c.image), imageAlt: c.imageAlt, themes: c.themes });
}
for (const t of testimonialsMod.originTestimonials) {
  merge(t.id, { kind: kindOf(t.category), title: t.title, titleLines: t.titleLines, category: t.category, durationLabel: t.duration, posterUrl: image(t.id, t.poster), imageAlt: t.imageAlt, titleStyle: t.fontStyle });
}
for (const s of suggestionsMod.originSuggestions) {
  merge(s.id, { kind: kindOf(s.category), title: s.title, titleLines: s.titleLines, category: s.category, durationLabel: s.duration, posterUrl: image(s.id, s.poster), imageAlt: s.imageAlt, titleStyle: s.fontStyle });
}
for (const h of programsMod.originPrograms) {
  merge(h.id, {
    kind: kindOf(h.category), title: h.title, titleLines: h.titleLines, tagline: h.tagline, synopsis: h.synopsis, category: h.category,
    heroUrl: image(h.id, h.heroImage), posterUrl: image(h.id, h.heroImage), imageAlt: h.imageAlt, heroVideoUrl: image(h.id, h.heroVideo),
  });
}
for (const p of productionsMod.productions) {
  merge(p.slug, {
    kind: p.kind, title: p.title, category: p.label, synopsis: p.synopsis, presenter: p.presenter, badges: p.status,
    year: p.meta.year, language: p.meta.language, genres: p.meta.genres, durationLabel: p.meta.averageDuration,
    heroUrl: image(p.slug, p.heroImage), posterUrl: image(p.slug, p.heroImage), imageAlt: p.heroAlt,
    seasons: p.seasons.map((season: any) => ({
      number: season.number, title: season.title ?? null,
      episodes: season.episodes.map((e: any) => ({
        key: e.id, number: e.number, title: e.title, synopsis: e.synopsis, durationLabel: e.duration ?? null,
        imageUrl: image(p.slug, e.image), imageAlt: e.imageAlt,
      })),
    })),
  });
}

// Thématiques : « tendances » et « all » sont des vues, pas des thèmes.
const themes: Record<string, unknown> = {};
for (const [index, theme] of catalogsMod.catalogThemes.filter((t: any) => !['all', 'tendances'].includes(t.id)).entries()) {
  const firstWith = [...programs.entries()].find(([, p]) => p.themes?.includes(theme.id));
  themes[theme.id] = { title: theme.title, imageUrl: firstWith ? firstWith[1].posterUrl ?? null : null, position: index };
}

const creators: Record<string, unknown> = {};
for (const [index, c] of creatorsMod.originCreators.entries()) {
  creators[c.id] = {
    name: c.name, showTitle: c.showTitle ?? null, intro: c.intro, themes: c.themes, ambience: c.ambience,
    imageUrl: image(`creators-${c.id}`, c.image), imageAlt: c.imageAlt, imageFocus: c.focus, isProvisional: c.isProvisional, published: true, position: index,
  };
}

const catalogs = catalogsMod.originCatalogs;
const collections: Record<string, unknown> = {
  hero: { title: 'À l’affiche', layout: 'hero', homePosition: 0, published: true, items: programsMod.originPrograms.map((p: any) => p.id) },
  'top-10': { title: 'Top 10 — Les histoires qui font parler', layout: 'ranked', homePosition: 1, published: true, items: topTenMod.originTopTen.map((p: any) => p.id) },
  suggestions: { title: 'Ce qui pourrait vous plaire', layout: 'portrait', homePosition: 2, published: true, items: suggestionsMod.originSuggestions.map((p: any) => p.id) },
  universes: { title: 'Ils ont osé raconter leur histoire', layout: 'universes', homePosition: 3, published: true, items: testimonialsMod.originTestimonials.map((p: any) => p.id) },
  'pth-originals': { title: 'PTH Originals', layout: 'rail', homePosition: 4, published: true, items: ['les-secrets-du-ministere'] },
};
let position = 5;
for (const key of ['newReleases', 'suspense', 'drama', 'couple', 'scienceFiction'] as const) {
  const c = catalogs[key];
  collections[c.id] = {
    title: c.title, layout: c.cardStyle === 'portrait' ? 'portrait' : 'rail', badge: c.badge ?? null,
    homePosition: position++, published: true, items: c.contents.map((item: any) => item.id),
  };
}

const document = { themes, programs: Object.fromEntries(programs), creators, collections };
await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(document, null, 2) + '\n');
console.log(`✅ ${programs.size} programmes, ${Object.keys(themes).length} thèmes, ${Object.keys(creators).length} créateurs, ${Object.keys(collections).length} collections → ${path.relative(process.cwd(), outFile)}`);

if (copy) {
  let done = 0;
  for (const { from, to } of new Map(copies.map(c => [c.to, c])).values()) {
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to);
    done += 1;
  }
  console.log(`✅ ${done} fichiers copiés dans ${path.relative(process.cwd(), imagesRoot)}`);
}
