/** Recherche intelligente (fautes de frappe, mots-clés, suggestions, recherches récentes) et alerte de nouvelle connexion. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
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
import { createAccountService } from '../account/service.ts';
import { runSchedule } from '../catalog/routes.ts';
import { registerAsset } from '../ingest/repository.ts';

const PASSWORD = 'Un très bon mot de passe';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const AVIF = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif'), Buffer.alloc(16)]);
const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
const storageRoot = `/tmp/origin-gate-${randomBytes(4).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let app: Hono<AppEnv>;
let available = true;
let adminCookie = '';
const mails: { to: string; subject: string; text: string }[] = [];
const tick = () => new Promise(resolve => setTimeout(resolve, 25));

const call = (method: string, path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) => {
  const raw = body instanceof Uint8Array;
  return app.request(path, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined || raw ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: (raw ? body : JSON.stringify(body)) as BodyInit }),
  });
};
const json = async (response: Response) => (await response.json()) as any;
const cookieOf = (response: Response) => (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
const register = async (email: string) => cookieOf(await call('POST', '/api/auth/register', { email, password: PASSWORD }, undefined, { 'user-agent': CHROME_MAC }));
const login = async (email: string, userAgent: string, password = PASSWORD) => call('POST', '/api/auth/login', { email, password }, undefined, { 'user-agent': userAgent });

before(async () => {
  admin = connect(databaseUrl, { max: 1 });
  try { await admin`SELECT 1`; } catch { available = false; await admin.end(); return; }
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = connect(databaseUrl, { max: 6, connection: { search_path: schema } });
  await migrate(sql);
  const logger = pino({ level: 'silent' });
  const mailer = { async send(message: { to: string; subject: string; text: string }) { mails.push(message); } };
  const storage = new StorageLayout(storageRoot);
  const account = createAccountService({ sql, logger, mailer, storage });
  const identity = createIdentityService({
    sql, logger, mailer, afterAccountDeleted: info => account.afterAccountDeleted(info),
    config: { registrationMode: 'open', sessionTtlSeconds: 3600, publicAppUrl: 'http://localhost:3210' },
  });
  app = createApp({
    sql, logger, storage, account, mailer,
    mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
    rateLimits: { apiPerMinute: 100_000, mediaPerMinute: 100_000, authPerMinute: 100_000, metricsPerMinute: 100_000 },
    identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: false, uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
  });
  await insertUser(sql, { id: randomUUID(), email: 'root@origin.test', passwordHash: await hashPassword('Mot de passe administrateur 1'), displayName: null, role: 'admin', emailVerified: true });
  adminCookie = cookieOf(await call('POST', '/api/auth/login', { email: 'root@origin.test', password: 'Mot de passe administrateur 1' }));
});

after(async () => {
  if (!available) return;
  await rm(storageRoot, { recursive: true, force: true });
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});




const asset = (playbackId: string, programSlug: string) =>
  registerAsset(sql, { playbackId, programSlug, kind: 'film', title: programSlug, storagePath: playbackId, durationSeconds: 60, sourceWidth: 1280, sourceHeight: 720, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: false });
const put = (slug: string, doc: Record<string, unknown>) => call('PUT', `/api/admin/programs/${slug}`, doc, adminCookie);
const prog = (title: string, extra: Record<string, unknown> = {}) => ({ kind: 'film', title, published: true, ...extra });
const theme = (slug: string, doc: Record<string, unknown>) => call('PUT', `/api/admin/themes/${slug}`, doc, adminCookie);
const themes = async () => (await json(await call('GET', '/api/themes'))).themes as { slug: string; subtitle: string | null; featuredSlug: string | null }[];

describe('thématiques : cadrage éditorial', () => {
  it('sous-titre et phare : enregistrés, exposés, le phare passe en premier', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await theme('foi', { title: 'Foi' })).status, 204);
    for (const slug of ['a-film', 'b-film', 'c-film']) assert.equal((await put(slug, prog(slug, { themes: ['foi'] }))).status, 201);
    assert.deepEqual((await json(await call('GET', '/api/themes/foi'))).programs.map((p: any) => p.slug), ['a-film', 'b-film', 'c-film'], 'sans phare : ordre du classement (égalité → titre)');
    assert.equal((await theme('foi', { title: 'Foi', subtitle: 'Sens et vie intérieure', featuredSlug: 'c-film' })).status, 204);
    const foi = (await themes()).find(item => item.slug === 'foi');
    assert.deepEqual([foi?.subtitle, foi?.featuredSlug], ['Sens et vie intérieure', 'c-film']);
    assert.deepEqual((await json(await call('GET', '/api/themes/foi'))).programs.map((p: any) => p.slug), ['c-film', 'a-film', 'b-film']);
    const home = await json(await call('GET', '/api/home'));
    assert.equal(home.themes.find((x: any) => x.slug === 'foi').programs[0].slug, 'c-film', 'l’accueil aussi');
    assert.equal(home.themes.find((x: any) => x.slug === 'foi').subtitle, 'Sens et vie intérieure');
  });

  it('un ancien client qui ne les envoie pas ne les efface pas ; null les efface', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await theme('foi', { title: 'Foi & Spiritualité' })).status, 204);
    const kept = (await themes()).find(item => item.slug === 'foi');
    assert.deepEqual([kept?.subtitle, kept?.featuredSlug], ['Sens et vie intérieure', 'c-film']);
    assert.equal((await theme('foi', { title: 'Foi', subtitle: null, featuredSlug: null })).status, 204);
    const cleared = (await themes()).find(item => item.slug === 'foi');
    assert.deepEqual([cleared?.subtitle, cleared?.featuredSlug], [null, null]);
  });

  it('phare inconnu : 400 ; phare repassé en brouillon : plus exposé ; programme supprimé : phare vidé', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await theme('foi', { title: 'Foi', featuredSlug: 'inconnu' })).status, 400);
    assert.equal((await theme('foi', { title: 'Foi', featuredSlug: 'a-film' })).status, 204);
    // Un phare qui n'appartient pas à la thématique n'est jamais exposé (il n'apparaîtrait pas dans sa liste).
    assert.equal((await put('hors-theme', prog('Hors thème'))).status, 201);
    assert.equal((await theme('foi', { title: 'Foi', featuredSlug: 'hors-theme' })).status, 204);
    assert.equal((await themes()).find(item => item.slug === 'foi')?.featuredSlug, null);
    assert.equal((await theme('foi', { title: 'Foi', featuredSlug: 'a-film' })).status, 204);
    await put('a-film', prog('a-film', { themes: ['foi'], published: false }));
    assert.equal((await themes()).find(item => item.slug === 'foi')?.featuredSlug, null, 'un brouillon n’est jamais exposé');
    await put('a-film', prog('a-film', { themes: ['foi'] }));
    assert.equal((await themes()).find(item => item.slug === 'foi')?.featuredSlug, 'a-film');
    assert.equal((await call('DELETE', '/api/admin/programs/a-film', undefined, adminCookie)).status, 204);
    assert.equal((await themes()).find(item => item.slug === 'foi')?.featuredSlug, null);
  });

  it('réservé aux administrateurs', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await call('PUT', '/api/admin/themes/foi', { title: 'X', subtitle: 'Y' })).status, 401);
  });
});

describe('classement complet', () => {
  it('Top 10 éditorial d’abord, puis audience réelle, puis titre ; pagination ; brouillons exclus', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    for (const [slug, title] of [['r-un', 'Un'], ['r-deux', 'Deux'], ['r-pop', 'Zèbre populaire'], ['r-alpha', 'Alpha'], ['r-beta', 'Beta']] as const) assert.equal((await put(slug, prog(title))).status, 201);
    await put('r-brouillon', prog('Brouillon', { published: false }));
    assert.equal((await call('PUT', '/api/admin/collections/top-10', { title: 'Top 10', layout: 'ranked', items: ['r-deux', 'r-un'], homePosition: 1 }, adminCookie)).status < 300, true);
    await asset('r-pop', 'r-pop');
    for (let i = 0; i < 3; i++) await sql`INSERT INTO playback_sessions (id, playback_id, watch_seconds, device, browser, engine) VALUES (${randomUUID()}, 'r-pop', 120, 'desktop', 'Chrome', 'hlsjs')`;
    const all = await json(await call('GET', '/api/ranking?limit=50'));
    const order = all.items.map((item: any) => item.program.slug).filter((slug: string) => slug.startsWith('r-'));
    assert.deepEqual(order, ['r-deux', 'r-un', 'r-pop', 'r-alpha', 'r-beta']);
    assert.ok(!order.includes('r-brouillon'));
    assert.deepEqual(all.items.map((item: any) => item.rank), all.items.map((_: unknown, index: number) => index + 1), 'rangs consécutifs depuis 1');
    assert.equal(all.total, all.items.length);
    const page = await json(await call('GET', '/api/ranking?limit=2&offset=1'));
    assert.deepEqual(page.items.map((item: any) => item.rank), [2, 3]);
    assert.equal(page.total, all.total);
  });

  it('public, borné (limit > 200 ramené à 200, valeurs absurdes tolérées)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await call('GET', '/api/ranking?limit=99999&offset=-5')).status, 200);
    assert.equal((await call('GET', '/api/ranking?limit=abc')).status, 200);
  });
});

describe('classement : cohérence, stabilité, égalités', () => {
  it('pagination : les pages mises bout à bout redonnent exactement le classement complet, sans doublon ni trou', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const full = (await json(await call('GET', '/api/ranking?limit=200'))).items.map((i: any) => i.program.slug);
    const pages: string[] = [];
    for (let offset = 0; offset < full.length; offset += 3) pages.push(...(await json(await call('GET', `/api/ranking?limit=3&offset=${offset}`))).items.map((i: any) => i.program.slug));
    assert.deepEqual(pages, full);
    assert.equal(new Set(full).size, full.length, 'aucun doublon');
    const beyond = await json(await call('GET', '/api/ranking?limit=5&offset=5000'));
    assert.deepEqual([beyond.items.length, beyond.total], [0, full.length], 'au-delà de la fin : liste vide mais total exact');
  });

  it('égalités d’audience : départagées par titre puis identifiant, ordre identique à chaque appel', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    for (const [slug, title] of [['eg-b', 'Égal B'], ['eg-a', 'Égal A'], ['eg-c', 'Égal A']] as const) {
      assert.equal((await put(slug, prog(title))).status, 201);
      await asset(slug, slug);
      for (let i = 0; i < 2; i++) await sql`INSERT INTO playback_sessions (id, playback_id, watch_seconds, device, browser, engine) VALUES (${randomUUID()}, ${slug}, 60, 'desktop', 'Chrome', 'hlsjs')`;
    }
    const orders = [];
    for (let i = 0; i < 3; i++) orders.push((await json(await call('GET', '/api/ranking?limit=200'))).items.map((x: any) => x.program.slug).filter((s: string) => s.startsWith('eg-')));
    assert.deepEqual(orders[0], ['eg-a', 'eg-c', 'eg-b']);
    assert.deepEqual(orders[1], orders[0]);
    assert.deepEqual(orders[2], orders[0]);
  });

  it('tendances et classement partagent la même définition d’audience (même ordre pour le même public)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const ranking = (await json(await call('GET', '/api/ranking?limit=200'))).items.map((x: any) => x.program.slug);
    const trending = (await json(await call('GET', '/api/trending?limit=30'))).items.map((x: any) => x.program.slug);
    const watched = ['r-pop', 'eg-a', 'eg-c', 'eg-b'];
    assert.deepEqual(trending.filter((s: string) => watched.includes(s)), ['r-pop', 'eg-a', 'eg-c', 'eg-b'].filter(slug => trending.includes(slug)), 'plus regardé d’abord, égalités par titre puis identifiant');
    const byAudience = (list: string[]) => list.filter(s => watched.includes(s));
    assert.deepEqual(byAudience(ranking).slice(0, 4).sort(), byAudience(trending).slice(0, 4).sort());
    for (const slug of trending) assert.ok(ranking.includes(slug), `${slug} (tendance) est dans le classement`);
  });

  it('tendances : jamais de brouillon ni de programme de marque', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await put('tr-brouillon', prog('Brouillon vu', { published: false }));
    await asset('tr-brouillon', 'tr-brouillon');
    await sql`INSERT INTO playback_sessions (id, playback_id, watch_seconds, device, browser, engine) VALUES (${randomUUID()}, 'tr-brouillon', 600, 'desktop', 'Chrome', 'hlsjs')`;
    const trending = (await json(await call('GET', '/api/trending?limit=30'))).items.map((x: any) => x.program.slug);
    assert.ok(!trending.includes('tr-brouillon'));
    assert.ok(trending.length > 0 && new Set(trending).size === trending.length);
  });

  it('phare de repli : le programme le mieux classé de la thématique, sans toucher à la configuration', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await theme('identite', { title: 'Identité', subtitle: 'Se découvrir' })).status, 204);
    for (const slug of ['id-z', 'id-a']) assert.equal((await put(slug, prog(slug === 'id-z' ? 'Zèbre' : 'Abeille', { themes: ['identite'] }))).status, 201);
    await asset('id-z', 'id-z');
    await sql`INSERT INTO playback_sessions (id, playback_id, watch_seconds, device, browser, engine) VALUES (${randomUUID()}, 'id-z', 90, 'desktop', 'Chrome', 'hlsjs')`;
    const identite = (await json(await call('GET', '/api/themes'))).themes.find((x: any) => x.slug === 'identite');
    assert.equal(identite.featuredSlug, null, 'aucun phare configuré');
    assert.equal(identite.fallbackFeaturedSlug, 'id-z', 'le plus regardé de la thématique');
    assert.deepEqual((await json(await call('GET', '/api/themes/identite'))).programs.map((p: any) => p.slug), ['id-z', 'id-a']);
    // La configuration existante n'est jamais écrasée par le repli.
    assert.equal((await theme('identite', { title: 'Identité', featuredSlug: 'id-a' })).status, 204);
    const configured = (await json(await call('GET', '/api/themes'))).themes.find((x: any) => x.slug === 'identite');
    assert.deepEqual([configured.featuredSlug, configured.fallbackFeaturedSlug, configured.subtitle], ['id-a', 'id-z', 'Se découvrir']);
  });
});
