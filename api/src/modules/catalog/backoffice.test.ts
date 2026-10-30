/** Ajouts pour le back-office : envoi d'images (B1), fiche admin d'un programme (B2), filtre des tâches (B4). */
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
import { enqueueJob } from '../ingest/jobs.repository.ts';
import { registerAsset } from '../ingest/repository.ts';
import { detectImageFormat } from './images.ts';

// Octets d'en-tête réels de chaque format (suffisants pour la reconnaissance, pas des images affichables).
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(16)]);
const AVIF = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif'), Buffer.alloc(16)]);

describe('reconnaissance du format d’image', () => {
  it('reconnaît jpg, png, webp, avif et refuse le reste (SVG, texte, exécutable)', () => {
    assert.equal(detectImageFormat(JPG), 'jpg');
    assert.equal(detectImageFormat(PNG), 'png');
    assert.equal(detectImageFormat(WEBP), 'webp');
    assert.equal(detectImageFormat(AVIF), 'avif');
    assert.equal(detectImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null);
    assert.equal(detectImageFormat(Buffer.from('MZ\u0090\u0000 exécutable')), null);
    assert.equal(detectImageFormat(Buffer.from('')), null);
    assert.equal(detectImageFormat(Buffer.from([0xff, 0xd8])), null, 'trop court');
  });
});

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
const storageRoot = `/tmp/origin-bo-${randomBytes(4).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let app: Hono<AppEnv>;
let available = true;
let adminCookie = '';
let viewerCookie = '';

const call = (method: string, path: string, body?: string | Uint8Array, cookie?: string, type = 'application/json') =>
  app.request(path, { method, headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': type }) }, ...(body === undefined ? {} : { body: body as BodyInit }) });
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
    sql, logger, storage: new StorageLayout(storageRoot),
    mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
    rateLimits: { apiPerMinute: 10_000, mediaPerMinute: 10_000, authPerMinute: 10_000, metricsPerMinute: 10_000 },
    identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: false,
    uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
  });
  await insertUser(sql, { id: randomUUID(), email: 'root@origin.test', passwordHash: await hashPassword('Mot de passe administrateur 1'), displayName: null, role: 'admin' });
  const login = await call('POST', '/api/auth/login', JSON.stringify({ email: 'root@origin.test', password: 'Mot de passe administrateur 1' }));
  adminCookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const reg = await call('POST', '/api/auth/register', JSON.stringify({ email: 'viewer@mail.fr', password: 'Un très bon mot de passe' }));
  viewerCookie = (reg.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
});

after(async () => {
  if (!available) return;
  await rm(storageRoot, { recursive: true, force: true });
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

describe('B1 — envoi d’images', () => {
  it('réservé à l’administrateur', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await call('PUT', '/files/images/film/poster.png', PNG, undefined, 'image/png')).status, 401);
    assert.equal((await call('PUT', '/files/images/film/poster.png', PNG, viewerCookie, 'image/png')).status, 403);
  });

  it('dépose chaque format, renvoie l’URL publique et la sert avec le bon type ; remplace un fichier existant', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const cases: [string, Buffer, string][] = [['poster.png', PNG, 'image/png'], ['hero.jpg', JPG, 'image/jpeg'], ['logo.webp', WEBP, 'image/webp'], ['fond.avif', AVIF, 'image/avif'], ['alt.jpeg', JPG, 'image/jpeg']];
    for (const [file, bytes, type] of cases) {
      const response = await call('PUT', `/files/images/le-film/${file}`, bytes, adminCookie, type);
      assert.equal(response.status, 201, file);
      assert.deepEqual(await json(response), { url: `/images/le-film/${file}`, bytes: bytes.byteLength });
      const served = await call('GET', `/images/le-film/${file}`);
      assert.equal(served.status, 200);
      assert.equal(served.headers.get('content-type'), type);
      assert.deepEqual(Buffer.from(await served.arrayBuffer()), bytes);
    }
    const bigger = Buffer.concat([PNG, Buffer.alloc(100)]);
    assert.equal((await call('PUT', '/files/images/le-film/poster.png', bigger, adminCookie, 'image/png')).status, 201);
    assert.equal((await (await call('GET', '/images/le-film/poster.png')).arrayBuffer()).byteLength, bigger.byteLength, 'remplacé');
  });

  it('refuse : mauvais contenu, extension qui ment, SVG, vide, nom ou dossier piégés', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const put = (path: string, body: Uint8Array) => call('PUT', path, body, adminCookie, 'application/octet-stream');
    assert.equal((await put('/files/images/film/faux.png', Buffer.from('ceci est du texte'))).status, 400, 'contenu ≠ image');
    assert.equal((await put('/files/images/film/menteur.png', JPG)).status, 400, 'extension ≠ contenu réel');
    assert.equal((await put('/files/images/film/x.svg', Buffer.from('<svg/>'))).status, 400, 'SVG non accepté');
    assert.equal((await put('/files/images/film/vide.png', Buffer.alloc(0))).status, 400);
    assert.equal((await put('/files/images/film/..%2Fevil.png', PNG)).status, 400, 'nom avec chemin');
    assert.equal((await put('/files/images/Mauvais_Slug/a.png', PNG)).status, 400, 'identifiant invalide');
    assert.equal((await put('/files/images/film/.cache.png', PNG)).status, 400, 'nom commençant par un point');
  });

  it('refuse une image de plus de 10 Mo', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const huge = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]);
    assert.equal((await call('PUT', '/files/images/film/grosse.png', huge, adminCookie, 'image/png')).status, 413);
  });
});

describe('B2 — fiche admin d’un programme', () => {
  const doc = {
    kind: 'serie', title: 'Ma série', titleLines: ['MA', 'SÉRIE'], tagline: 'Une accroche', synopsis: 'Résumé', category: 'Série originale',
    durationLabel: '3 épisodes', year: 2026, language: 'Français', genres: ['Drame'], badges: ['Nouveau'], published: false, isDemo: false,
    posterUrl: '/images/ma-serie/poster.png', imageAlt: 'Affiche', themes: ['foi'],
    seasons: [{ number: 1, title: 'Saison 1', episodes: [{ key: 's1-e1', number: 1, title: 'Épisode 1' }, { key: 's1-e2', number: 2, title: 'Épisode 2', synopsis: 'Suite' }] }],
  };

  it('réservé à l’administrateur ; 404 si inconnu', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await call('GET', '/api/admin/programs/ma-serie')).status, 401);
    assert.equal((await call('GET', '/api/admin/programs/ma-serie', undefined, viewerCookie)).status, 403);
    assert.equal((await call('GET', '/api/admin/programs/inconnu', undefined, adminCookie)).status, 404);
  });

  it('montre le brouillon, les médias et les tâches ; le document se renvoie tel quel (aller-retour)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await call('PUT', '/api/admin/themes/foi', JSON.stringify({ title: 'Foi' }), adminCookie);
    assert.equal((await call('PUT', '/api/admin/programs/ma-serie', JSON.stringify(doc), adminCookie)).status, 201);
    assert.equal((await call('GET', '/api/programs/ma-serie')).status, 404, 'brouillon : invisible du public');

    await registerAsset(sql, {
      playbackId: 'ma-serie-s1-e1', programSlug: 'ma-serie', kind: 'serie', title: 'Ma série', storagePath: 'ma-serie-s1-e1', durationSeconds: 60,
      sourceWidth: 1280, sourceHeight: 720, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: false,
    });
    await enqueueJob(sql, {
      id: randomUUID(), playbackId: 'ma-serie-s1-e2', programSlug: 'ma-serie', kind: 'serie', title: 'Ma série', isDemo: false,
      sourcePath: 'ma-serie-s1-e2/original.mp4', preset: 'ultrafast', uploadId: null, createdBy: null,
    });

    const response = await call('GET', '/api/admin/programs/ma-serie', undefined, adminCookie);
    assert.equal(response.status, 200);
    const view = await json(response);
    assert.equal(view.slug, 'ma-serie');
    assert.equal(view.document.published, false);
    assert.equal(view.document.title, 'Ma série');
    assert.deepEqual(view.document.themes, ['foi']);
    assert.deepEqual(view.document.seasons[0].episodes.map((e: any) => e.key), ['s1-e1', 's1-e2']);
    assert.deepEqual(view.media.map((m: any) => [m.playbackId, m.status, m.durationSeconds]), [['ma-serie-s1-e1', 'ready', 60]]);
    assert.deepEqual(view.jobs.map((j: any) => [j.playbackId, j.status]), [['ma-serie-s1-e2', 'queued']]);
    assert.match(view.createdAt, /^\d{4}-\d{2}-\d{2}T/);

    // Aller-retour : le `document` renvoyé est accepté tel quel par PUT, sans rien changer.
    const again = await call('PUT', '/api/admin/programs/ma-serie', JSON.stringify(view.document), adminCookie);
    assert.equal(again.status, 200);
    const second = await json(await call('GET', '/api/admin/programs/ma-serie', undefined, adminCookie));
    assert.deepEqual(second.document, view.document);
  });

  it('n’expose jamais un contenu de marque', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await registerAsset(sql, {
      playbackId: 'origin-ident', programSlug: 'origin-ident', kind: 'brand', title: 'ORIGIN', storagePath: 'origin-ident', durationSeconds: 6,
      sourceWidth: 1920, sourceHeight: 1080, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: false,
    });
    assert.equal((await call('GET', '/api/admin/programs/origin-ident', undefined, adminCookie)).status, 404);
  });
});

describe('B4 — filtre des tâches de préparation', () => {
  it('filtre par programme et par contenu ; refuse un filtre invalide', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    for (const [playbackId, programSlug] of [['film-a', 'film-a'], ['serie-b-s1-e1', 'serie-b'], ['serie-b-s1-e2', 'serie-b']]) {
      await enqueueJob(sql, {
        id: randomUUID(), playbackId: playbackId as string, programSlug: programSlug as string, kind: 'film', title: 'T', isDemo: false,
        sourcePath: `${playbackId}/original.mp4`, preset: 'ultrafast', uploadId: null, createdBy: null,
      });
    }
    const list = async (query: string) => (await json(await call('GET', `/api/admin/jobs${query}`, undefined, adminCookie))).jobs.map((j: any) => j.playbackId).sort();
    assert.deepEqual(await list('?program=serie-b'), ['serie-b-s1-e1', 'serie-b-s1-e2']);
    assert.deepEqual(await list('?playbackId=film-a'), ['film-a']);
    assert.deepEqual(await list('?program=serie-b&playbackId=serie-b-s1-e2'), ['serie-b-s1-e2'], 'filtres combinables');
    assert.deepEqual(await list('?program=inconnu'), []);
    assert.ok((await list('')).length >= 4, 'sans filtre : tout');
    assert.equal((await call('GET', '/api/admin/jobs?program=Mauvais_ID', undefined, adminCookie)).status, 400);
    assert.equal((await call('GET', '/api/admin/jobs?playbackId=a%25b', undefined, adminCookie)).status, 400);
    const first = (await json(await call('GET', '/api/admin/jobs?program=serie-b', undefined, adminCookie))).jobs[0];
    assert.equal(first.programSlug, 'serie-b', 'le programme figure dans la réponse');
  });
});
