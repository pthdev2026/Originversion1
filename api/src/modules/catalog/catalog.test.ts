import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pino from 'pino';
import type { Hono } from 'hono';
import { createApp } from '../../app.ts';
import { DEV_DATABASE_URL } from '../../config/env.ts';
import { connect, type Sql } from '../../platform/database/client.ts';
import { migrate } from '../../platform/database/migrate.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { StorageLayout } from '../../platform/storage/layout.ts';
import { insertUser } from '../identity/repository.ts';
import { hashPassword } from '../identity/password.ts';
import { createIdentityService } from '../identity/service.ts';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { registerAsset } from '../ingest/repository.ts';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let app: Hono<AppEnv>;
let available = true;
let adminCookie = '';
const imagesTmp = `/tmp/origin-img-${randomBytes(4).toString('hex')}`;

const send = (method: string, path: string, body?: unknown, cookie?: string) =>
  app.request(path, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
const json = async (response: Response) => (await response.json()) as any;

before(async () => {
  admin = connect(databaseUrl, { max: 1 });
  try { await admin`SELECT 1`; } catch { available = false; await admin.end(); return; }
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = connect(databaseUrl, { max: 4, connection: { search_path: schema } });
  await migrate(sql);
  const logger = pino({ level: 'silent' });
  const identity = createIdentityService({
    sql, logger, mailer: { async send() {} },
    config: { registrationMode: 'open', sessionTtlSeconds: 3600, publicAppUrl: 'http://localhost:3210' },
  });
  app = createApp({
    sql, logger, storage: new StorageLayout(imagesTmp),
    mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
    rateLimits: { apiPerMinute: 10_000, mediaPerMinute: 10_000, authPerMinute: 10_000, metricsPerMinute: 10_000 },
    identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: false,
    uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
  });
  await insertUser(sql, { id: randomUUID(), email: 'root@origin.test', passwordHash: await hashPassword('Mot de passe administrateur 1'), displayName: null, role: 'admin' });
  const login = await send('POST', '/api/auth/login', { email: 'root@origin.test', password: 'Mot de passe administrateur 1' });
  adminCookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
});

after(async () => {
  if (!available) return;
  await rm(imagesTmp, { recursive: true, force: true });
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

const film = (overrides: Record<string, unknown> = {}) => ({
  kind: 'film', title: 'Dernière sortie', tagline: 'La nuit ne pardonne pas.', category: 'Film original',
  durationLabel: '48 min', posterUrl: '/images/derniere-sortie/poster.jpg', imageAlt: 'Une voiture sous la pluie', ...overrides,
});

describe('catalogue éditorial', () => {
  it('refuse l’écriture sans administrateur', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await send('PUT', '/api/admin/programs/x', film())).status, 401);
    assert.equal((await send('GET', '/api/admin/catalog')).status, 401);
  });

  it('un programme est un brouillon invisible tant qu’il n’est pas publié', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const created = await send('PUT', '/api/admin/programs/derniere-sortie', film(), adminCookie);
    assert.equal(created.status, 201);
    assert.equal((await send('GET', '/api/programs/derniere-sortie')).status, 404);

    const published = await send('PUT', '/api/admin/programs/derniere-sortie', film({ published: true }), adminCookie);
    assert.equal(published.status, 200);
    const detail = await json(await send('GET', '/api/programs/derniere-sortie'));
    assert.equal(detail.title, 'Dernière sortie');
    assert.equal(detail.images.poster, '/images/derniere-sortie/poster.jpg');
    assert.equal(detail.playable, false); // aucun média : on ne promet pas de lecture
    // Film sans épisodes : une entrée « feature » synthétisée, jouée par le slug.
    assert.deepEqual(detail.seasons.map((s: any) => s.episodes.map((e: any) => [e.id, e.playbackId, e.playable])), [[['feature', 'derniere-sortie', false]]]);
  });

  it('« playable » suit les médias réellement prêts', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await registerAsset(sql, {
      playbackId: 'derniere-sortie', programSlug: 'derniere-sortie', kind: 'film', title: 'Dernière sortie', storagePath: 'derniere-sortie',
      durationSeconds: 100, sourceWidth: 1920, sourceHeight: 1080, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: true,
    });
    const detail = await json(await send('GET', '/api/programs/derniere-sortie'));
    assert.equal(detail.playable, true);
    assert.equal(detail.tagline, 'La nuit ne pardonne pas.'); // la réinscription du média n'écrase pas l'éditorial
  });

  it('séries : saisons, épisodes et identifiants de lecture', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await send('PUT', '/api/admin/themes/foi', { title: 'Foi', position: 1 }, adminCookie);
    const response = await send('PUT', '/api/admin/programs/les-secrets', {
      kind: 'serie', title: 'Les secrets', published: true, themes: ['foi'], genres: ['Documentaire'],
      seasons: [{ number: 1, title: 'Saison 1', episodes: [
        { key: 's1-e1', number: 1, title: 'Épisode 1' }, { key: 's1-e2', number: 2, title: 'Épisode 2' },
      ] }],
    }, adminCookie);
    assert.equal(response.status, 201);
    await registerAsset(sql, {
      playbackId: 'les-secrets-s1-e2', programSlug: 'les-secrets', kind: 'serie', title: 'Les secrets', storagePath: 'les-secrets-s1-e2',
      durationSeconds: 60, sourceWidth: 1280, sourceHeight: 720, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: true,
    });
    const detail = await json(await send('GET', '/api/programs/les-secrets'));
    const episodes = detail.seasons[0].episodes;
    assert.deepEqual(episodes.map((e: any) => [e.playbackId, e.playable]), [['les-secrets-s1-e1', false], ['les-secrets-s1-e2', true]]);
    assert.deepEqual(detail.themes, ['foi']);
    // Et la page du thème le liste.
    const theme = await json(await send('GET', '/api/themes/foi'));
    assert.deepEqual(theme.programs.map((p: any) => p.slug), ['les-secrets']);
    const themes = await json(await send('GET', '/api/themes'));
    assert.equal(themes.themes[0].programCount, 1);
  });

  it('valide les documents (adresse d’image, thème inconnu, doublons)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const bad = (body: unknown) => send('PUT', '/api/admin/programs/test-x', body, adminCookie);
    assert.equal((await bad(film({ posterUrl: 'javascript:alert(1)' }))).status, 400);
    assert.equal((await bad(film({ posterUrl: '/images/../secret.jpg' }))).status, 400);
    assert.equal((await bad(film({ themes: ['inconnu'] }))).status, 400);
    assert.equal((await bad(film({ champInconnu: 1 }))).status, 400);
    assert.equal((await bad({ kind: 'film' })).status, 400);
    assert.equal((await bad(film({ seasons: [{ number: 1, episodes: [{ key: 'a', number: 1, title: 'A' }, { key: 'a', number: 2, title: 'B' }] }] }))).status, 400);
    assert.equal((await send('PUT', '/api/admin/programs/test-x', '{pas du json', adminCookie)).status, 400);
    // Aucune ligne résiduelle après un refus (transaction).
    assert.equal((await send('GET', '/api/programs/test-x')).status, 404);
    const [row] = await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM programs WHERE slug = 'test-x'`;
    assert.equal(row?.count, '0');
  });

  it('collections : ordre, rang, brouillon, accueil', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await send('PUT', '/api/admin/programs/autre', film({ title: 'Autre', published: true }), adminCookie);
    await send('PUT', '/api/admin/programs/cache', film({ title: 'Caché', published: false }), adminCookie);

    assert.equal((await send('PUT', '/api/admin/collections/top-10', { title: 'Top 10', layout: 'ranked', items: ['inexistant'] }, adminCookie)).status, 400);
    const ok = await send('PUT', '/api/admin/collections/top-10', {
      title: 'Top 10', layout: 'ranked', homePosition: 1, published: true, items: ['les-secrets', 'cache', 'derniere-sortie', 'autre'],
    }, adminCookie);
    assert.equal(ok.status, 204);
    await send('PUT', '/api/admin/collections/brouillon', { title: 'Brouillon', layout: 'rail', homePosition: 0, items: ['autre'] }, adminCookie);

    const collection = await json(await send('GET', '/api/collections/top-10'));
    // Le brouillon « cache » est absent ; les rangs sont recalculés sans trou.
    assert.deepEqual(collection.items.map((i: any) => [i.rank, i.slug]), [[1, 'les-secrets'], [2, 'derniere-sortie'], [3, 'autre']]);
    assert.equal((await send('GET', '/api/collections/brouillon')).status, 404);

    const home = await json(await send('GET', '/api/home'));
    assert.deepEqual(home.collections.map((c: any) => c.slug), ['top-10']);
    assert.equal(home.themes.length, 1);
    // v1.13 : chaque thématique de l'accueil porte ses premiers programmes, même s'ils ne sont dans AUCUNE collection de l'accueil
    assert.deepEqual(home.themes[0].programs.map((p: any) => p.slug), ['les-secrets']);
    assert.ok(home.themes[0].programs[0].images !== undefined);
    assert.ok(home.themes[0].programs.length <= 10);
  });

  it('créateurs : seuls les publiés sont visibles', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await send('PUT', '/api/admin/creators/a', { name: 'A', published: true, ambience: 'ember', position: 2 }, adminCookie);
    await send('PUT', '/api/admin/creators/b', { name: 'B', position: 1 }, adminCookie);
    const { creators } = await json(await send('GET', '/api/creators'));
    assert.deepEqual(creators.map((c: any) => c.slug), ['a']);
    assert.equal((await send('PUT', '/api/admin/creators/c', { name: 'C', ambience: 'rose' }, adminCookie)).status, 400);
  });

  it('les contenus de marque ne sont jamais publics', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await registerAsset(sql, {
      playbackId: 'origin-ident', programSlug: 'origin-ident', kind: 'brand', title: 'ORIGIN', storagePath: 'origin-ident',
      durationSeconds: 6, sourceWidth: 1920, sourceHeight: 1080, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: false,
    });
    assert.equal((await send('GET', '/api/programs/origin-ident')).status, 404);
    const catalog = await json(await send('GET', '/api/admin/catalog', undefined, adminCookie));
    assert.ok(!catalog.programs.some((p: any) => p.slug === 'origin-ident'));
    assert.equal((await send('DELETE', '/api/admin/programs/origin-ident', undefined, adminCookie)).status, 404);
  });

  it('suppression : programme retiré des collections', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await send('DELETE', '/api/admin/programs/autre', undefined, adminCookie)).status, 204);
    const collection = await json(await send('GET', '/api/collections/top-10'));
    assert.deepEqual(collection.items.map((i: any) => i.slug), ['les-secrets', 'derniere-sortie']);
    assert.equal((await send('DELETE', '/api/admin/programs/autre', undefined, adminCookie)).status, 404);
  });

  it('sert les visuels sans jamais sortir du dossier', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await mkdir(`${imagesTmp}/images/derniere-sortie`, { recursive: true });
    await writeFile(`${imagesTmp}/images/derniere-sortie/poster.jpg`, 'JPEGDATA');
    await writeFile(`${imagesTmp}/secret.jpg`, 'SECRET');
    await writeFile(`${imagesTmp}/images/derniere-sortie/notes.txt`, 'texte');
    const ok = await send('GET', '/images/derniere-sortie/poster.jpg');
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/jpeg');
    assert.equal(await ok.text(), 'JPEGDATA');
    await writeFile(`${imagesTmp}/images/derniere-sortie/teaser.mp4`, '0123456789');
    const part = await app.request('/images/derniere-sortie/teaser.mp4', { headers: { range: 'bytes=2-5' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(await part.text(), '2345');
    assert.equal((await app.request('/images/derniere-sortie/teaser.mp4', { headers: { range: 'bytes=50-60' } })).status, 416);
    assert.equal((await send('GET', '/images/derniere-sortie/notes.txt')).status, 404, 'format non image');
    assert.equal((await send('GET', '/images/derniere-sortie/absent.jpg')).status, 404);
    assert.equal((await send('GET', '/images/..%2F..%2Fsecret.jpg')).status, 404);
    assert.equal((await send('GET', '/images/derniere-sortie/..%2F..%2Fsecret.jpg')).status, 404);
    assert.equal((await send('GET', '/images/Derniere/poster.jpg')).status, 404);
  });

  it('une série sans épisodes déclarés expose ses médias prêts', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await send('PUT', '/api/admin/programs/serie-media', { kind: 'serie', title: 'Série média', published: true }, adminCookie);
    for (const id of ['serie-media-s1-e2', 'serie-media-s1-e1']) {
      await registerAsset(sql, {
        playbackId: id, programSlug: 'serie-media', kind: 'serie', title: 'Série média', storagePath: id,
        durationSeconds: 30, sourceWidth: 1280, sourceHeight: 720, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: true,
      });
    }
    const detail = await json(await send('GET', '/api/programs/serie-media'));
    assert.deepEqual(detail.seasons[0].episodes.map((e: any) => [e.number, e.playbackId, e.playable]),
      [[1, 'serie-media-s1-e1', true], [2, 'serie-media-s1-e2', true]]);
  });

  it('recherche : sans accents ni casse, tous les mots, titres en premier', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const put = (slug: string, body: Record<string, unknown>) => send('PUT', `/api/admin/programs/${slug}`, { kind: 'film', published: true, ...body }, adminCookie);
    await put('s-ete', { title: 'Un été d’espérance', category: 'Film original', genres: ['Drame'] });
    await put('s-esperance', { title: 'Les chemins', tagline: 'Une espérance tenace', category: 'Documentaire' });
    await put('s-brouillon', { title: 'Espérance cachée', published: false });
    const search = async (q: string) => (await json(await send('GET', `/api/search?q=${encodeURIComponent(q)}`))).programs.map((p: any) => p.slug);
    assert.deepEqual(await search('ESPERANCE'), ['s-ete', 's-esperance'], 'titre avant accroche, brouillon exclu');
    assert.deepEqual(await search('espérance été'), ['s-ete'], 'tous les mots requis');
    assert.deepEqual(await search('drame'), ['s-ete'], 'genre');
    assert.deepEqual(await search('temoignages'), ['les-secrets'].filter(() => false), 'thème sans programme lié à ce mot');
    assert.deepEqual(await search('foi'), ['les-secrets'], 'thématique');
    assert.deepEqual(await search('100%_'), []);
    assert.equal((await send('GET', '/api/search?q=a')).status, 400);
    assert.equal((await send('GET', '/api/search')).status, 400);
    await send('PUT', '/api/admin/creators/yvan', { name: 'Apôtre Yvan Castanou', published: true }, adminCookie);
    const withCreator = await json(await send('GET', '/api/search?q=apotre%20yvan'));
    assert.deepEqual(withCreator.creators.map((c: any) => c.slug), ['yvan']);
  });

  it('cache : catalogue public mis en cache 30 s, tout le reste jamais', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.match((await send('GET', '/api/home')).headers.get('cache-control') ?? '', /public, max-age=30/);
    assert.match((await send('GET', '/api/programs/derniere-sortie')).headers.get('cache-control') ?? '', /public, max-age=30/);
    assert.equal((await send('GET', '/api/programs/introuvable')).headers.get('cache-control'), 'no-store', 'les erreurs ne sont pas mises en cache');
    assert.equal((await send('GET', '/api/me', undefined, adminCookie)).headers.get('cache-control'), 'no-store');
    assert.equal((await send('GET', '/api/admin/catalog', undefined, adminCookie)).headers.get('cache-control'), 'no-store');
  });
});
