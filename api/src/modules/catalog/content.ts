/**
 * Module « catalog » — lecture du catalogue éditorial (SQL + mise en forme JSON).
 *
 * Règles de ce fichier :
 *  - le public ne voit jamais un brouillon (`published = false`) ni un contenu de marque (`kind = 'brand'`) ;
 *  - `playable` est calculé depuis les médias RÉELLEMENT prêts : on ne promet jamais une lecture qui n'existe pas ;
 *  - l'identifiant de lecture d'un film est son slug ; celui d'un épisode est « <slug>-<clé> ».
 */
import { AUDIENCE_MIN_WATCH_SECONDS, AUDIENCE_WINDOW_DAYS } from './audience.ts';
import type { Sql } from '../../platform/database/client.ts';
import type { ProgramKind } from './repository.ts';

interface ProgramRow {
  slug: string;
  kind: ProgramKind;
  title: string;
  title_lines: string[];
  tagline: string | null;
  synopsis: string | null;
  category: string | null;
  duration_label: string | null;
  year: number | null;
  language: string | null;
  rating: string | null;
  presenter: string | null;
  genres: string[];
  badges: string[];
  poster_url: string | null;
  hero_url: string | null;
  logo_url: string | null;
  hero_video_url: string | null;
  trailer_url: string | null;
  image_alt: string | null;
  image_focus: string | null;
  title_style: string | null;
  is_demo: boolean;
  published: boolean;
  playable: boolean;
  themes: string[];
}

/** Colonnes d'un programme + « lisible ? » + ses thèmes. Réutilisé par toutes les lectures. */
const PROGRAM_COLUMNS = (sql: Sql) => sql`
  p.slug, p.kind, p.title, p.title_lines, p.tagline, p.synopsis, p.category, p.duration_label, p.year, p.language,
  p.rating, p.presenter, p.genres, p.badges, p.poster_url, p.hero_url, p.logo_url, p.hero_video_url, p.trailer_url,
  p.image_alt, p.image_focus, p.title_style, p.is_demo, p.published,
  EXISTS (SELECT 1 FROM media_assets m WHERE m.program_slug = p.slug AND m.status = 'ready') AS playable,
  COALESCE((SELECT array_agg(pt.theme_slug ORDER BY pt.theme_slug) FROM program_themes pt WHERE pt.program_slug = p.slug), '{}') AS themes`;

export interface ProgramCard {
  slug: string;
  kind: ProgramKind;
  title: string;
  titleLines: string[];
  tagline: string | null;
  synopsis: string | null;
  category: string | null;
  durationLabel: string | null;
  badges: string[];
  themes: string[];
  images: { poster: string | null; hero: string | null; logo: string | null; alt: string | null; focus: string | null };
  heroVideoUrl: string | null;
  titleStyle: string | null;
  isDemo: boolean;
  /** Vrai seulement si au moins un média est prêt : le front n'affiche « Regarder » que dans ce cas. */
  playable: boolean;
}

function toCard(row: ProgramRow): ProgramCard {
  return {
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    titleLines: row.title_lines,
    tagline: row.tagline,
    synopsis: row.synopsis,
    category: row.category,
    durationLabel: row.duration_label,
    badges: row.badges,
    themes: row.themes,
    images: { poster: row.poster_url, hero: row.hero_url, logo: row.logo_url, alt: row.image_alt, focus: row.image_focus },
    heroVideoUrl: row.hero_video_url,
    titleStyle: row.title_style,
    isDemo: row.is_demo,
    playable: row.playable,
  };
}

export interface EpisodeView {
  id: string;
  number: number;
  title: string;
  synopsis: string | null;
  durationLabel: string | null;
  image: string | null;
  imageAlt: string | null;
  playbackId: string;
  playable: boolean;
}

export interface ProgramDetail extends ProgramCard {
  trailerUrl: string | null;
  presenter: string | null;
  meta: { year: number | null; language: string | null; rating: string | null; genres: string[] };
  seasons: { number: number; title: string | null; episodes: EpisodeView[] }[];
}

export async function getProgramDetail(sql: Sql, slug: string): Promise<ProgramDetail | null> {
  const [row] = await sql<ProgramRow[]>`
    SELECT ${PROGRAM_COLUMNS(sql)} FROM programs p
    WHERE p.slug = ${slug} AND p.published AND p.kind <> 'brand'`;
  if (!row) return null;

  const episodes = await sql<{
    season_number: number; season_title: string | null; number: number; key: string; title: string;
    synopsis: string | null; duration_label: string | null; image_url: string | null; image_alt: string | null; playable: boolean;
  }[]>`
    SELECT s.number AS season_number, s.title AS season_title, e.number, e.key, e.title, e.synopsis, e.duration_label,
           e.image_url, e.image_alt,
           EXISTS (SELECT 1 FROM media_assets m WHERE m.playback_id = ${slug} || '-' || e.key AND m.status = 'ready') AS playable
    FROM seasons s
    LEFT JOIN episodes e ON e.program_slug = s.program_slug AND e.season_number = s.number
    WHERE s.program_slug = ${slug}
    ORDER BY s.number, e.number`;

  const seasons = new Map<number, ProgramDetail['seasons'][number]>();
  for (const e of episodes) {
    const season = seasons.get(e.season_number) ?? { number: e.season_number, title: e.season_title, episodes: [] };
    seasons.set(e.season_number, season);
    if (e.key) {
      season.episodes.push({
        id: e.key, number: e.number, title: e.title, synopsis: e.synopsis, durationLabel: e.duration_label,
        image: e.image_url, imageAlt: e.image_alt, playbackId: `${slug}-${e.key}`, playable: e.playable,
      });
    }
  }

  // Série sans épisodes déclarés mais avec des médias prêts (« <slug>-s1-e2 ») : on les expose plutôt que de les cacher.
  // Les titres sont génériques ; l'éditorial pourra les préciser plus tard sans toucher aux médias.
  if (seasons.size === 0 && row.kind === 'serie') {
    const assets = await sql<{ playback_id: string }[]>`
      SELECT playback_id FROM media_assets
      WHERE program_slug = ${slug} AND status = 'ready' AND playback_id LIKE ${slug + '-s%-e%'}
      ORDER BY playback_id`;
    for (const asset of assets) {
      const key = asset.playback_id.slice(slug.length + 1);
      const match = /^s(\d+)-e(\d+)$/.exec(key);
      if (!match) continue;
      const seasonNumber = Number(match[1]);
      const season = seasons.get(seasonNumber) ?? { number: seasonNumber, title: null, episodes: [] };
      seasons.set(seasonNumber, season);
      season.episodes.push({
        id: key, number: Number(match[2]), title: `Épisode ${Number(match[2])}`, synopsis: null, durationLabel: null,
        image: row.poster_url ?? row.hero_url, imageAlt: row.image_alt, playbackId: asset.playback_id, playable: true,
      });
    }
    for (const season of seasons.values()) season.episodes.sort((a, b) => a.number - b.number);
  }

  // Film ou documentaire sans épisodes déclarés : une seule entrée « feature », jouée par le slug (convention du front).
  if (seasons.size === 0 && row.kind !== 'serie') {
    seasons.set(1, {
      number: 1, title: null,
      episodes: [{
        id: 'feature', number: 1, title: row.title, synopsis: row.synopsis, durationLabel: row.duration_label,
        image: row.poster_url ?? row.hero_url, imageAlt: row.image_alt, playbackId: row.slug, playable: row.playable,
      }],
    });
  }

  return {
    ...toCard(row),
    trailerUrl: row.trailer_url,
    presenter: row.presenter,
    meta: { year: row.year, language: row.language, rating: row.rating, genres: row.genres },
    seasons: [...seasons.values()],
  };
}

export interface CollectionView {
  slug: string;
  title: string;
  layout: string;
  badge: string | null;
  viewAllUrl: string | null;
  items: (ProgramCard & { rank: number })[];
}

interface CollectionRow {
  slug: string;
  title: string;
  layout: string;
  badge: string | null;
  view_all_url: string | null;
}

async function loadCollections(sql: Sql, rows: CollectionRow[]): Promise<CollectionView[]> {
  if (rows.length === 0) return [];
  const slugs = rows.map(row => row.slug);
  const items = await sql<(ProgramRow & { collection_slug: string; position: number })[]>`
    SELECT ci.collection_slug, ci.position, ${PROGRAM_COLUMNS(sql)}
    FROM collection_items ci
    JOIN programs p ON p.slug = ci.program_slug AND p.published AND p.kind <> 'brand'
    WHERE ci.collection_slug IN ${sql(slugs)}
    ORDER BY ci.collection_slug, ci.position`;
  return rows.map(row => ({
    slug: row.slug,
    title: row.title,
    layout: row.layout,
    badge: row.badge,
    viewAllUrl: row.view_all_url,
    // Le rang affiché (Top 10 : 1, 2, 3…) découle de la position : une seule source de vérité.
    items: items.filter(item => item.collection_slug === row.slug).map((item, index) => ({ ...toCard(item), rank: index + 1 })),
  }));
}

export async function getCollection(sql: Sql, slug: string): Promise<CollectionView | null> {
  const rows = await sql<CollectionRow[]>`
    SELECT slug, title, layout, badge, view_all_url FROM collections WHERE slug = ${slug} AND published`;
  return (await loadCollections(sql, rows))[0] ?? null;
}

/**
 * `featuredSlug` : phare CONFIGURÉ par l'éditeur (null s'il n'existe pas, n'est pas publié ou n'appartient pas à la thématique — jamais de référence cassée).
 * `fallbackFeaturedSlug` : proposition de repli = programme le mieux classé de la thématique (classement global) ;
 * ne remplace ni n'écrase la configuration, le front l'utilise seulement quand `featuredSlug` est null.
 */
export interface ThemeView { slug: string; title: string; image: string | null; programCount: number; subtitle: string | null; featuredSlug: string | null; fallbackFeaturedSlug: string | null }

/**
 * CTE `ranked(slug, rank, total)` : classement global des programmes publiés (hors marque).
 * 1) Top 10 éditorial (collection `top-10`, par position) ; 2) le reste par audience décroissante ; 3) titre, puis identifiant.
 * Ordre total et déterministe : deux appels successifs donnent le même ordre (pagination stable).
 */
const rankedCte = (sql: Sql) => sql`
  ranked AS (
    SELECT p.slug,
           row_number() OVER (ORDER BY (ci.position IS NULL), ci.position, coalesce(a.views, 0) DESC, p.title, p.slug) AS rank,
           count(*) OVER () AS total
    FROM programs p
    LEFT JOIN collection_items ci ON ci.program_slug = p.slug AND ci.collection_slug = 'top-10'
    LEFT JOIN (
      SELECT m.program_slug AS slug, count(*) AS views
      FROM playback_sessions s JOIN media_assets m ON m.playback_id = s.playback_id
      WHERE s.started_at > now() - make_interval(days => ${AUDIENCE_WINDOW_DAYS}) AND s.watch_seconds >= ${AUDIENCE_MIN_WATCH_SECONDS}
      GROUP BY m.program_slug
    ) a ON a.slug = p.slug
    WHERE p.published AND p.kind <> 'brand'
  )`;

export async function listThemes(sql: Sql): Promise<ThemeView[]> {
  const rows = await sql<{ slug: string; title: string; image_url: string | null; count: string; subtitle: string | null; featured: string | null; fallback: string | null }[]>`
    WITH ${rankedCte(sql)}
    SELECT t.slug, t.title, t.image_url, t.subtitle,
           (SELECT f.slug FROM programs f WHERE f.slug = t.featured_slug AND f.published AND f.kind <> 'brand'
            AND EXISTS (SELECT 1 FROM program_themes m WHERE m.theme_slug = t.slug AND m.program_slug = f.slug)) AS featured,
           (SELECT r.slug FROM program_themes pt JOIN ranked r ON r.slug = pt.program_slug WHERE pt.theme_slug = t.slug ORDER BY r.rank LIMIT 1) AS fallback,
           (SELECT count(*) FROM program_themes pt JOIN programs p ON p.slug = pt.program_slug AND p.published AND p.kind <> 'brand'
            WHERE pt.theme_slug = t.slug)::text AS count
    FROM themes t ORDER BY t.position, t.title`;
  return rows.map(row => ({
    slug: row.slug, title: row.title, image: row.image_url, programCount: Number(row.count),
    subtitle: row.subtitle, featuredSlug: row.featured, fallbackFeaturedSlug: row.fallback,
  }));
}

/** Programmes d'une thématique : le phare configuré d'abord, puis l'ordre du classement global (jamais un ordre arbitraire). */
export async function listProgramsByTheme(sql: Sql, themeSlug: string, limit?: number): Promise<ProgramCard[] | null> {
  const [theme] = await sql`SELECT 1 FROM themes WHERE slug = ${themeSlug}`;
  if (!theme) return null;
  const rows = await sql<ProgramRow[]>`
    WITH ${rankedCte(sql)}
    SELECT ${PROGRAM_COLUMNS(sql)} FROM programs p
    JOIN program_themes pt ON pt.program_slug = p.slug AND pt.theme_slug = ${themeSlug}
    JOIN ranked r ON r.slug = p.slug
    ORDER BY (p.slug = (SELECT featured_slug FROM themes WHERE slug = ${themeSlug})) DESC NULLS LAST, r.rank
    ${limit ? sql`LIMIT ${limit}` : sql``}`;
  return rows.map(toCard);
}

export interface RankedCard { rank: number; program: ProgramCard }

/** Classement complet (voir `rankedCte` pour la règle). */
export async function getRanking(sql: Sql, limit: number, offset: number): Promise<{ total: number; items: RankedCard[] }> {
  const rows = await sql<(ProgramRow & { total: string; rank: string })[]>`
    WITH ${rankedCte(sql)}
    SELECT ${PROGRAM_COLUMNS(sql)}, r.total::text AS total, r.rank::text AS rank
    FROM ranked r JOIN programs p ON p.slug = r.slug
    ORDER BY r.rank LIMIT ${limit} OFFSET ${offset}`;
  let total = Number(rows[0]?.total ?? 0);
  if (rows.length === 0 && offset > 0) {
    const [count] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM programs WHERE published AND kind <> 'brand'`;
    total = Number(count?.n ?? 0);
  }
  return { total, items: rows.map(row => ({ rank: Number(row.rank), program: toCard(row) })) };
}

export interface CreatorView {
  slug: string;
  name: string;
  /** Titre honorifique (« Apôtre », « Pasteur »…). */
  alias: string | null;
  /** Domaine d'expression (« Prédication », « Enseignement », « Louange »). */
  domain: string | null;
  tagline: string | null;
  /** Couleur d'ambiance de l'univers, « R G B ». */
  accent: string | null;
  showTitle: string | null;
  intro: string | null;
  themes: string[];
  ambience: string | null;
  image: string | null;
  imageAlt: string | null;
  imageFocus: string | null;
  isProvisional: boolean;
}

export async function listCreators(sql: Sql): Promise<CreatorView[]> {
  const rows = await sql<{
    slug: string; name: string; alias: string | null; domain: string | null; tagline: string | null; accent: string | null;
    show_title: string | null; intro: string | null; themes: string[]; ambience: string | null;
    image_url: string | null; image_alt: string | null; image_focus: string | null; is_provisional: boolean;
  }[]>`
    SELECT slug, name, alias, domain, tagline, accent, show_title, intro, themes, ambience, image_url, image_alt, image_focus, is_provisional
    FROM creators WHERE published ORDER BY position, name`;
  return rows.map(row => ({
    slug: row.slug, name: row.name, alias: row.alias, domain: row.domain, tagline: row.tagline, accent: row.accent, showTitle: row.show_title, intro: row.intro, themes: row.themes, ambience: row.ambience,
    image: row.image_url, imageAlt: row.image_alt, imageFocus: row.image_focus, isProvisional: row.is_provisional,
  }));
}

/** Page d'accueil complète en UN appel : collections publiées placées sur l'accueil, thèmes, créateurs. */
/** Thématique de l'accueil : ses premiers programmes (10 au plus) accompagnent la thématique, même s'ils ne sont dans aucune collection. */
export interface HomeThemeView extends ThemeView { programs: ProgramCard[] }
const HOME_THEME_PROGRAMS = 10;

export async function getHome(sql: Sql): Promise<{ collections: CollectionView[]; themes: HomeThemeView[]; creators: CreatorView[] }> {
  const rows = await sql<CollectionRow[]>`
    SELECT slug, title, layout, badge, view_all_url FROM collections
    WHERE published AND home_position IS NOT NULL ORDER BY home_position`;
  const [collections, themes, creators] = await Promise.all([loadCollections(sql, rows), listThemes(sql), listCreators(sql)]);
  const withPrograms = await Promise.all(themes.map(async theme => ({ ...theme, programs: (await listProgramsByTheme(sql, theme.slug, HOME_THEME_PROGRAMS)) ?? [] })));
  return { collections, themes: withPrograms, creators };
}

/** Texte de recherche → mots « pliés » (sans accents, minuscules), bornés. Même règle que `origin_fold` en base. */
export function foldQuery(query: string): string[] {
  return query
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[œ]/g, 'o').replace(/[æ]/g, 'a')
    .split(/[^a-z0-9]+/).filter(token => token.length > 0)
    .slice(0, 5);
}

/**
 * Recherche : chaque mot doit se retrouver (début de mot ou milieu) dans le titre, la catégorie, l'accroche,
 * le présentateur, les genres ou une thématique. Les titres qui COMMENCENT par le mot passent en premier.
 */
export async function searchPrograms(sql: Sql, tokens: string[], limit: number): Promise<ProgramCard[]> {
  if (tokens.length === 0) return [];
  const clauses = tokens.map(token => {
    const like = `%${token}%`;
    return sql`(p.search_text LIKE ${like} OR EXISTS (
      SELECT 1 FROM program_themes pt JOIN themes t ON t.slug = pt.theme_slug
      WHERE pt.program_slug = p.slug AND origin_fold(t.title) LIKE ${like}))`;
  });
  const where = clauses.reduce((all, clause, index) => (index === 0 ? clause : sql`${all} AND ${clause}`));
  const score = tokens
    .map(token => sql`(CASE WHEN origin_fold(p.title) LIKE ${token + '%'} THEN 3 WHEN origin_fold(p.title) LIKE ${'%' + token + '%'} THEN 2 ELSE 1 END)`)
    .reduce((all, part, index) => (index === 0 ? part : sql`${all} + ${part}`));
  const rows = await sql<ProgramRow[]>`
    SELECT ${PROGRAM_COLUMNS(sql)} FROM programs p
    WHERE p.published AND p.kind <> 'brand' AND ${where}
    ORDER BY ${score} DESC, p.title
    LIMIT ${limit}`;
  return rows.map(toCard);
}

export async function searchCreators(sql: Sql, tokens: string[], limit: number): Promise<CreatorView[]> {
  if (tokens.length === 0) return [];
  const all = await listCreators(sql);
  return all.filter(creator => {
    const haystack = foldQuery(`${creator.name} ${creator.showTitle ?? ''} ${creator.themes.join(' ')}`).join(' ');
    return tokens.every(token => haystack.includes(token));
  }).slice(0, limit);
}

/** Fiches résumées de plusieurs programmes publiés (slug → fiche) : sert aux recommandations. */
export async function getCards(sql: Sql, slugs: string[]): Promise<Map<string, ProgramCard>> {
  if (slugs.length === 0) return new Map();
  const rows = await sql<ProgramRow[]>`
    SELECT ${PROGRAM_COLUMNS(sql)} FROM programs p
    WHERE p.slug IN ${sql(slugs)} AND p.published AND p.kind <> 'brand'`;
  return new Map(rows.map(row => [row.slug, toCard(row)]));
}

// ---- Univers d'un créateur ---------------------------------------------------------------------------------------------------

export type CreatorContentKind = 'message' | 'conference' | 'serie' | 'live';

export interface CreatorUniverse {
  creator: CreatorView;
  chapters: { mark: string; title: string; text: string }[];
  /** Rubriques présentes (dans l'ordre d'affichage) avec leur nombre de contenus. */
  kinds: { kind: CreatorContentKind; count: number }[];
  contents: {
    kind: CreatorContentKind;
    /** « À la une ». */
    featured: boolean;
    /** « Ép. 01 ». */
    episodeLabel: string | null;
    /** Créneau d'un direct (ISO 8601). La diffusion en direct elle-même n'existe pas encore : `program.playable` reste faux. */
    liveAt: string | null;
    program: ProgramCard;
  }[];
}

const KIND_ORDER: CreatorContentKind[] = ['message', 'conference', 'serie', 'live'];

export async function getCreatorUniverse(sql: Sql, slug: string): Promise<CreatorUniverse | null> {
  const creators = await listCreators(sql);
  const creator = creators.find(item => item.slug === slug);
  if (!creator) return null;
  const [chapterRow] = await sql<{ chapters: { mark: string; title: string; text: string }[] }[]>`SELECT chapters FROM creators WHERE slug = ${slug}`;
  const rows = await sql<{ program_slug: string; kind: CreatorContentKind; featured: boolean; episode_label: string | null; live_at: Date | null }[]>`
    SELECT program_slug, kind, featured, episode_label, live_at FROM creator_contents WHERE creator_slug = ${slug} ORDER BY position`;
  const cards = await getCards(sql, rows.map(row => row.program_slug));
  // Un programme non publié (brouillon) n'apparaît jamais dans l'univers public.
  const contents = rows.flatMap(row => {
    const program = cards.get(row.program_slug);
    return program ? [{ kind: row.kind, featured: row.featured, episodeLabel: row.episode_label, liveAt: row.live_at?.toISOString() ?? null, program }] : [];
  });
  return {
    creator,
    chapters: chapterRow?.chapters ?? [],
    kinds: KIND_ORDER.flatMap(kind => {
      const count = contents.filter(item => item.kind === kind).length;
      return count > 0 ? [{ kind, count }] : [];
    }),
    contents,
  };
}

// ---- Recherche : vocabulaire et suggestions ------------------------------------------------------------------------------------

/** Mots connus du catalogue publié (pliés) avec leur fréquence : sert à corriger les fautes de frappe. */
export async function loadSearchVocabulary(sql: Sql): Promise<Map<string, number>> {
  const rows = await sql<{ word: string; n: string }[]>`
    SELECT word, count(*)::text AS n FROM (
      SELECT regexp_split_to_table(p.search_text, '[^a-z0-9]+') AS word FROM programs p WHERE p.published AND p.kind <> 'brand'
      UNION ALL
      SELECT regexp_split_to_table(origin_fold(t.title), '[^a-z0-9]+') FROM themes t
      UNION ALL
      SELECT regexp_split_to_table(origin_fold(c.name), '[^a-z0-9]+') FROM creators c WHERE c.published
    ) w WHERE char_length(word) >= 3 GROUP BY word`;
  return new Map(rows.map(row => [row.word, Number(row.n)]));
}

export interface Suggestion {
  type: 'program' | 'creator' | 'theme';
  slug: string;
  label: string;
}

/** Complétions pour la barre de recherche : titres, créateurs et thématiques dont un mot COMMENCE par la saisie. */
export async function suggest(sql: Sql, tokens: string[], limit: number): Promise<Suggestion[]> {
  if (tokens.length === 0) return [];
  const last = tokens[tokens.length - 1] ?? '';
  const head = tokens.slice(0, -1);
  const headLikes = `{${head.map(token => `"%${token}%"`).join(',')}}`; // tokens = [a-z0-9] seulement : sans danger
  const programs = await sql<{ slug: string; title: string }[]>`
    SELECT p.slug, p.title FROM programs p
    WHERE p.published AND p.kind <> 'brand' AND p.search_text ~ ${'(^| )' + last} AND p.search_text LIKE ALL (${headLikes}::text[])
    ORDER BY (origin_fold(p.title) LIKE ${last + '%'}) DESC, p.title LIMIT ${limit}`;
  const themes = await sql<{ slug: string; title: string }[]>`
    SELECT t.slug, t.title FROM themes t WHERE origin_fold(t.title) ~ ${'(^| )' + last} ORDER BY t.title LIMIT 3`;
  const creators = (await listCreators(sql))
    .filter(creator => foldQuery(creator.name).some(word => word.startsWith(last)))
    .slice(0, 3);
  return [
    ...programs.map(row => ({ type: 'program' as const, slug: row.slug, label: row.title })),
    ...creators.map(creator => ({ type: 'creator' as const, slug: creator.slug, label: creator.name })),
    ...themes.map(row => ({ type: 'theme' as const, slug: row.slug, label: row.title })),
  ].slice(0, limit);
}

// ---- « Prochainement » -----------------------------------------------------------------------------------------------------------

export interface ComingSoonCard {
  slug: string;
  title: string;
  kind: string;
  tagline: string | null;
  image: string | null;
  imageAlt: string | null;
  /** Date de sortie prévue (ISO 8601). */
  releaseAt: string;
}

/** Programmes annoncés mais pas encore publiés, du plus proche au plus lointain. La fiche complète et la lecture restent inaccessibles jusqu'à la sortie. */
export async function listComingSoon(sql: Sql, limit: number): Promise<ComingSoonCard[]> {
  const rows = await sql<{ slug: string; title: string; kind: string; tagline: string | null; poster_url: string | null; hero_url: string | null; image_alt: string | null; publish_at: Date }[]>`
    SELECT slug, title, kind, tagline, poster_url, hero_url, image_alt, publish_at FROM programs
    WHERE NOT published AND announced AND publish_at IS NOT NULL AND publish_at > now() AND kind <> 'brand'
    ORDER BY publish_at, title LIMIT ${limit}`;
  return rows.map(row => ({
    slug: row.slug, title: row.title, kind: row.kind, tagline: row.tagline, image: row.poster_url ?? row.hero_url, imageAlt: row.image_alt, releaseAt: row.publish_at.toISOString(),
  }));
}
