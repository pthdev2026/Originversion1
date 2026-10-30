/**
 * Module « catalog » — écriture éditoriale (administrateur uniquement).
 *
 * Chaque fonction applique un document COMPLET dans une transaction : « voici l'état voulu de ce programme ».
 * C'est plus simple et plus sûr que des modifications champ par champ (pas d'état à moitié appliqué).
 */
import type { Executor, Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';

/** `text[]` depuis un tableau JS, sans dépendre du typage des paramètres du pilote. */
const textArray = (sql: Executor, values: string[]) =>
  sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(values)}::text::jsonb))`;

export interface ProgramInput {
  kind: 'film' | 'serie' | 'documentaire';
  title: string;
  titleLines: string[];
  tagline: string | null;
  synopsis: string | null;
  category: string | null;
  durationLabel: string | null;
  year: number | null;
  language: string | null;
  rating: string | null;
  presenter: string | null;
  genres: string[];
  keywords: string[];
  badges: string[];
  posterUrl: string | null;
  heroUrl: string | null;
  logoUrl: string | null;
  heroVideoUrl: string | null;
  trailerUrl: string | null;
  imageAlt: string | null;
  imageFocus: string | null;
  titleStyle: 'condensed' | 'serif' | 'bebas' | 'italic-serif' | null;
  isDemo: boolean;
  published: boolean;
  publishAt: string | null;
  unpublishAt: string | null;
  announced: boolean;
  themes: string[];
  seasons: {
    number: number;
    title: string | null;
    episodes: { key: string; number: number; title: string; synopsis: string | null; durationLabel: string | null; imageUrl: string | null; imageAlt: string | null }[];
  }[];
}

/** Crée ou remplace un programme, ses saisons/épisodes et ses thèmes. Les médias (media_assets) ne sont jamais touchés. */
export async function upsertProgram(sql: Sql, slug: string, input: ProgramInput): Promise<'created' | 'updated'> {
  return sql.begin(async tx => {
    // Deux administrateurs qui enregistrent le même programme en même temps : le second attend le premier.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${'program:' + slug}))`;
    const [existing] = await tx`SELECT 1 FROM programs WHERE slug = ${slug}`;
    await tx`
      INSERT INTO programs (slug, kind, title, title_lines, tagline, synopsis, category, duration_label, year, language, rating,
                            presenter, genres, keywords, badges, poster_url, hero_url, logo_url, hero_video_url, trailer_url, image_alt,
                            image_focus, title_style, is_demo, published, publish_at, unpublish_at, announced)
      VALUES (${slug}, ${input.kind}, ${input.title}, ${textArray(tx, input.titleLines)}, ${input.tagline}, ${input.synopsis},
              ${input.category}, ${input.durationLabel}, ${input.year}, ${input.language}, ${input.rating}, ${input.presenter},
              ${textArray(tx, input.genres)}, ${textArray(tx, input.keywords)}, ${textArray(tx, input.badges)}, ${input.posterUrl}, ${input.heroUrl}, ${input.logoUrl},
              ${input.heroVideoUrl}, ${input.trailerUrl}, ${input.imageAlt}, ${input.imageFocus}, ${input.titleStyle},
              ${input.isDemo}, ${input.published}, ${input.publishAt ? new Date(input.publishAt) : null}, ${input.unpublishAt ? new Date(input.unpublishAt) : null}, ${input.announced})
      ON CONFLICT (slug) DO UPDATE SET
        kind = EXCLUDED.kind, title = EXCLUDED.title, title_lines = EXCLUDED.title_lines, tagline = EXCLUDED.tagline,
        synopsis = EXCLUDED.synopsis, category = EXCLUDED.category, duration_label = EXCLUDED.duration_label, year = EXCLUDED.year,
        language = EXCLUDED.language, rating = EXCLUDED.rating, presenter = EXCLUDED.presenter, genres = EXCLUDED.genres, keywords = EXCLUDED.keywords,
        badges = EXCLUDED.badges, poster_url = EXCLUDED.poster_url, hero_url = EXCLUDED.hero_url, logo_url = EXCLUDED.logo_url,
        hero_video_url = EXCLUDED.hero_video_url, trailer_url = EXCLUDED.trailer_url, image_alt = EXCLUDED.image_alt,
        image_focus = EXCLUDED.image_focus, title_style = EXCLUDED.title_style, is_demo = EXCLUDED.is_demo,
        published = EXCLUDED.published, publish_at = EXCLUDED.publish_at, unpublish_at = EXCLUDED.unpublish_at, announced = EXCLUDED.announced,
        -- Nouvelle date de sortie = nouvelle décision éditoriale : le blocage est levé et la sortie sera réévaluée à cette date.
        release_blocked_at = CASE WHEN programs.publish_at IS DISTINCT FROM EXCLUDED.publish_at THEN NULL ELSE programs.release_blocked_at END,
        release_blocked_missing = CASE WHEN programs.publish_at IS DISTINCT FROM EXCLUDED.publish_at THEN '[]'::jsonb ELSE programs.release_blocked_missing END,
        updated_at = now()`;

    // Saisons et épisodes : remplacés d'un bloc (les médias, eux, sont rattachés par identifiant de lecture).
    await tx`DELETE FROM seasons WHERE program_slug = ${slug}`;
    for (const season of input.seasons) {
      await tx`INSERT INTO seasons (program_slug, number, title) VALUES (${slug}, ${season.number}, ${season.title})`;
      for (const e of season.episodes) {
        await tx`
          INSERT INTO episodes (program_slug, season_number, number, key, title, synopsis, duration_label, image_url, image_alt)
          VALUES (${slug}, ${season.number}, ${e.number}, ${e.key}, ${e.title}, ${e.synopsis}, ${e.durationLabel}, ${e.imageUrl}, ${e.imageAlt})`;
      }
    }

    // Thèmes : ils doivent exister (sinon on le dit clairement plutôt que de planter sur une clé étrangère).
    await tx`DELETE FROM program_themes WHERE program_slug = ${slug}`;
    if (input.themes.length > 0) {
      const known = await tx<{ slug: string }[]>`SELECT slug FROM themes WHERE slug IN ${tx(input.themes)}`;
      const missing = input.themes.filter(theme => !known.some(row => row.slug === theme));
      if (missing.length > 0) throw errors.badRequest(`Thèmes inconnus : ${missing.join(', ')}.`);
      for (const theme of input.themes) {
        await tx`INSERT INTO program_themes (program_slug, theme_slug) VALUES (${slug}, ${theme})`;
      }
    }
    return existing ? 'updated' : 'created';
  });
}

export async function deleteProgram(sql: Sql, slug: string): Promise<boolean> {
  // Les médias liés disparaissent aussi (ON DELETE CASCADE) : c'est voulu, un programme supprimé n'est plus lisible.
  const rows = await sql`DELETE FROM programs WHERE slug = ${slug} AND kind <> 'brand' RETURNING slug`;
  return rows.length > 0;
}

/** `subtitle` et `featuredSlug` absents = conservés (les anciens clients de la route ne les effacent pas) ; `null` = effacé. */
export interface ThemeInput { title: string; imageUrl: string | null; position: number; subtitle?: string | null; featuredSlug?: string | null }

export async function upsertTheme(sql: Sql, slug: string, input: ThemeInput): Promise<void> {
  const subtitleGiven = input.subtitle !== undefined;
  const featuredGiven = input.featuredSlug !== undefined;
  await sql`
    INSERT INTO themes (slug, title, image_url, position, subtitle, featured_slug)
    VALUES (${slug}, ${input.title}, ${input.imageUrl}, ${input.position}, ${input.subtitle ?? null}, ${input.featuredSlug ?? null})
    ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, image_url = EXCLUDED.image_url, position = EXCLUDED.position,
      subtitle = CASE WHEN ${subtitleGiven} THEN EXCLUDED.subtitle ELSE themes.subtitle END,
      featured_slug = CASE WHEN ${featuredGiven} THEN EXCLUDED.featured_slug ELSE themes.featured_slug END`;
}

export async function deleteTheme(sql: Sql, slug: string): Promise<boolean> {
  return (await sql`DELETE FROM themes WHERE slug = ${slug} RETURNING slug`).length > 0;
}

export interface CreatorInput {
  name: string;
  alias: string | null;
  domain: string | null;
  tagline: string | null;
  accent: string | null;
  chapters: { mark: string; title: string; text: string }[];
  showTitle: string | null;
  intro: string | null;
  themes: string[];
  ambience: 'ember' | 'bordeaux' | 'graphite' | 'amber' | 'night' | null;
  imageUrl: string | null;
  imageAlt: string | null;
  imageFocus: string | null;
  isProvisional: boolean;
  published: boolean;
  position: number;
}

export async function upsertCreator(sql: Sql, slug: string, input: CreatorInput): Promise<void> {
  await sql`
    INSERT INTO creators (slug, name, alias, domain, tagline, accent, chapters, show_title, intro, themes, ambience, image_url, image_alt, image_focus, is_provisional, published, position)
    VALUES (${slug}, ${input.name}, ${input.alias}, ${input.domain}, ${input.tagline}, ${input.accent}, ${sql.json(input.chapters as never)},
            ${input.showTitle}, ${input.intro}, ${textArray(sql, input.themes)}, ${input.ambience},
            ${input.imageUrl}, ${input.imageAlt}, ${input.imageFocus}, ${input.isProvisional}, ${input.published}, ${input.position})
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name, alias = EXCLUDED.alias, domain = EXCLUDED.domain, tagline = EXCLUDED.tagline, accent = EXCLUDED.accent,
      chapters = EXCLUDED.chapters, show_title = EXCLUDED.show_title, intro = EXCLUDED.intro, themes = EXCLUDED.themes,
      ambience = EXCLUDED.ambience, image_url = EXCLUDED.image_url, image_alt = EXCLUDED.image_alt,
      image_focus = EXCLUDED.image_focus, is_provisional = EXCLUDED.is_provisional, published = EXCLUDED.published,
      position = EXCLUDED.position`;
}

export async function deleteCreator(sql: Sql, slug: string): Promise<boolean> {
  return (await sql`DELETE FROM creators WHERE slug = ${slug} RETURNING slug`).length > 0;
}

export interface CollectionInput {
  title: string;
  layout: 'hero' | 'ranked' | 'rail' | 'portrait' | 'panels' | 'universes';
  badge: string | null;
  viewAllUrl: string | null;
  homePosition: number | null;
  published: boolean;
  /** Slugs des programmes, dans l'ordre d'affichage. */
  items: string[];
}

export async function upsertCollection(sql: Sql, slug: string, input: CollectionInput): Promise<void> {
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${'collection:' + slug}))`;
    await tx`
      INSERT INTO collections (slug, title, layout, badge, view_all_url, home_position, published)
      VALUES (${slug}, ${input.title}, ${input.layout}, ${input.badge}, ${input.viewAllUrl}, ${input.homePosition}, ${input.published})
      ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title, layout = EXCLUDED.layout, badge = EXCLUDED.badge, view_all_url = EXCLUDED.view_all_url,
        home_position = EXCLUDED.home_position, published = EXCLUDED.published, updated_at = now()`;
    await tx`DELETE FROM collection_items WHERE collection_slug = ${slug}`;
    if (input.items.length > 0) {
      const known = await tx<{ slug: string }[]>`SELECT slug FROM programs WHERE slug IN ${tx(input.items)}`;
      const missing = input.items.filter(item => !known.some(row => row.slug === item));
      if (missing.length > 0) throw errors.badRequest(`Programmes inconnus : ${missing.join(', ')}.`);
      for (const [position, program] of input.items.entries()) {
        await tx`INSERT INTO collection_items (collection_slug, program_slug, position) VALUES (${slug}, ${program}, ${position})`;
      }
    }
  });
}

export async function deleteCollection(sql: Sql, slug: string): Promise<boolean> {
  return (await sql`DELETE FROM collections WHERE slug = ${slug} RETURNING slug`).length > 0;
}

/** Vue complète pour l'administration : brouillons inclus. */
export async function listAllForAdmin(sql: Sql): Promise<{
  programs: { slug: string; kind: string; title: string; published: boolean; isDemo: boolean }[];
  collections: { slug: string; title: string; layout: string; published: boolean; homePosition: number | null; itemCount: number }[];
}> {
  const programs = await sql<{ slug: string; kind: string; title: string; published: boolean; is_demo: boolean }[]>`
    SELECT slug, kind, title, published, is_demo FROM programs WHERE kind <> 'brand' ORDER BY title`;
  const collections = await sql<{ slug: string; title: string; layout: string; published: boolean; home_position: number | null; count: string }[]>`
    SELECT c.slug, c.title, c.layout, c.published, c.home_position,
           (SELECT count(*) FROM collection_items i WHERE i.collection_slug = c.slug)::text AS count
    FROM collections c ORDER BY c.home_position NULLS LAST, c.title`;
  return {
    programs: programs.map(r => ({ slug: r.slug, kind: r.kind, title: r.title, published: r.published, isDemo: r.is_demo })),
    collections: collections.map(r => ({ slug: r.slug, title: r.title, layout: r.layout, published: r.published, homePosition: r.home_position, itemCount: Number(r.count) })),
  };
}

// ---- Lecture « administration » d'un programme (brouillons inclus) -----------------------------------------------------

export interface AdminProgramView {
  slug: string;
  createdAt: string;
  updatedAt: string;
  /** Même forme que le corps de `PUT /api/admin/programs/:slug` : on peut le modifier puis le renvoyer tel quel. */
  document: ProgramInput;
  /** Médias rattachés au programme, quel que soit leur statut (en préparation, prêt, échec). */
  media: { playbackId: string; status: string; durationSeconds: number | null; createdAt: string; markers: { introStartSeconds: number | null; introEndSeconds: number | null; creditsStartSeconds: number | null } }[];
  /** Dernières tâches de préparation du programme (les plus récentes d'abord). */
  jobs: {
    id: string; playbackId: string; status: string; step: string | null; progress: number;
    attempts: number; maxAttempts: number; lastError: string | null;
    createdAt: string; startedAt: string | null; finishedAt: string | null;
  }[];
}

export async function getProgramForAdmin(sql: Sql, slug: string): Promise<AdminProgramView | null> {
  const [p] = await sql<{
    slug: string; kind: ProgramInput['kind']; title: string; title_lines: string[]; tagline: string | null; synopsis: string | null;
    category: string | null; duration_label: string | null; year: number | null; language: string | null; rating: string | null;
    presenter: string | null; genres: string[]; keywords: string[]; badges: string[]; poster_url: string | null; hero_url: string | null; logo_url: string | null;
    hero_video_url: string | null; trailer_url: string | null; image_alt: string | null; image_focus: string | null;
    title_style: ProgramInput['titleStyle']; is_demo: boolean; published: boolean; publish_at: Date | null; unpublish_at: Date | null; announced: boolean; created_at: Date; updated_at: Date;
  }[]>`SELECT * FROM programs WHERE slug = ${slug} AND kind <> 'brand'`;
  if (!p) return null;

  const [themes, seasons, episodes, media, jobs] = await Promise.all([
    sql<{ theme_slug: string }[]>`SELECT theme_slug FROM program_themes WHERE program_slug = ${slug} ORDER BY theme_slug`,
    sql<{ number: number; title: string | null }[]>`SELECT number, title FROM seasons WHERE program_slug = ${slug} ORDER BY number`,
    sql<{ season_number: number; number: number; key: string; title: string; synopsis: string | null; duration_label: string | null; image_url: string | null; image_alt: string | null }[]>`
      SELECT season_number, number, key, title, synopsis, duration_label, image_url, image_alt FROM episodes WHERE program_slug = ${slug} ORDER BY season_number, number`,
    sql<{ playback_id: string; status: string; duration_seconds: string | null; created_at: Date; intro_start_seconds: string | null; intro_end_seconds: string | null; credits_start_seconds: string | null }[]>`
      SELECT playback_id, status, duration_seconds::text, created_at, intro_start_seconds::text, intro_end_seconds::text, credits_start_seconds::text FROM media_assets WHERE program_slug = ${slug} ORDER BY playback_id`,
    sql<{
      id: string; playback_id: string; status: string; step: string | null; progress: string; attempts: number; max_attempts: number;
      last_error: string | null; created_at: Date; started_at: Date | null; finished_at: Date | null;
    }[]>`SELECT id, playback_id, status, step, progress::text, attempts, max_attempts, last_error, created_at, started_at, finished_at
         FROM media_jobs WHERE program_slug = ${slug} ORDER BY created_at DESC LIMIT 10`,
  ]);

  return {
    slug: p.slug,
    createdAt: p.created_at.toISOString(),
    updatedAt: p.updated_at.toISOString(),
    document: {
      kind: p.kind, title: p.title, titleLines: p.title_lines, tagline: p.tagline, synopsis: p.synopsis, category: p.category,
      durationLabel: p.duration_label, year: p.year, language: p.language, rating: p.rating, presenter: p.presenter,
      genres: p.genres, keywords: p.keywords, badges: p.badges, posterUrl: p.poster_url, heroUrl: p.hero_url, logoUrl: p.logo_url,
      heroVideoUrl: p.hero_video_url, trailerUrl: p.trailer_url, imageAlt: p.image_alt, imageFocus: p.image_focus,
      titleStyle: p.title_style, isDemo: p.is_demo, published: p.published,
      publishAt: p.publish_at?.toISOString() ?? null, unpublishAt: p.unpublish_at?.toISOString() ?? null, announced: p.announced,
      themes: themes.map(row => row.theme_slug),
      seasons: seasons.map(season => ({
        number: season.number,
        title: season.title,
        episodes: episodes.filter(e => e.season_number === season.number).map(e => ({
          key: e.key, number: e.number, title: e.title, synopsis: e.synopsis, durationLabel: e.duration_label, imageUrl: e.image_url, imageAlt: e.image_alt,
        })),
      })),
    },
    media: media.map(m => ({ playbackId: m.playback_id, status: m.status, durationSeconds: m.duration_seconds === null ? null : Number(m.duration_seconds), createdAt: m.created_at.toISOString(),
      markers: { introStartSeconds: m.intro_start_seconds === null ? null : Number(m.intro_start_seconds), introEndSeconds: m.intro_end_seconds === null ? null : Number(m.intro_end_seconds), creditsStartSeconds: m.credits_start_seconds === null ? null : Number(m.credits_start_seconds) } })),
    jobs: jobs.map(j => ({
      id: j.id, playbackId: j.playback_id, status: j.status, step: j.step, progress: Number(j.progress), attempts: j.attempts, maxAttempts: j.max_attempts,
      lastError: j.last_error, createdAt: j.created_at.toISOString(), startedAt: j.started_at?.toISOString() ?? null, finishedAt: j.finished_at?.toISOString() ?? null,
    })),
  };
}

// ---- Univers de créateur : contenus et lecture « administration » ------------------------------------------------------------

export interface CreatorContentInput {
  program: string;
  kind: 'message' | 'conference' | 'serie' | 'live';
  featured: boolean;
  episodeLabel: string | null;
  liveAt: string | null;
}

/** Remplace tous les contenus d'un créateur (transaction, sous verrou). Retourne false si le créateur n'existe pas. */
export async function replaceCreatorContents(sql: Sql, slug: string, contents: CreatorContentInput[]): Promise<boolean> {
  return sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${'creator:' + slug}))`;
    const [creator] = await tx`SELECT 1 FROM creators WHERE slug = ${slug}`;
    if (!creator) return false;
    if (contents.length > 0) {
      const programs = contents.map(item => item.program);
      const known = await tx<{ slug: string }[]>`SELECT slug FROM programs WHERE slug IN ${tx(programs)} AND kind <> 'brand'`;
      const missing = programs.filter(program => !known.some(row => row.slug === program));
      if (missing.length > 0) throw errors.badRequest(`Programmes inconnus : ${missing.join(', ')}.`);
    }
    await tx`DELETE FROM creator_contents WHERE creator_slug = ${slug}`;
    for (const [position, item] of contents.entries()) {
      await tx`
        INSERT INTO creator_contents (creator_slug, program_slug, kind, featured, episode_label, live_at, position)
        VALUES (${slug}, ${item.program}, ${item.kind}, ${item.featured}, ${item.episodeLabel}, ${item.liveAt}, ${position})`;
    }
    return true;
  });
}

export interface AdminCreatorView {
  slug: string;
  /** Même forme que le corps de `PUT /api/admin/creators/:slug`. */
  document: CreatorInput;
  /** Même forme que le corps de `PUT /api/admin/creators/:slug/contents`. */
  contents: CreatorContentInput[];
}

export async function listCreatorsForAdmin(sql: Sql): Promise<{ slug: string; name: string; published: boolean; contentCount: number }[]> {
  const rows = await sql<{ slug: string; name: string; published: boolean; count: string }[]>`
    SELECT c.slug, c.name, c.published, (SELECT count(*) FROM creator_contents x WHERE x.creator_slug = c.slug)::text AS count
    FROM creators c ORDER BY c.position, c.name`;
  return rows.map(row => ({ slug: row.slug, name: row.name, published: row.published, contentCount: Number(row.count) }));
}

export async function getCreatorForAdmin(sql: Sql, slug: string): Promise<AdminCreatorView | null> {
  const [c] = await sql<{
    slug: string; name: string; alias: string | null; domain: string | null; tagline: string | null; accent: string | null;
    chapters: { mark: string; title: string; text: string }[]; show_title: string | null; intro: string | null; themes: string[];
    ambience: CreatorInput['ambience']; image_url: string | null; image_alt: string | null; image_focus: string | null;
    is_provisional: boolean; published: boolean; position: number;
  }[]>`SELECT * FROM creators WHERE slug = ${slug}`;
  if (!c) return null;
  const contents = await sql<{ program_slug: string; kind: CreatorContentInput['kind']; featured: boolean; episode_label: string | null; live_at: Date | null }[]>`
    SELECT program_slug, kind, featured, episode_label, live_at FROM creator_contents WHERE creator_slug = ${slug} ORDER BY position`;
  return {
    slug: c.slug,
    document: {
      name: c.name, alias: c.alias, domain: c.domain, tagline: c.tagline, accent: c.accent, chapters: c.chapters, showTitle: c.show_title,
      intro: c.intro, themes: c.themes, ambience: c.ambience, imageUrl: c.image_url, imageAlt: c.image_alt, imageFocus: c.image_focus,
      isProvisional: c.is_provisional, published: c.published, position: c.position,
    },
    contents: contents.map(row => ({ program: row.program_slug, kind: row.kind, featured: row.featured, episodeLabel: row.episode_label, liveAt: row.live_at?.toISOString() ?? null })),
  };
}

/** Journal des modifications du catalogue (événements `catalog.*` du journal d'audit), les plus récentes d'abord. */
export async function listCatalogAudit(sql: Sql, limit: number, before: number | null) {
  return sql<{ id: string; event: string; user_id: string | null; email: string | null; details: unknown; created_at: Date }[]>`
    SELECT a.id::text, a.event, a.user_id, u.email, a.details, a.created_at
    FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.event LIKE 'catalog.%' ${before ? sql`AND a.id < ${before}` : sql``}
    ORDER BY a.id DESC LIMIT ${limit}`;
}

// ---- Programmation : sorties et retraits planifiés -------------------------------------------------------------------------------

/**
 * Médias OBLIGATOIRES encore manquants d'un programme (identifiants de lecture) ; liste vide = prêt à être publié.
 * Film/documentaire : un média prêt. Série : chaque épisode déclaré a son média prêt (sans épisode déclaré : au moins un média prêt).
 */
export async function missingMedia(sql: Executor, slug: string): Promise<string[]> {
  const [program] = await sql<{ kind: string }[]>`SELECT kind FROM programs WHERE slug = ${slug}`;
  if (!program) return [slug];
  if (program.kind === 'serie') {
    const rows = await sql<{ id: string }[]>`
      SELECT e.program_slug || '-' || e.key AS id FROM episodes e
      WHERE e.program_slug = ${slug}
        AND NOT EXISTS (SELECT 1 FROM media_assets m WHERE m.playback_id = e.program_slug || '-' || e.key AND m.status = 'ready')
      ORDER BY e.season_number, e.number`;
    if (rows.length > 0) return rows.map(row => row.id);
    const [declared] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM episodes WHERE program_slug = ${slug}`;
    if (Number(declared?.n ?? 0) > 0) return [];
  }
  const [ready] = await sql`SELECT 1 FROM media_assets WHERE program_slug = ${slug} AND status = 'ready' LIMIT 1`;
  return ready ? [] : [slug];
}

export interface BlockedRelease { slug: string; title: string; missing: string[] }

/**
 * Applique les dates prévues. RETRAITS : un programme public dont `unpublishAt` est arrivé repasse en brouillon.
 * SORTIES : un brouillon dont `publishAt` est arrivé est publié SEULEMENT si tous ses médias obligatoires sont prêts ;
 * sinon la sortie est BLOQUÉE (une seule fois : `blocked` ne renvoie que les nouveaux blocages) et ne repart pas toute seule, même quand
 * les médias deviennent prêts plus tard : il faut une validation éditoriale (`validateRelease`) ou une nouvelle date.
 * Idempotent et sans risque si plusieurs instances l'exécutent en même temps (chaque ligne n'est basculée qu'une fois).
 */
export async function applySchedule(sql: Sql, now: Date = new Date()): Promise<{ released: string[]; expired: string[]; blocked: BlockedRelease[] }> {
  const due = await sql<{ slug: string; title: string }[]>`
    SELECT slug, title FROM programs WHERE NOT published AND publish_at IS NOT NULL AND publish_at <= ${now} AND release_blocked_at IS NULL ORDER BY publish_at`;
  const released: string[] = [];
  const blocked: BlockedRelease[] = [];
  for (const program of due) {
    const missing = await missingMedia(sql, program.slug);
    if (missing.length === 0) {
      const rows = await sql<{ slug: string }[]>`
        UPDATE programs SET published = true, publish_at = NULL, announced = false, updated_at = now()
        WHERE slug = ${program.slug} AND NOT published AND publish_at IS NOT NULL AND publish_at <= ${now} AND release_blocked_at IS NULL RETURNING slug`;
      released.push(...rows.map(row => row.slug));
    } else {
      const rows = await sql<{ slug: string }[]>`
        UPDATE programs SET release_blocked_at = now(), release_blocked_missing = ${sql.json(missing as never)}, updated_at = now()
        WHERE slug = ${program.slug} AND NOT published AND release_blocked_at IS NULL RETURNING slug`;
      blocked.push(...rows.map(() => ({ slug: program.slug, title: program.title, missing })));
    }
  }
  const expired = await sql<{ slug: string }[]>`
    UPDATE programs SET published = false, unpublish_at = NULL, updated_at = now()
    WHERE published AND unpublish_at IS NOT NULL AND unpublish_at <= ${now} RETURNING slug`;
  return { released, expired: expired.map(row => row.slug), blocked };
}

/** Validation éditoriale d'une sortie bloquée (ou anticipée) : publie maintenant si les médias sont prêts, sinon renvoie ce qui manque. */
export async function validateRelease(sql: Sql, slug: string): Promise<{ result: 'released' | 'missing' | 'unknown'; missing: string[] }> {
  const [program] = await sql`SELECT 1 FROM programs WHERE slug = ${slug} AND kind <> 'brand'`;
  if (!program) return { result: 'unknown', missing: [] };
  const missing = await missingMedia(sql, slug);
  if (missing.length > 0) return { result: 'missing', missing };
  await sql`UPDATE programs SET published = true, publish_at = NULL, announced = false, release_blocked_at = NULL, release_blocked_missing = '[]'::jsonb, updated_at = now() WHERE slug = ${slug}`;
  return { result: 'released', missing: [] };
}

export interface ScheduleEntry { slug: string; title: string; kind: string; event: 'release' | 'expiry'; at: string; announced: boolean; blocked: { since: string; missing: string[] } | null }

/** Calendrier éditorial : toutes les sorties et tous les retraits à venir, dans l'ordre chronologique. */
export async function listSchedule(sql: Sql): Promise<ScheduleEntry[]> {
  const rows = await sql<{ slug: string; title: string; kind: string; event: 'release' | 'expiry'; at: Date; announced: boolean; blocked_at: Date | null; missing: string[] }[]>`
    SELECT slug, title, kind, 'release' AS event, publish_at AS at, announced, release_blocked_at AS blocked_at, release_blocked_missing AS missing
      FROM programs WHERE publish_at IS NOT NULL AND kind <> 'brand'
    UNION ALL
    SELECT slug, title, kind, 'expiry', unpublish_at, false, NULL, '[]'::jsonb FROM programs WHERE unpublish_at IS NOT NULL AND kind <> 'brand'
    ORDER BY at, title`;
  return rows.map(row => ({ slug: row.slug, title: row.title, kind: row.kind, event: row.event, at: row.at.toISOString(), announced: row.announced, blocked: row.blocked_at ? { since: row.blocked_at.toISOString(), missing: row.missing } : null }));
}
