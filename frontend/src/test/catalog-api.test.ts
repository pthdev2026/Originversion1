import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Catalogue réel : adaptation de GET /api/home vers les formes déjà utilisées par l'interface (fonctions pures, sans réseau). */
const card = (slug: string, extra: Record<string, unknown> = {}) => ({
  slug, kind: 'film', title: slug.toUpperCase(), titleLines: [], tagline: `Accroche ${slug}`, synopsis: `Résumé ${slug}`, category: 'Film original',
  durationLabel: '48 min', badges: [], themes: ['foi'], playable: false, isDemo: true,
  images: { poster: `/images/${slug}/poster.jpg`, hero: null, logo: null, alt: `Visuel ${slug}`, focus: null }, heroVideoUrl: null, titleStyle: null, ...extra,
});
const payload = {
  collections: [
    { slug: 'hero', title: 'À l’affiche', layout: 'hero', badge: null, viewAllUrl: null, items: [card('le-silence', { images: { poster: '/images/ls/p.jpg', hero: '/images/ls/h.jpg', logo: '/images/ls/logo.png', alt: 'Alt', focus: null }, heroVideoUrl: '/images/ls/teaser.mp4' }), card('les-passagers')] },
    { slug: 'top-10', title: 'Top 10', layout: 'ranked', badge: null, viewAllUrl: null, items: [card('gladiator', { rank: 1, tagline: null }), card('le-silence', { rank: 2, heroVideoUrl: '/images/ls/teaser.mp4' })] },
    { slug: 'suggestions', title: 'Pour vous', layout: 'portrait', badge: null, viewAllUrl: null, items: [card('briser-le-cycle', { titleStyle: 'bebas', titleLines: ['BRISER', 'LE CYCLE'] }), card('inconnu', { titleStyle: 'wingdings' })] },
    { slug: 'nouveautes', title: 'Nouveautés sur ORIGIN', layout: 'rail', badge: 'NOUVEAU', viewAllUrl: '/catalogue?tri=recent', items: [card('le-trone', { badges: ['Nouvelle saison'] })] },
    { slug: 'couple', title: 'Couple', layout: 'portrait', badge: null, viewAllUrl: null, items: [card('les-choisis', { images: { poster: '/images/lc/p.jpg', hero: null, logo: null, alt: null, focus: '62% 30%' } })] },
    { slug: 'pth-originals', title: 'PTH', layout: 'rail', badge: null, viewAllUrl: null, items: [card('les-secrets-du-ministere')] },
  ],
  themes: [{ slug: 'foi', title: 'Foi & Spiritualité', image: '/images/x.jpg', programCount: 3 }, { slug: 'couple', title: 'Couple', image: null, programCount: 1 }],
  creators: [{ slug: 'yvan', name: 'Apôtre Yvan', showTitle: null, intro: 'Intro', themes: ['Foi'], ambience: 'ember', image: '/images/c/y.jpeg', imageAlt: null, imageFocus: '50% 30%', isProvisional: true }, { slug: 'x', name: 'X', showTitle: 'Émission', intro: null, themes: [], ambience: 'inconnue', image: null, imageAlt: 'A', imageFocus: null, isProvisional: false }],
};
const pth = { ...card('les-secrets-du-ministere'), seasons: [
  { number: 1, episodes: [{ id: 's1-e1', number: 1, title: 'Un', image: '/images/p/1.jpg', durationLabel: null }] },
  { number: 2, episodes: [4, 5, 6, 7, 8].map(n => ({ id: `s2-e${n}`, number: n, title: `Épisode ${n}`, image: `/images/p/${n}.jpg`, durationLabel: n === 8 ? '52 min' : null })) },
] };

beforeEach(() => { vi.resetModules(); });

describe('Adaptateurs du catalogue serveur', () => {
  it('construit l\'accueil complet : hero, classement, suggestions, rails, créateurs, thématiques', async () => {
    const { buildHome } = await import('@/lib/catalog-api');
    const home = buildHome(payload as never, pth as never);
    expect(home.hero.map(program => program.id)).toEqual(['le-silence', 'les-passagers']);
    expect(home.hero[0]).toMatchObject({ heroImage: 'http://localhost:4000/images/ls/h.jpg', titleLogo: 'http://localhost:4000/images/ls/logo.png', heroVideo: 'http://localhost:4000/images/ls/teaser.mp4', imageAlt: 'Alt', titleLines: ['LE-SILENCE'] });
    expect(home.hero[1]!.heroImage).toBe('http://localhost:4000/images/les-passagers/poster.jpg');   // pas de visuel « hero » : l'affiche
    expect(home.topTen.map(item => [item.id, item.rank])).toEqual([['gladiator', 1], ['le-silence', 2]]);
    expect(home.topTen[1]!.previewVideo).toBe('http://localhost:4000/images/ls/teaser.mp4');
    expect(home.topTen[0]).not.toHaveProperty('tagline');
    expect(home.suggestions[0]).toMatchObject({ fontStyle: 'bebas', titleLines: ['BRISER', 'LE CYCLE'], duration: '48 min' });
    expect(home.suggestions[1]!.fontStyle).toBe('condensed');                                         // style inconnu : repli sûr
    expect(home.rails.newReleases).toMatchObject({ id: 'nouveautes', title: 'Nouveautés sur ORIGIN', badge: 'NOUVEAU', viewAllUrl: '/catalogue?tri=recent' });
    expect(home.rails.newReleases.contents[0]).toMatchObject({ badge: 'Nouvelle saison' });
    expect(home.rails.couple.cardStyle).toBe('portrait');
    expect(home.rails.couple.contents[0]).toMatchObject({ focus: '62% 30%', image: 'http://localhost:4000/images/lc/p.jpg' });
    expect(home.rails.drama.contents).toEqual([]);                                                     // collection absente : rail vide, pas de contenu inventé
    expect(home.creators[0]).toMatchObject({ id: 'yvan', ambience: 'ember', image: 'http://localhost:4000/images/c/y.jpeg', focus: '50% 30%', imageAlt: 'Apôtre Yvan' });
    expect(home.creators[1]).toMatchObject({ ambience: 'night', showTitle: 'Émission', focus: '50% 30%' });
    expect(home.themes.map(theme => theme.id)).toEqual(['foi', 'couple']);
  });

  it('un programme présent dans une thématique mais dans aucune collection reste dans le catalogue (v1.13)', async () => {
    const { buildHome } = await import('@/lib/catalog-api');
    const home = buildHome({ ...payload, themes: [{ slug: 'foi', title: 'Foi', image: null, programCount: 1, programs: [card('hors-collection', { themes: [] })] }] } as never, null);
    const found = home.contents.find(content => content.id === 'hors-collection');
    expect(found).toBeDefined();
    expect(found!.themes).toEqual(['foi']);                                   // rattaché à sa thématique même si la fiche ne le disait pas
  });

  it('PTH : épisodes de la dernière saison, du plus récent au plus ancien, quatre au plus', async () => {
    const { toPthEpisodes } = await import('@/lib/catalog-api');
    const episodes = toPthEpisodes(pth as never);
    expect(episodes.map(episode => episode.number)).toEqual([8, 7, 6, 5]);
    expect(episodes.every(episode => episode.season === 2)).toBe(true);
    expect(episodes[0]).toMatchObject({ id: 's2-e8', duration: '52 min', image: 'http://localhost:4000/images/p/8.jpg' });
    expect(toPthEpisodes(null)).toEqual([]);
  });

  it('les fiches de toutes les collections sont dédoublonnées (une fiche par programme)', async () => {
    const { buildHome } = await import('@/lib/catalog-api');
    const home = buildHome(payload as never, null);
    const ids = home.contents.map(content => content.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('gladiator');
    expect(home.pthEpisodes).toEqual([]);
  });

  it('le catalogue embarqué est remplacé EN PLACE : thématiques, sélection et fiches suivent le serveur', async () => {
    const { buildHome } = await import('@/lib/catalog-api');
    const catalogs = await import('@/lib/origin-catalogs');
    const reference = catalogs.catalogContents;                       // même tableau avant et après
    const home = buildHome(payload as never, null);
    catalogs.applyServerCatalog(home.contents, home.themes);
    expect(catalogs.catalogContents).toBe(reference);
    expect(catalogs.catalogContents.map(content => content.id)).toContain('gladiator');
    expect(catalogs.catalogContents.map(content => content.id)).not.toContain('plus-quun-reve');   // une fiche embarquée absente du serveur disparaît
    expect(catalogs.catalogThemes.map(theme => theme.id)).toEqual(['tendances', 'foi', 'couple', 'all']);
    expect(catalogs.contentsForTheme('foi').length).toBeGreaterThan(0);
    expect(catalogs.themeSelection('foi').contents[0]).toBeDefined();
    catalogs.applyServerCatalog([], home.themes);                      // réponse vide : rien n'est effacé
    expect(catalogs.catalogContents.length).toBeGreaterThan(0);
  });
});

/** Contre une VRAIE réponse de l'API (capturée le 30/10/2026) : une faute de nom de champ ne peut plus passer inaperçue. */
describe('Conformité à la réponse réelle de l\'API', () => {
  it('chaque section de l\'accueil est remplie avec de vrais textes et de vraies images', async () => {
    const real = (await import('./fixtures/api-home.json')).default;
    const pthReal = (await import('./fixtures/api-program-pth.json')).default;
    const { buildHome } = await import('@/lib/catalog-api');
    const home = buildHome(real as never, pthReal as never);
    expect([home.hero.length, home.topTen.length, home.suggestions.length, home.universes.length, home.pthEpisodes.length, home.creators.length, home.themes.length]).toEqual([10, 14, 8, 5, 4, 5, 12]);
    expect(real.themes.every((theme: { programs?: unknown[] }) => Array.isArray(theme.programs))).toBe(true);   // v1.13 : chaque thématique porte ses programmes
    expect(Object.values(home.rails).map(rail => rail.contents.length)).toEqual([7, 6, 6, 5, 5]);
    const withImage = (items: { image?: string; poster?: string; heroImage?: string }[]) => items.every(item => /^https?:\/\/.+\.(jpe?g|png|webp|avif)$/i.test(item.image ?? item.poster ?? item.heroImage ?? ''));
    expect(withImage(home.hero)).toBe(true);
    expect(withImage(home.topTen)).toBe(true);
    expect(withImage(home.suggestions)).toBe(true);
    expect(withImage(home.universes)).toBe(true);
    expect(withImage(home.pthEpisodes)).toBe(true);
    expect(withImage(home.creators)).toBe(true);
    expect(withImage(Object.values(home.rails).flatMap(rail => rail.contents))).toBe(true);
    expect(home.hero.every(program => program.title && program.titleLines.length > 0)).toBe(true);
    expect(home.pthEpisodes.map(episode => episode.id)).toEqual(['s2-e8', 's2-e7', 's2-e6', 's2-e5']);
    expect(home.pthEpisodes[0]!.title).toBeTruthy();
  });
});

describe('Classement, tendances et thématiques (réponses réelles v1.17)', () => {
  it('fetchRanking : le rang est celui du serveur, un programme garde le même identifiant que partout', async () => {
    const real = (await import('./fixtures/api-ranking.json')).default;
    const api = vi.fn(async () => real);
    vi.doMock('@/lib/api', () => ({ api }));
    const { fetchRanking } = await import('@/lib/catalog-api');
    const ranking = await fetchRanking();
    expect(api).toHaveBeenCalledWith('GET', '/api/ranking?limit=200&offset=0');
    const drawable = real.items.filter((item: { program: { images: { poster: string | null; hero: string | null } } }) => item.program.images.poster || item.program.images.hero);
    expect(real.total - ranking.length).toBe(real.items.length - drawable.length);   // seuls les programmes sans visuel sont écartés (aujourd'hui : demo-b4, tout-recommencer)
    expect(ranking.map(item => item.rank)).toEqual(ranking.map((_, index) => index + 1));
    expect(ranking.map(item => item.id)).toEqual(drawable.map((item: { program: { slug: string } }) => item.program.slug));
    expect(ranking.slice(0, 14).map(item => item.id)).toEqual(['gladiator', 'damnes', 'acteurs', 'au-dela', 'le-silence', 'les-passagers', 'derniere-sortie', 'teaser-origin', 'un-nouveau-matin', 'le-trone', 'les-choisis', 'la-reine-guerriere', 'lintervention', 'ligne-rouge']);
    expect(ranking.every(item => /^(https?:\/\/|\/images\/)/.test(item.poster) && item.title)).toBe(true);
  });

  it('fetchRanking : plusieurs pages si le catalogue dépasse 200 programmes', async () => {
    const items = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ rank: from + i, program: card(`p-${from + i}`) }));
    const api = vi.fn(async (_m: string, path: string) => (path.includes('offset=0') ? { total: 230, items: items(1, 200) } : { total: 230, items: items(201, 30) }));
    vi.doMock('@/lib/api', () => ({ api }));
    const { fetchRanking } = await import('@/lib/catalog-api');
    const ranking = await fetchRanking();
    expect(ranking).toHaveLength(230);
    expect(ranking[229]!.rank).toBe(230);
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('buildHome : sous-titre + phare du serveur, repli si le phare est absent, ordre des programmes, tendances', async () => {
    const real = (await import('./fixtures/api-home.json')).default;
    const trending = (await import('./fixtures/api-trending.json')).default;
    const { buildHome } = await import('@/lib/catalog-api');
    const home = buildHome(real as never, null, trending.items.map((item: { program: unknown }) => item.program) as never);
    expect(home.themeShowcase['couple']).toEqual({ subtitle: 'Relations et vie à deux', featuredId: 'un-nouveau-matin' });
    expect(home.themeShowcase['foi']!.featuredId).toBe('le-trone');   // phare configuré absent → repli = mieux classé de la thématique
    expect(home.trending).toEqual(trending.items.map((item: { program: { slug: string } }) => item.program.slug));
    expect(home.themeOrder['foi']![0]).toBe('le-trone');
    // Tout programme tendance est ouvrable : présent dans le catalogue chargé.
    const ids = new Set(home.contents.map(content => content.id));
    expect(home.trending.every(slug => ids.has(slug))).toBe(true);
  });

  it('applyServerCatalog : « Tendances » vient du serveur, l\'ordre d\'une thématique suit le classement', async () => {
    const real = (await import('./fixtures/api-home.json')).default;
    const trending = (await import('./fixtures/api-trending.json')).default;
    const { buildHome } = await import('@/lib/catalog-api');
    const catalogs = await import('@/lib/origin-catalogs');
    const home = buildHome(real as never, null, trending.items.map((item: { program: unknown }) => item.program) as never);
    catalogs.applyServerCatalog(home.contents, home.themes, { themeShowcase: home.themeShowcase, themeOrder: home.themeOrder, trending: home.trending });
    expect(catalogs.contentsForTheme('tendances').map(content => content.id)).toEqual(home.trending);
    expect(catalogs.themeSelection('tendances').featured.id).toBe(home.trending[0]);
    expect(catalogs.contentsForTheme('foi')[0]!.id).toBe('le-trone');
    expect(catalogs.themeSelection('foi').featured.id).toBe('le-trone');
    // Sans réponse du serveur sur les tendances : tout le catalogue chargé (jamais une liste figée).
    catalogs.applyServerCatalog(home.contents, home.themes, { trending: [] });
    expect(catalogs.contentsForTheme('tendances')).toHaveLength(home.contents.length);
  });
});
