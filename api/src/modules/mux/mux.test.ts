/**
 * Tests de l'intégration Mux avec un FAUX Mux (aucun appel réseau, aucun vrai compte).
 * Ce qu'ils prouvent : notre code suit la documentation lue. Ce qu'ils ne prouvent pas : que le vrai Mux répond ainsi (voir `npm run mux:check`).
 */
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
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
import { createOriginSigner, createRoutingSigner } from '../playback/delivery.ts';
import { createMuxClient, MuxError } from './client.ts';
import { loadPrivateKey, signMuxToken } from './jwt.ts';
import { createMuxService, startMuxPoller, type MuxServiceConfig } from './service.ts';
import { createMuxSigner } from './signer.ts';

// ---- Faux Mux ---------------------------------------------------------------------------------------------------------
const TOKEN_ID = 'tok-test-id-1234';
const TOKEN_SECRET = 'secret-test-secret-test-1234';
interface Call { method: string; path: string; body: any; auth: string | undefined }

function fakeMux() {
  const calls: Call[] = [];
  const uploads = new Map<string, { status: string; asset_id?: string }>();
  const assets = new Map<string, Record<string, unknown>>();
  const control = { failNext: 0, counter: 0 };
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const { pathname } = new URL(url);
    const method = init.method ?? 'GET';
    calls.push({ method, path: pathname, body: init.body ? JSON.parse(String(init.body)) : undefined, auth: (init.headers as Record<string, string>)['Authorization'] });
    if ((init.headers as Record<string, string>)['Authorization'] !== `Basic ${Buffer.from(`${TOKEN_ID}:${TOKEN_SECRET}`).toString('base64')}`) return json({ error: { type: 'unauthorized', messages: ['Unauthorized request'] } }, 401);
    if (control.failNext > 0) { control.failNext -= 1; return json({}, 503); }
    let match: RegExpMatchArray | null;
    if (method === 'POST' && pathname === '/video/v1/uploads') {
      control.counter += 1;
      const id = `up-${control.counter}`;
      uploads.set(id, { status: 'waiting' });
      return json({ data: { id, url: `https://storage.example/upload/${id}?sig=abc`, status: 'waiting', timeout: 3600, cors_origin: 'x' } }, 201);
    }
    if (method === 'GET' && (match = pathname.match(/^\/video\/v1\/uploads\/([^/]+)$/))) {
      const upload = uploads.get(match[1] as string);
      return upload ? json({ data: { id: match[1], ...upload } }) : json({ error: { type: 'not_found', messages: ['not found'] } }, 404);
    }
    if (method === 'PUT' && (match = pathname.match(/^\/video\/v1\/uploads\/([^/]+)\/cancel$/))) {
      uploads.set(match[1] as string, { status: 'cancelled' });
      return json({ data: { id: match[1], status: 'cancelled' } });
    }
    if (method === 'GET' && (match = pathname.match(/^\/video\/v1\/assets\/([^/]+)$/))) {
      const asset = assets.get(match[1] as string);
      return asset ? json({ data: { id: match[1], ...asset } }) : json({ error: { type: 'not_found', messages: ['not found'] } }, 404);
    }
    if (method === 'DELETE' && pathname.startsWith('/video/v1/assets/')) { assets.delete(pathname.split('/').pop() as string); return new Response(null, { status: 204 }); }
    return json({}, 404);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls, uploads, assets, control };
}

const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const privateBase64 = Buffer.from(privatePem).toString('base64');

describe('client Mux', () => {
  it('envoie des champs confirmés, avec l’authentification Basic, et lit la réponse', async () => {
    const mux = fakeMux();
    const client = createMuxClient({ tokenId: TOKEN_ID, tokenSecret: TOKEN_SECRET, fetch: mux.fetchImpl, retries: 1 });
    const upload = await client.createDirectUpload({
      corsOrigin: 'https://admin.origin.test', passthrough: 'x'.repeat(300), playbackPolicy: 'signed', videoQuality: 'basic', normalizeAudio: false, timeoutSeconds: 600,
    });
    assert.equal(upload.id, 'up-1');
    assert.match(upload.url ?? '', /^https:\/\/storage\.example\/upload\//);
    const body = mux.calls[0]?.body;
    assert.deepEqual(Object.keys(body).sort(), ['cors_origin', 'new_asset_settings', 'timeout']);
    assert.deepEqual(body.new_asset_settings.playback_policies, ['signed'], 'pluriel confirmé par la documentation');
    assert.equal(body.new_asset_settings.video_quality, 'basic');
    assert.equal(body.new_asset_settings.passthrough.length, 255, 'borné à 255 caractères');
    assert.ok(!('normalize_audio' in body.new_asset_settings), 'champ non confirmé : jamais envoyé sans demande explicite');
    assert.equal(mux.calls[0]?.auth, `Basic ${Buffer.from(`${TOKEN_ID}:${TOKEN_SECRET}`).toString('base64')}`);
    await client.createDirectUpload({ corsOrigin: '*', passthrough: 'a', playbackPolicy: 'public', videoQuality: 'plus', normalizeAudio: true, timeoutSeconds: 60 });
    assert.equal(mux.calls[1]?.body.new_asset_settings.normalize_audio, true);
  });

  it('refus d’accès : message clair, jamais le secret, jamais de nouvel essai', async () => {
    const mux = fakeMux();
    const client = createMuxClient({ tokenId: TOKEN_ID, tokenSecret: 'mauvais-secret-mauvais', fetch: mux.fetchImpl, retries: 3 });
    await assert.rejects(client.getUpload('up-1'), (error: MuxError) => {
      assert.equal(error.status, 401);
      assert.match(error.message, /MUX_TOKEN_ID et MUX_TOKEN_SECRET/);
      assert.ok(!error.message.includes('mauvais-secret') && !error.message.includes(TOKEN_SECRET));
      return true;
    });
    assert.equal(mux.calls.length, 1, 'un refus d’accès n’est pas réessayé');
  });

  it('réessaie une panne passagère (503) puis réussit ; une réponse inattendue est refusée', async () => {
    const mux = fakeMux();
    const client = createMuxClient({ tokenId: TOKEN_ID, tokenSecret: TOKEN_SECRET, fetch: mux.fetchImpl, retries: 2 });
    mux.control.failNext = 1;
    assert.equal((await client.createDirectUpload({ corsOrigin: '*', passthrough: 'a', playbackPolicy: 'public', videoQuality: 'basic', normalizeAudio: false, timeoutSeconds: 60 })).id, 'up-1');
    assert.equal(mux.calls.length, 2);
    const odd = createMuxClient({ tokenId: TOKEN_ID, tokenSecret: TOKEN_SECRET, retries: 1, fetch: (async () => new Response('{"data":{}}', { status: 200 })) as unknown as typeof fetch });
    await assert.rejects(odd.getUpload('x'), /Réponse inattendue/);
  });
});

describe('jetons de lecture signés', () => {
  it('JWT RS256 vérifiable avec la clé publique, claims conformes, kid en-tête et claims', () => {
    const token = signMuxToken({ key: loadPrivateKey(privateBase64), keyId: 'kid-123456', playbackId: 'pid-1', audience: 'v', expiresAtSeconds: 2_000_000_000 });
    const [header, payload, signature] = token.split('.') as [string, string, string];
    assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { alg: 'RS256', typ: 'JWT', kid: 'kid-123456' });
    assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url').toString()), { sub: 'pid-1', aud: 'v', exp: 2_000_000_000, kid: 'kid-123456' });
    assert.equal(createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(keyPair.publicKey, Buffer.from(signature, 'base64url')), true);
    // PEM brut accepté aussi ; une clé illisible échoue franchement.
    assert.ok(signMuxToken({ key: loadPrivateKey(privatePem), keyId: 'k', playbackId: 'p', audience: 't', expiresAtSeconds: 1 }));
    assert.throws(() => loadPrivateKey('pas-une-cle'));
  });

  it('signataire : public sans jeton ; signé avec jeton plus long que la vidéo ; configuration manquante = 503', () => {
    const asset = { playbackId: 'film', storagePath: 'x', provider: 'mux' as const, providerPlaybackId: 'pid-9', durationSeconds: 7200 };
    const now = 1_700_000_000_000;
    const open = createMuxSigner({ ttlSeconds: 14_400 }).sign({ ...asset, providerPolicy: 'public' }, { publicOrigin: 'http://x', now });
    assert.equal(open.manifestUrl, 'https://stream.mux.com/pid-9.m3u8');
    assert.equal(open.posterUrl, 'https://image.mux.com/pid-9/thumbnail.jpg');

    const signer = createMuxSigner({ ttlSeconds: 3600, signing: { keyId: 'kid-123456', privateKey: privateBase64 } });
    const signed = signer.sign({ ...asset, providerPolicy: 'signed' }, { publicOrigin: 'http://x', now });
    const token = new URL(signed.manifestUrl).searchParams.get('token') as string;
    const claims = JSON.parse(Buffer.from(token.split('.')[1] as string, 'base64url').toString());
    assert.equal(claims.aud, 'v');
    assert.ok(claims.exp >= Math.floor(now / 1000) + 7200 + 3600, 'le jeton dure plus que le film');
    const posterToken = new URL(signed.posterUrl).searchParams.get('token') as string;
    assert.equal(JSON.parse(Buffer.from(posterToken.split('.')[1] as string, 'base64url').toString()).aud, 't');

    assert.throws(() => createMuxSigner({ ttlSeconds: 60 }).sign({ ...asset, providerPolicy: 'signed' }, { publicOrigin: 'x', now }), /non configurée/);
    assert.throws(() => createMuxSigner({ ttlSeconds: 60 }).sign({ playbackId: 'a', storagePath: 'a', provider: 'mux', providerPolicy: 'public' }, { publicOrigin: 'x' }), /identifiant de lecture/);
  });

  it('routage : le signataire est choisi par média ; Mux absent = 503', () => {
    const self = createOriginSigner({ secret: 'secret-test-secret-test-secret-test!!', ttlSeconds: 60 });
    const router = createRoutingSigner({ self, mux: createMuxSigner({ ttlSeconds: 60 }) });
    assert.match(router.sign({ playbackId: 'a', storagePath: 'a' }, { publicOrigin: 'http://api' }).manifestUrl, /^http:\/\/api\/media\//);
    assert.match(router.sign({ playbackId: 'a', storagePath: 'a', provider: 'mux', providerPlaybackId: 'p', providerPolicy: 'public' }, { publicOrigin: 'http://api' }).manifestUrl, /^https:\/\/stream\.mux\.com\//);
    assert.throws(() => createRoutingSigner({ self }).sign({ playbackId: 'a', storagePath: 'a', provider: 'mux' }, { publicOrigin: 'x' }), /n’est pas configurée/);
  });
});

// ---- Intégration avec la base et l'application ----------------------------------------------------------------------------
const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let available = true;
let app: Hono<AppEnv>;
let appWithoutMux: Hono<AppEnv>;
let adminCookie = '';
let viewerCookie = '';
const mux = fakeMux();
const serviceConfig: MuxServiceConfig = { playbackPolicy: 'public', videoQuality: 'basic', normalizeAudio: false };
const logger = pino({ level: 'silent' });
const client = createMuxClient({ tokenId: TOKEN_ID, tokenSecret: TOKEN_SECRET, fetch: mux.fetchImpl, retries: 1 });
let service: ReturnType<typeof createMuxService>;

const call = (target: Hono<AppEnv>, method: string, path: string, body?: unknown, cookie?: string, origin?: string) =>
  target.request(path, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const json = async (response: Response) => (await response.json()) as any;
const start = (target: Hono<AppEnv>, over: Record<string, unknown> = {}) =>
  call(target, 'POST', '/api/admin/mux/uploads', { playbackId: 'film-mux', kind: 'film', title: 'Film Mux', ...over }, adminCookie, 'http://localhost:5174');
const readyAsset = (id: string, extra: Record<string, unknown> = {}) =>
  mux.assets.set(id, { status: 'ready', duration: 125.5, playback_ids: [{ id: `pb-${id}`, policy: 'public' }], ...extra });

function buildApp(withMux: boolean): Hono<AppEnv> {
  const identity = createIdentityService({ sql, logger, mailer: { async send() {} }, config: { registrationMode: 'open', sessionTtlSeconds: 3600, publicAppUrl: 'http://localhost:3210' } });
  return createApp({
    sql, logger, storage: new StorageLayout('/tmp/origin-mux-unused'),
    mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
    rateLimits: { apiPerMinute: 10_000, mediaPerMinute: 10_000, authPerMinute: 10_000, metricsPerMinute: 10_000 },
    identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: false, uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
    deliverySigner: createRoutingSigner({
      self: createOriginSigner({ secret: 'secret-test-secret-test-secret-test!!', ttlSeconds: 60 }),
      mux: createMuxSigner({ ttlSeconds: 3600, signing: { keyId: 'kid-123456', privateKey: privateBase64 } }),
    }),
    mux: { service: withMux ? service : null, defaultProvider: withMux ? 'mux' : 'self', playbackPolicy: 'public' },
  });
}

before(async () => {
  admin = connect(databaseUrl, { max: 1 });
  try { await admin`SELECT 1`; } catch { available = false; await admin.end(); return; }
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = connect(databaseUrl, { max: 4, connection: { search_path: schema } });
  await migrate(sql);
  service = createMuxService({ sql, client, logger, config: serviceConfig });
  app = buildApp(true);
  appWithoutMux = buildApp(false);
  await insertUser(sql, { id: randomUUID(), email: 'root@origin.test', passwordHash: await hashPassword('Mot de passe administrateur 1'), displayName: null, role: 'admin' });
  const login = await call(app, 'POST', '/api/auth/login', { email: 'root@origin.test', password: 'Mot de passe administrateur 1' });
  adminCookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  viewerCookie = ((await call(app, 'POST', '/api/auth/register', { email: 'viewer@mail.fr', password: 'Un très bon mot de passe' })).headers.get('set-cookie') ?? '').split(';')[0] ?? '';
});

after(async () => {
  if (!available) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

describe('routes Mux (administrateur)', () => {
  it('réservées à l’administrateur ; 503 clair si Mux n’est pas configuré', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await call(app, 'POST', '/api/admin/mux/uploads', { playbackId: 'a', kind: 'film', title: 'T' })).status, 401);
    assert.equal((await call(app, 'POST', '/api/admin/mux/uploads', { playbackId: 'a', kind: 'film', title: 'T' }, viewerCookie)).status, 403);
    const unconfigured = await start(appWithoutMux);
    assert.equal(unconfigured.status, 503);
    assert.match((await json(unconfigured)).message, /MUX_TOKEN_ID/);
  });

  it('indique au back-office quelles voies vidéo existent', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const withMux = await json(await call(app, 'GET', '/api/admin/video-providers', undefined, adminCookie));
    assert.equal(withMux.default, 'mux');
    assert.deepEqual(withMux.providers.map((p: any) => [p.id, p.configured]), [['self', true], ['mux', true]]);
    const without = await json(await call(appWithoutMux, 'GET', '/api/admin/video-providers', undefined, adminCookie));
    assert.deepEqual(without.providers.map((p: any) => [p.id, p.configured]), [['self', true], ['mux', false]]);
    assert.equal((await call(app, 'GET', '/api/admin/video-providers')).status, 401);
  });

  it('valide la demande', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await start(app, { playbackId: 'Mauvais_ID' })).status, 400);
    assert.equal((await start(app, { kind: 'brand' })).status, 400);
    assert.equal((await start(app, { title: '' })).status, 400);
    assert.equal((await start(app, { inconnu: 1 })).status, 400, 'champs inconnus refusés');
  });

  it('parcours complet : adresse d’envoi → en préparation → prêt → lisible avec un lien Mux', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const created = await start(app);
    assert.equal(created.status, 201);
    const upload = await json(created);
    assert.equal(upload.status, 'waiting');
    assert.match(upload.uploadUrl, /^https:\/\/storage\.example\/upload\//, 'l’adresse d’envoi est renvoyée à la création');
    const creation = mux.calls.find(c => c.method === 'POST')?.body;
    assert.equal(creation.cors_origin, 'http://localhost:5174', 'l’envoi n’est autorisé que depuis l’origine du back-office');
    assert.equal(creation.new_asset_settings.passthrough, 'film-mux');
    const stored = await sql`SELECT * FROM mux_uploads WHERE id = ${upload.id}`;
    assert.ok(!JSON.stringify(stored).includes('storage.example'), 'l’adresse d’envoi n’est jamais conservée');

    // Un second envoi pour le même contenu est refusé.
    assert.equal((await start(app)).status, 409);

    // Mux attend encore le fichier.
    assert.equal((await json(await call(app, 'GET', `/api/admin/mux/uploads/${upload.id}`, undefined, adminCookie))).status, 'waiting');
    // Le fichier est arrivé : Mux crée la vidéo, qu'il prépare.
    mux.uploads.set('up-1', { status: 'asset_created', asset_id: 'asset-1' });
    mux.assets.set('asset-1', { status: 'preparing' });
    assert.equal((await json(await call(app, 'GET', `/api/admin/mux/uploads/${upload.id}`, undefined, adminCookie))).status, 'processing');
    assert.equal((await call(app, 'GET', '/api/programs/film-mux/playback')).status, 404, 'pas lisible tant que Mux prépare');
    // La vidéo est prête.
    readyAsset('asset-1');
    const done = await json(await call(app, 'GET', `/api/admin/mux/uploads/${upload.id}`, undefined, adminCookie));
    assert.equal(done.status, 'ready');
    assert.ok(done.finishedAt);

    const [asset] = await sql<any[]>`SELECT provider, provider_asset_id, provider_playback_id, provider_policy, duration_seconds::float AS duration, status FROM media_assets WHERE playback_id = 'film-mux'`;
    assert.deepEqual(asset, { provider: 'mux', provider_asset_id: 'asset-1', provider_playback_id: 'pb-asset-1', provider_policy: 'public', duration: 125.5, status: 'ready' });

    const playback = await call(app, 'GET', '/api/programs/film-mux/playback');
    assert.equal(playback.status, 200);
    const info = await json(playback);
    assert.equal(info.manifestUrl, 'https://stream.mux.com/pb-asset-1.m3u8');
    assert.equal(info.posterUrl, 'https://image.mux.com/pb-asset-1/thumbnail.jpg');
    assert.equal(info.durationSeconds, 125.5);
    assert.deepEqual(info.subtitles, []);

    // Rien n'est servi par notre serveur pour un média Mux, et rafraîchir une seconde fois ne duplique rien.
    assert.equal((await call(app, 'GET', '/media/anything/film-mux/master.m3u8')).status, 403);
    await call(app, 'GET', `/api/admin/mux/uploads/${upload.id}`, undefined, adminCookie);
    assert.equal((await sql`SELECT 1 FROM media_assets WHERE playback_id = 'film-mux'`).length, 1);
    assert.equal((await sql`SELECT 1 FROM programs WHERE slug = 'film-mux'`).length, 1);
  });

  it('échec côté Mux : message clair, rien n’est publié ; on peut recommencer', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const upload = await json(await start(app, { playbackId: 'film-casse' }));
    mux.uploads.set(`up-${mux.control.counter}`, { status: 'asset_created', asset_id: 'asset-bad' });
    mux.assets.set('asset-bad', { status: 'errored', errors: { type: 'invalid_input', messages: ['Fichier non vidéo'] } });
    const failed = await json(await call(app, 'GET', `/api/admin/mux/uploads/${upload.id}`, undefined, adminCookie));
    assert.equal(failed.status, 'failed');
    assert.match(failed.error, /Fichier non vidéo/);
    assert.equal((await sql`SELECT 1 FROM media_assets WHERE playback_id = 'film-casse'`).length, 0);
    assert.equal((await start(app, { playbackId: 'film-casse' })).status, 201, 'un nouvel essai est possible après un échec');
  });

  it('panne passagère de Mux : l’envoi n’est PAS déclaré en échec ; durée absente ou lien absent = échec explicite', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const upload = await json(await start(app, { playbackId: 'film-panne' }));
    mux.control.failNext = 5; // plus de pannes que d'essais
    const row = await json(await call(app, 'GET', `/api/admin/mux/uploads/${upload.id}`, undefined, adminCookie));
    assert.equal(row.status, 'waiting', 'toujours en attente, pas en échec');
    mux.control.failNext = 0;

    const noDuration = await json(await start(app, { playbackId: 'film-sans-duree' }));
    mux.uploads.set(`up-${mux.control.counter}`, { status: 'asset_created', asset_id: 'asset-nd' });
    mux.assets.set('asset-nd', { status: 'ready', playback_ids: [{ id: 'pb-nd', policy: 'public' }] });
    assert.match((await json(await call(app, 'GET', `/api/admin/mux/uploads/${noDuration.id}`, undefined, adminCookie))).error, /durée/);

    const noLink = await json(await start(app, { playbackId: 'film-sans-lien' }));
    mux.uploads.set(`up-${mux.control.counter}`, { status: 'asset_created', asset_id: 'asset-nl' });
    mux.assets.set('asset-nl', { status: 'ready', duration: 10, playback_ids: [] });
    assert.match((await json(await call(app, 'GET', `/api/admin/mux/uploads/${noLink.id}`, undefined, adminCookie))).error, /lien de lecture/);
  });

  it('annulation, délai dépassé, statut inconnu', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const upload = await json(await start(app, { playbackId: 'film-annule' }));
    assert.equal((await call(app, 'POST', `/api/admin/mux/uploads/${upload.id}/cancel`, undefined, adminCookie)).status, 204);
    assert.equal((await json(await call(app, 'GET', `/api/admin/mux/uploads/${upload.id}`, undefined, adminCookie))).status, 'canceled');
    assert.equal((await call(app, 'POST', `/api/admin/mux/uploads/${upload.id}/cancel`, undefined, adminCookie)).status, 409, 'déjà terminé');

    const slow = await json(await start(app, { playbackId: 'film-expire' }));
    mux.uploads.set(`up-${mux.control.counter}`, { status: 'timed_out' });
    const expired = await json(await call(app, 'GET', `/api/admin/mux/uploads/${slow.id}`, undefined, adminCookie));
    assert.equal(expired.status, 'failed');
    assert.match(expired.error, /expiré/);

    const odd = await json(await start(app, { playbackId: 'film-etrange' }));
    mux.uploads.set(`up-${mux.control.counter}`, { status: 'statut-inconnu' });
    assert.equal((await json(await call(app, 'GET', `/api/admin/mux/uploads/${odd.id}`, undefined, adminCookie))).status, 'waiting', 'un statut inconnu n’est jamais pris pour un succès');
    assert.equal((await call(app, 'GET', '/api/admin/mux/uploads/pas-un-id', undefined, adminCookie)).status, 400);
    assert.equal((await call(app, 'GET', `/api/admin/mux/uploads/${randomUUID()}`, undefined, adminCookie)).status, 404);
  });

  it('liste filtrable ; le poller termine seul les envois actifs', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const upload = await json(await start(app, { playbackId: 'serie-m-s1-e1', programSlug: 'serie-m', kind: 'serie' }));
    const listed = await json(await call(app, 'GET', '/api/admin/mux/uploads?program=serie-m', undefined, adminCookie));
    assert.deepEqual(listed.uploads.map((u: any) => u.playbackId), ['serie-m-s1-e1']);
    assert.equal((await call(app, 'GET', '/api/admin/mux/uploads?program=Mauvais_ID', undefined, adminCookie)).status, 400);

    mux.uploads.set(`up-${mux.control.counter}`, { status: 'asset_created', asset_id: 'asset-poll' });
    readyAsset('asset-poll');
    const stop = startMuxPoller(service, logger, 20);
    for (let i = 0; i < 50 && (await service.get(upload.id))?.status !== 'ready'; i += 1) await new Promise(resolve => setTimeout(resolve, 40));
    stop();
    assert.equal((await service.get(upload.id))?.status, 'ready');
    const detail = await json(await call(app, 'GET', '/api/programs/serie-m-s1-e1/playback'));
    assert.match(detail.manifestUrl, /^https:\/\/stream\.mux\.com\//);
  });

  it('lien signé : le média « signed » reçoit un jeton valide à la lecture', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const signedService = createMuxService({ sql, client, logger, config: { ...serviceConfig, playbackPolicy: 'signed' } });
    const signedApp = (() => { service = signedService; return buildApp(true); })();
    const upload = await json(await start(signedApp, { playbackId: 'film-signe' }));
    assert.equal(mux.calls.filter(c => c.method === 'POST').at(-1)?.body.new_asset_settings.playback_policies[0], 'signed');
    mux.uploads.set(`up-${mux.control.counter}`, { status: 'asset_created', asset_id: 'asset-s' });
    mux.assets.set('asset-s', { status: 'ready', duration: 3000, playback_ids: [{ id: 'pb-signe', policy: 'signed' }] });
    await call(signedApp, 'GET', `/api/admin/mux/uploads/${upload.id}`, undefined, adminCookie);
    const info = await json(await call(signedApp, 'GET', '/api/programs/film-signe/playback'));
    const token = new URL(info.manifestUrl).searchParams.get('token') as string;
    const [header, payload, signature] = token.split('.') as [string, string, string];
    assert.equal(createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(keyPair.publicKey, Buffer.from(signature, 'base64url')), true);
    assert.equal(JSON.parse(Buffer.from(payload, 'base64url').toString()).sub, 'pb-signe');
  });
});
