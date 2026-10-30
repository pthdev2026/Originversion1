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

/**
 * Genres « pliés » (sans accents ni casse), calculés UNE fois par programme. Ce calcul (normalisation Unicode) était
 * refait pour chaque paire comparée : avec 5 000 programmes et un historique de 10, cela coûtait ~50 ms par requête
 * et bloquait tout le serveur (mesuré au test de charge, voir docs/TEST-DE-CHARGE.md).
 */
interface GenreInfo {
  keys: ReadonlySet<string>;
  entries: readonly (readonly [label: string, key: string])[];
}
const genreInfoCache = new WeakMap<ProgramFeatures, GenreInfo>();
function genreInfo(program: ProgramFeatures): GenreInfo {
  let info = genreInfoCache.get(program);
  if (!info) {
    const entries = program.genres.map(label => [label, norm(label)] as const);
    info = { keys: new Set(entries.map(([, key]) => key)), entries };
    genreInfoCache.set(program, info);
  }
  return info;
}

export function similarity(a: ProgramFeatures, b: ProgramFeatures): Similarity {
  let themeCount = 0;
  const sharedThemes: string[] = [];
  for (const [slug, label] of a.themes) {
    if (b.themes.has(slug)) {
      themeCount += 1;
      if (sharedThemes.length < 2) sharedThemes.push(label);
    }
  }
  let genreCount = 0;
  let firstGenre: string | null = null;
  const bKeys = genreInfo(b).keys;
  if (bKeys.size > 0) {
    for (const [label, key] of genreInfo(a).entries) {
      if (bKeys.has(key)) {
        genreCount += 1;
        firstGenre ??= label;
      }
    }
  }
  const sameKind = a.kind === b.kind;
  const sameCategory = a.category !== null && a.category === b.category;

  const score = themeCount * WEIGHTS.theme + genreCount * WEIGHTS.genre
    + (sameKind ? WEIGHTS.kind : 0) + (sameCategory ? WEIGHTS.category : 0);

  let reason = 'Dans le même esprit';
  if (themeCount > 0) reason = `Même thématique : ${sharedThemes.join(', ')}`;
  else if (firstGenre !== null) reason = `Même genre : ${firstGenre}`;
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
 * l'historique, pondérée par l'intérêt, plus un bonus pour chaque thématique préférée de la personne (« Pour vous » dès l'inscription). Les contenus déjà vus, commencés ou en liste ne sont pas re-proposés.
 */
export function personalized(history: HistoryEntry[], catalog: ProgramFeatures[], limit: number, favoriteThemes: ReadonlySet<string> = new Set()): Recommendation[] {
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
    // Thématiques préférées (choisies par la personne) : même poids qu'une thématique commune dans la proximité de contenus.
    let themeLabel: string | null = null;
    for (const [slug, label] of candidate.themes) {
      if (favoriteThemes.has(slug)) {
        total += WEIGHTS.theme;
        themeLabel ??= label;
      }
    }
    if (total <= 0) return [];
    if (!best) return [{ slug: candidate.slug, total, title: candidate.title, reason: `Parce que vous aimez « ${themeLabel} »` }];
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
