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
import { registerAsset } from '../ingest/repository.ts';

const PASSWORD = 'Un très bon mot de passe';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const AVIF = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif'), Buffer.alloc(16)]);
const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
const storageRoot = `/tmp/origin-continuity-${randomBytes(4).toString('hex')}`;
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



const asset = (playbackId: string, programSlug: string, kind: 'film' | 'serie', title: string, durationSeconds = 600) =>
  registerAsset(sql, { playbackId, programSlug, kind, title, storagePath: playbackId, durationSeconds, sourceWidth: 1280, sourceHeight: 720, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: false });
const serie = {
  kind: 'serie', title: 'Ma série', published: true,
  seasons: [{ number: 1, title: 'Saison 1', episodes: [{ key: 's1-e1', number: 1, title: 'Un' }, { key: 's1-e2', number: 2, title: 'Deux' }, { key: 's1-e3', number: 3, title: 'Trois' }] }],
};
const target = async (slug: string, cookie?: string) => json(await call('GET', `/api/programs/${slug}/play-target`, undefined, cookie));
const save = (id: string, positionSeconds: number, cookie: string, durationSeconds = 600) => call('PUT', `/api/me/progress/${id}`, { positionSeconds, durationSeconds }, cookie);

describe('lecture : contexte, repères et cible', () => {
  it('prépare une série (épisodes 1 et 2 prêts, 3 sans média) et un film', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await call('PUT', '/api/admin/programs/ma-serie', serie, adminCookie)).status, 201);
    await asset('ma-serie-s1-e1', 'ma-serie', 'serie', 'Ma série');
    await asset('ma-serie-s1-e2', 'ma-serie', 'serie', 'Ma série');
    assert.equal((await call('PUT', '/api/admin/programs/mon-film', { kind: 'film', title: 'Mon film', published: true }, adminCookie)).status, 201);
    await asset('mon-film', 'mon-film', 'film', 'Mon film');
  });

  it('la réponse de lecture dit ce qui est lu et quel épisode suit', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const first = await json(await call('GET', '/api/programs/ma-serie-s1-e1/playback'));
    assert.deepEqual(first.content, { programSlug: 'ma-serie', title: 'Ma série', kind: 'serie', episode: { season: 1, number: 1, title: 'Un' } });
    assert.deepEqual(first.next, { playbackId: 'ma-serie-s1-e2', season: 1, number: 2, title: 'Deux' });
    assert.equal(first.resume, null, 'visiteur anonyme : pas de reprise');
    const last = await json(await call('GET', '/api/programs/ma-serie-s1-e2/playback'));
    assert.equal(last.next, null, 'l’épisode 3 n’a pas de média : le 2 est le dernier lisible');
    const film = await json(await call('GET', '/api/programs/mon-film/playback'));
    assert.equal(film.content.episode, null);
    assert.equal(film.next, null);
  });

  it('repères : administrateur seulement, cohérents, renvoyés par la lecture et la fiche admin', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const viewer = cookieOf(await call('POST', '/api/auth/register', { email: 'vic@mail.fr', password: PASSWORD }));
    const put = (body: unknown, cookie?: string, id = 'ma-serie-s1-e1') => call('PUT', `/api/admin/media/${id}/markers`, body, cookie);
    assert.equal((await put({ introStart: 5, introEnd: 40, creditsStart: 560 })).status, 401);
    assert.equal((await put({ introStart: 5, introEnd: 40, creditsStart: 560 }, viewer)).status, 403);
    assert.equal((await put({ introStart: 40, introEnd: 5, creditsStart: null }, adminCookie)).status, 400, 'intro à l’envers');
    assert.equal((await put({ introStart: 5, introEnd: null, creditsStart: null }, adminCookie)).status, 400, 'début sans fin');
    assert.equal((await put({ introStart: 5, introEnd: 100, creditsStart: 50 }, adminCookie)).status, 400, 'générique avant la fin de l’intro');
    assert.equal((await put({ introStart: 5, introEnd: 40, creditsStart: 560, extra: 1 }, adminCookie)).status, 400);
    assert.equal((await put({ introStart: 5, introEnd: 40, creditsStart: 560 }, adminCookie, 'inconnu')).status, 404);
    assert.equal((await put({ introStart: 5, introEnd: 40, creditsStart: 560 }, adminCookie)).status, 204);
    const session = await json(await call('GET', '/api/programs/ma-serie-s1-e1/playback'));
    assert.deepEqual(session.markers, { introStart: 5, introEnd: 40, creditsStart: 560 });
    assert.deepEqual((await json(await call('GET', '/api/programs/ma-serie-s1-e2/playback'))).markers, { introStart: null, introEnd: null, creditsStart: null });
    const adminView = await json(await call('GET', '/api/admin/programs/ma-serie', undefined, adminCookie));
    assert.deepEqual(adminView.media.find((m: any) => m.playbackId === 'ma-serie-s1-e1').markers, { introStartSeconds: 5, introEndSeconds: 40, creditsStartSeconds: 560 });
    assert.equal((await put({ introStart: null, introEnd: null, creditsStart: null }, adminCookie)).status, 204, 'effacer');
  });

  it('cible du bouton principal : début, reprise, suivant, tout revu', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await call('GET', '/api/programs/inconnu/play-target')).status, 404);
    assert.equal((await call('PUT', '/api/admin/programs/vide', { kind: 'film', title: 'Sans média', published: true }, adminCookie)).status, 201);
    assert.equal((await call('GET', '/api/programs/vide/play-target')).status, 404, 'rien de lisible');
    assert.equal((await target('ma-serie')).state, 'start', 'anonyme');

    const cookie = cookieOf(await call('POST', '/api/auth/register', { email: 'wes@mail.fr', password: PASSWORD }));
    assert.deepEqual(await target('ma-serie', cookie), { state: 'start', playbackId: 'ma-serie-s1-e1', episode: { key: 's1-e1', season: 1, seasonNumber: 1, number: 1, title: 'Un' }, resumeSeconds: 0 });
    await save('ma-serie-s1-e1', 200, cookie);
    const resumed = await target('ma-serie', cookie);
    assert.deepEqual([resumed.state, resumed.playbackId, resumed.resumeSeconds], ['resume', 'ma-serie-s1-e1', 200]);
    assert.equal((await json(await call('GET', '/api/programs/ma-serie-s1-e1/playback', undefined, cookie))).resume.positionSeconds, 200);

    await save('ma-serie-s1-e1', 599, cookie); // terminé (≈ fin)
    assert.deepEqual([(await target('ma-serie', cookie)).state, (await target('ma-serie', cookie)).playbackId], ['next', 'ma-serie-s1-e2']);
    await save('ma-serie-s1-e2', 599, cookie);
    assert.deepEqual([(await target('ma-serie', cookie)).state, (await target('ma-serie', cookie)).playbackId], ['rewatch', 'ma-serie-s1-e1']);

    await save('mon-film', 90, cookie);
    assert.equal((await target('mon-film', cookie)).state, 'resume');

    await call('PUT', '/api/me/preferences', { history: false }, cookie);
    assert.equal((await target('mon-film', cookie)).state, 'start', 'historique désactivé : toujours le début');
    assert.equal((await json(await call('GET', '/api/programs/mon-film/playback', undefined, cookie))).resume, null);
  });
});
