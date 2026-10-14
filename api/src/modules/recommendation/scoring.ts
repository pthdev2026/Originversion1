/**
 * Module « recommendation » — règles de calcul (fonctions pures, sans base de données : faciles à tester).
 *
 * Principe : deux contenus sont « proches » s'ils partagent des thématiques (le plus fort signal éditorial),
 * des genres, un type, une catégorie. Chaque recommandation garde sa RAISON, affichable telle quelle au spectateur.
 */
export interface ProgramFeatures {
  slug: string;
  title: string;
  kind: string;
  category: string | null;
  genres: string[];
  /** Thématiques : slug → libellé. */
  themes: Map<string, string>;
}

export interface Similarity {
  score: number;
  /** Phrase prête à afficher : « Même thématique : Foi & Spiritualité ». */
  reason: string;
}

const WEIGHTS = { theme: 3, genre: 2, kind: 1, category: 1 } as const;

const norm = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function similarity(a: ProgramFeatures, b: ProgramFeatures): Similarity {
  const sharedThemes = [...a.themes.entries()].filter(([slug]) => b.themes.has(slug)).map(([, label]) => label);
  const bGenres = new Set(b.genres.map(norm));
  const sharedGenres = a.genres.filter(genre => bGenres.has(norm(genre)));
  const sameKind = a.kind === b.kind;
  const sameCategory = a.category !== null && a.category === b.category;

  const score = sharedThemes.length * WEIGHTS.theme + sharedGenres.length * WEIGHTS.genre
    + (sameKind ? WEIGHTS.kind : 0) + (sameCategory ? WEIGHTS.category : 0);

  let reason = 'Dans le même esprit';
  if (sharedThemes.length > 0) reason = `Même thématique : ${sharedThemes.slice(0, 2).join(', ')}`;
  else if (sharedGenres.length > 0) reason = `Même genre : ${sharedGenres[0]}`;
  else if (sameCategory) reason = `Même catégorie : ${a.category}`;
  return { score, reason };
}

export interface Recommendation {
  slug: string;
  reason: string;
}

/** Contenus proches d'un programme, du plus proche au moins proche. Le programme lui-même est exclu. */
export function similarTo(target: ProgramFeatures, catalog: ProgramFeatures[], limit: number): Recommendation[] {
  return catalog
    .filter(candidate => candidate.slug !== target.slug)
    .map(candidate => ({ candidate, ...similarity(target, candidate) }))
    // Un score de 1 seul (même type, rien d'autre) est trop faible pour s'appeler « similaire ».
    .filter(item => item.score >= 2)
    .sort((x, y) => y.score - x.score || x.candidate.title.localeCompare(y.candidate.title, 'fr'))
    .slice(0, limit)
    .map(item => ({ slug: item.candidate.slug, reason: item.reason }));
}

export interface HistoryEntry {
  slug: string;
  /** Poids de l'intérêt : terminé 1, en cours bien entamé 0,6, mis dans « Ma liste » 0,8. */
  weight: number;
  via: 'completed' | 'watching' | 'list';
}

/**
 * Recommandations personnalisées : somme, pour chaque contenu candidat, de sa proximité avec chaque contenu de
 * l'historique, pondérée par l'intérêt. Les contenus déjà vus, commencés ou en liste ne sont pas re-proposés.
 */
export function personalized(history: HistoryEntry[], catalog: ProgramFeatures[], limit: number): Recommendation[] {
  const bySlug = new Map(catalog.map(program => [program.slug, program]));
  const seen = new Set(history.map(entry => entry.slug));
  const known = history.flatMap(entry => {
    const features = bySlug.get(entry.slug);
    return features ? [{ entry, features }] : [];
  });

  const scored = catalog.filter(candidate => !seen.has(candidate.slug)).flatMap(candidate => {
    let total = 0;
    let best: { weighted: number; title: string; via: HistoryEntry['via'] } | null = null;
    for (const { entry, features } of known) {
      const { score } = similarity(candidate, features);
      if (score < 2) continue;
      const weighted = score * entry.weight;
      total += weighted;
      if (!best || weighted > best.weighted) best = { weighted, title: features.title, via: entry.via };
    }
    if (!best || total <= 0) return [];
    const reason = best.via === 'list' ? `Parce que « ${best.title} » est dans votre liste`
      : best.via === 'completed' ? `Parce que vous avez regardé « ${best.title} »`
      : `Parce que vous regardez « ${best.title} »`;
    return [{ slug: candidate.slug, total, title: candidate.title, reason }];
  });

  return scored
    .sort((x, y) => y.total - x.total || x.title.localeCompare(y.title, 'fr'))
    .slice(0, limit)
    .map(item => ({ slug: item.slug, reason: item.reason }));
}
