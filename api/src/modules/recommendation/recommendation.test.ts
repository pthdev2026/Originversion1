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
import { createIdentityService } from '../identity/service.ts';
import { insertUser } from '../identity/repository.ts';
import { hashPassword } from '../identity/password.ts';
import { registerAsset } from '../ingest/repository.ts';
import { personalized, similarity, similarTo, type ProgramFeatures } from './scoring.ts';

const feature = (slug: string, over: Partial<ProgramFeatures> = {}): ProgramFeatures => ({
  slug, title: slug.toUpperCase(), kind: 'film', category: null, genres: [], themes: new Map(), ...over,
});

describe('règles de proximité', () => {
  const foi = new Map([['foi', 'Foi & Spiritualité']]);
  const famille = new Map([['famille', 'Famille']]);

  it('pondère thèmes > genres > type/catégorie et donne la raison', () => {
    const a = feature('a', { themes: foi, genres: ['Drame'], category: 'Film original' });
    assert.deepEqual(similarity(a, feature('b', { themes: foi })), { score: 4, reason: 'Même thématique : Foi & Spiritualité' });
    assert.equal(similarity(a, feature('c', { genres: ['drame'] })).reason, 'Même genre : Drame');
    assert.equal(similarity(a, feature('d', { category: 'Film original' })).score, 2); // type + catégorie
    assert.equal(similarity(a, feature('e', { kind: 'serie' })).score, 0);
  });

  it('exclut le programme lui-même et les proximités trop faibles', () => {
    const a = feature('a', { themes: foi });
    const catalog = [a, feature('b', { themes: foi }), feature('c', { themes: famille }), feature('d', { themes: foi, kind: 'serie' })];
    assert.deepEqual(similarTo(a, catalog, 10).map(r => r.slug), ['b', 'd']); // c : seul le type est commun (score 1)
  });

  it('personnalise sans re-proposer ce qui est connu, avec la raison la plus forte', () => {
    const catalog = [
      feature('vu', { themes: foi }), feature('liste', { themes: famille }),
      feature('proche-foi', { themes: foi }), feature('proche-famille', { themes: famille }), feature('autre', { kind: 'serie' }),
    ];
    const result = personalized([
      { slug: 'vu', weight: 1, via: 'completed' },
      { slug: 'liste', weight: 0.8, via: 'list' },
    ], catalog, 10);
    assert.deepEqual(result, [
      { slug: 'proche-foi', reason: 'Parce que vous avez regardé « VU »' },
      { slug: 'proche-famille', reason: 'Parce que « LISTE » est dans votre liste' },
    ]);
    assert.deepEqual(personalized([], catalog, 10), [], 'sans historique : rien d’inventé');
  });
});

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let app: Hono<AppEnv>;
let available = true;
let adminCookie = '';
let aliceCookie = '';

const send = (method: string, path: string, body?: unknown, cookie?: string) =>
  app.request(path, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const json = async (response: Response) => (await response.json()) as any;
const cookieOf = (response: Response) => (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
const asset = (id: string, slug: string, seconds = 1000) => registerAsset(sql, {
  playbackId: id, programSlug: slug, kind: 'film', title: slug, storagePath: id, durationSeconds: seconds,
  sourceWidth: 1280, sourceHeight: 720, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: true,
});

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
    sql, logger, storage: new StorageLayout('/tmp/origin-test-unused'),
    mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
    rateLimits: { apiPerMinute: 10_000, mediaPerMinute: 10_000, authPerMinute: 10_000, metricsPerMinute: 10_000 },
    identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: false,
    uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
  });
  await insertUser(sql, { id: randomUUID(), email: 'root@origin.test', passwordHash: await hashPassword('Mot de passe administrateur 1'), displayName: null, role: 'admin' });
  adminCookie = cookieOf(await send('POST', '/api/auth/login', { email: 'root@origin.test', password: 'Mot de passe administrateur 1' }));
  aliceCookie = cookieOf(await send('POST', '/api/auth/register', { email: 'alice@mail.fr', password: 'Un très bon mot de passe' }));

  await send('PUT', '/api/admin/themes/foi', { title: 'Foi' }, adminCookie);
  await send('PUT', '/api/admin/themes/famille', { title: 'Famille' }, adminCookie);
  const program = (slug: string, themes: string[], extra: Record<string, unknown> = {}) =>
    send('PUT', `/api/admin/programs/${slug}`, { kind: 'film', title: slug.toUpperCase(), published: true, themes, ...extra }, adminCookie);
  await program('alpha', ['foi'], { genres: ['Drame'] });
  await program('beta', ['foi']);
  await program('gamma', ['famille']);
  await program('delta', ['famille', 'foi']);
  await asset('alpha', 'alpha');
  await asset('gamma', 'gamma');
});

after(async () => {
  if (!available) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

describe('API de recommandation', () => {
  it('« dans le même esprit » sur une fiche', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const { items } = await json(await send('GET', '/api/programs/alpha/similar'));
    assert.deepEqual(items.map((i: any) => [i.program.slug, i.reason]), [
      ['beta', 'Même thématique : Foi'], ['delta', 'Même thématique : Foi'], // égalité de score : ordre alphabétique
    ]);
    assert.equal((await send('GET', '/api/programs/inconnu/similar')).status, 404);
  });

  it('anonyme : sélection éditoriale, jamais un faux « pour vous »', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const body = await json(await send('GET', '/api/recommendations'));
    assert.equal(body.personalized, false);
    assert.ok(body.items.length > 0);
    assert.ok(body.items.every((i: any) => i.reason === 'Sélection ORIGIN'));
    assert.equal(body.items[0].program.slug, 'alpha', 'les programmes lisibles d’abord');
  });

  it('tendances : fondées sur des lectures réelles (≥ 10 s)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const session = (playbackId: string, watched: number) => sql`
      INSERT INTO playback_sessions (id, playback_id, watch_seconds, device, browser, engine)
      VALUES (${randomUUID()}, ${playbackId}, ${watched}, 'desktop', 'Chrome', 'hlsjs')`;
    await session('gamma', 120);
    await session('gamma', 60);
    await session('alpha', 5); // ouverture accidentelle : ignorée
    const { items } = await json(await send('GET', '/api/trending?limit=3'));
    assert.deepEqual(items[0].program.slug, 'gamma');
    assert.equal(items[0].reason, 'Populaire en ce moment');
    assert.ok(items.slice(1).every((i: any) => i.reason === 'Sélection ORIGIN'));
  });

  it('connecté : personnalisé à partir de ce qui a été terminé', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    // Sans historique : repli sur les tendances.
    assert.equal((await json(await send('GET', '/api/recommendations', undefined, aliceCookie))).personalized, false);

    const saved = await send('PUT', '/api/me/progress/alpha', { positionSeconds: 990 }, aliceCookie);
    assert.equal(saved.status, 200);
    const body = await json(await send('GET', '/api/recommendations?limit=5', undefined, aliceCookie));
    assert.equal(body.personalized, true);
    const slugs = body.items.map((i: any) => i.program.slug);
    assert.ok(!slugs.includes('alpha'), 'ce qui est vu n’est pas re-proposé');
    assert.deepEqual(slugs.slice(0, 2).sort(), ['beta', 'delta']);
    assert.equal(body.items[0].reason, 'Parce que vous avez regardé « ALPHA »');
  });
});
