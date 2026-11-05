import { getProduction, type ContentKind, type Production } from '@/lib/productions';
import { originPrograms } from '@/lib/origin-programs';
import { originTopTen } from '@/lib/origin-top-ten';
import { originSuggestions } from '@/lib/origin-suggestions';
import { originTestimonials } from '@/lib/origin-testimonials';
import { catalogContents } from '@/lib/origin-catalogs';
import { creatorContents, creatorKindLabel } from '@/lib/creator-universes';

/** Universal entry point: any homepage content resolves to one Production shape for the landing page. */
interface Source { id: string; title: string; category: string; image: string; imageAlt: string; synopsis?: string; duration?: string }

export function kindFromCategory(category: string): ContentKind {
  const c = category.toLowerCase();
  if (c.includes('série') || c.includes('serie') || c.includes('podcast')) return 'serie';
  if (c.includes('documentaire') || c.includes('témoignage')) return 'documentaire';
  return 'film';
}

export const kindLabel: Record<ContentKind, string> = { film: 'Film', serie: 'Série', documentaire: 'Documentaire' };

const sources = (): Source[] => [
  ...originPrograms.map(p => ({ id: p.id, title: p.title, category: p.category, image: p.heroImage, imageAlt: p.imageAlt, synopsis: p.synopsis })),
  ...catalogContents.map(c => ({ id: c.id, title: c.title, category: c.category, image: c.image, imageAlt: c.imageAlt, synopsis: c.synopsis })),
  ...originTopTen.map(p => ({ id: p.id, title: p.title, category: p.category, image: p.poster, imageAlt: p.imageAlt })),
  ...originSuggestions.map(p => ({ id: p.id, title: p.title, category: p.category, image: p.poster, imageAlt: p.imageAlt, duration: p.duration })),
  ...originTestimonials.map(p => ({ id: p.id, title: p.title, category: p.category, image: p.poster, imageAlt: p.imageAlt, duration: p.duration })),
  ...creatorContents.map(c => ({ id: c.id, title: c.title, category: creatorKindLabel[c.kind], image: c.image, imageAlt: c.imageAlt, synopsis: c.synopsis, ...(c.kind === 'live' ? {} : { duration: c.duration }) })),
];

function fromSource(s: Source): Production {
  const kind = kindFromCategory(s.category);
  const synopsis = s.synopsis ?? 'Présentation à venir — contenu de démonstration.';
  return {
    slug: s.id, kind, title: s.title, label: s.category, status: [], synopsis,
    heroImage: s.image, heroAlt: s.imageAlt, isDemo: true,
    meta: { genres: [s.category], ...(s.duration ? { averageDuration: s.duration } : {}) },
    // Series without supplied episodes stay empty rather than inventing episodes.
    seasons: kind === 'serie' ? [] : [{ number: 1, episodes: [{
      id: 'feature', number: 1, title: s.title, synopsis, image: s.image, imageAlt: s.imageAlt, isDemo: true,
      ...(s.duration ? { duration: s.duration } : {}),
    }] }],
  };
}

export function resolveWatchable(slug: string): Production | undefined {
  const production = getProduction(slug);
  if (production) return production;
  const source = sources().find(s => s.id === slug);
  return source ? fromSource(source) : undefined;
}

export interface WatchSuggestion { id: string; title: string; category: string; image: string; imageAlt: string; kind: ContentKind }

/** Demo similarity: same kind first, then the rest of the catalog; a recommendation service can replace this. */
export function similarTo(production: Production, limit = 10): WatchSuggestion[] {
  const seen = new Set([production.slug]);
  const all = sources().filter(s => !seen.has(s.id) && (seen.add(s.id), true)).map(s => ({ id: s.id, title: s.title, category: s.category, image: s.image, imageAlt: s.imageAlt, kind: kindFromCategory(s.category) }));
  return [...all.filter(s => s.kind === production.kind), ...all.filter(s => s.kind !== production.kind)].slice(0, limit);
}

const norm = (v: string) => v.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
export function searchCatalog(query: string, limit = 8): WatchSuggestion[] {
  const q = norm(query.trim());
  const seen = new Set<string>();
  return sources()
    .filter(s => !seen.has(s.id) && (seen.add(s.id), true))
    .filter(s => !q || norm(`${s.title} ${s.category}`).includes(q))
    .slice(0, limit)
    .map(s => ({ id: s.id, title: s.title, category: s.category, image: s.image, imageAlt: s.imageAlt, kind: kindFromCategory(s.category) }));
}
