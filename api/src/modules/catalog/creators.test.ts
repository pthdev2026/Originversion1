/** Univers de créateur : page dédiée, chapitres, contenus classés par rubrique, annonce de direct. */
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
import { registerAsset } from '../ingest/repository.ts';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let app: Hono<AppEnv>;
let available = true;
let adminCookie = '';
let viewerCookie = '';

const call = (method: string, path: string, body?: unknown, cookie?: string) =>
  app.request(path, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const json = async (response: Response) => (await response.json()) as any;

const universe = {
  name: 'Apôtre Yvan', alias: 'Apôtre', domain: 'Prédication', accent: '96 140 255', published: true, position: 1,
  tagline: 'Des messages pour une vie transformée.',
  chapters: [{ mark: 'I', title: 'L’appel', text: 'Le jour où une Parole devient une mission.' }, { mark: 'II', title: 'La Parole', text: 'Des messages clairs.' }],
  themes: ['Prédication', 'Foi'], ambience: 'ember', isProvisional: false,
};

before(async () => {
  admin = connect(databaseUrl, { max: 1 });
  try { await admin`SELECT 1`; } catch { available = false; await admin.end(); return; }
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = connect(databaseUrl, { max: 4, connection: { search_path: schema } });
  await migrate(sql);
  const logger = pino({ level: 'silent' });
  const identity = createIdentityService({ sql, logger, mailer: { async send() {} }, config: { registrationMode: 'open', sessionTtlSeconds: 3600, publicAppUrl: 'http://localhost:3210' } });
  app = createApp({
    sql, logger, storage: new StorageLayout('/tmp/origin-creators-unused'),
    mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
    rateLimits: { apiPerMinute: 100_000, mediaPerMinute: 100_000, authPerMinute: 100_000, metricsPerMinute: 100_000 },
    identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: false, uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
  });
  await insertUser(sql, { id: randomUUID(), email: 'root@origin.test', passwordHash: await hashPassword('Mot de passe administrateur 1'), displayName: null, role: 'admin' });
  adminCookie = ((await call('POST', '/api/auth/login', { email: 'root@origin.test', password: 'Mot de passe administrateur 1' })).headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  viewerCookie = ((await call('POST', '/api/auth/register', { email: 'viewer@mail.fr', password: 'Un très bon mot de passe' })).headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  for (const [slug, title, kind, published] of [
    ['msg-foi', 'La foi dans l’incertitude', 'film', true], ['conf-faveur', 'Vivre dans la faveur', 'film', true],
    ['serie-autorite', 'L’autorité du croyant', 'serie', true], ['direct-nuit', 'Nuit de réveil', 'film', true], ['brouillon', 'Pas encore', 'film', false],
  ] as const) {
    await call('PUT', `/api/admin/programs/${slug}`, { kind, title, published, durationLabel: '46:20' }, adminCookie);
  }
  await registerAsset(sql, {
    playbackId: 'msg-foi', programSlug: 'msg-foi', kind: 'film', title: 'x', storagePath: 'msg-foi', durationSeconds: 60,
    sourceWidth: 1280, sourceHeight: 720, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: true,
  });
});

after(async () => {
  if (!available) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

describe('administration d’un univers', () => {
  it('réservée à l’administrateur', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await call('PUT', '/api/admin/creators/yvan', universe)).status, 401);
    assert.equal((await call('PUT', '/api/admin/creators/yvan', universe, viewerCookie)).status, 403);
    assert.equal((await call('GET', '/api/admin/creators', undefined, viewerCookie)).status, 403);
    assert.equal((await call('PUT', '/api/admin/creators/yvan/contents', { contents: [] }, viewerCookie)).status, 403);
  });

  it('valide la présentation (couleur, chapitres, champs inconnus)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const put = (over: Record<string, unknown>) => call('PUT', '/api/admin/creators/yvan', { ...universe, ...over }, adminCookie);
    assert.equal((await put({ accent: '300 10 10' })).status, 400, 'composante > 255');
    assert.equal((await put({ accent: 'rouge' })).status, 400);
    assert.equal((await put({ accent: '10 10' })).status, 400);
    assert.equal((await put({ chapters: Array.from({ length: 9 }, () => ({ mark: 'I', title: 't', text: 'x' })) })).status, 400, '8 chapitres au plus');
    assert.equal((await put({ chapters: [{ mark: 'I', title: 't' }] })).status, 400, 'texte du chapitre manquant');
    assert.equal((await put({ alias: 'x'.repeat(61) })).status, 400);
    assert.equal((await put({ inconnu: 1 })).status, 400);
    assert.equal((await put({})).status, 204);
  });

  it('contenus : programmes existants, une seule « une », direct seulement pour la rubrique live, doublons refusés', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const put = (contents: unknown[]) => call('PUT', '/api/admin/creators/yvan/contents', { contents }, adminCookie);
    assert.equal((await put([{ program: 'inconnu', kind: 'message' }])).status, 400, 'programme inconnu');
    assert.equal((await put([{ program: 'msg-foi', kind: 'message' }, { program: 'msg-foi', kind: 'serie' }])).status, 400, 'doublon');
    assert.equal((await put([{ program: 'msg-foi', kind: 'message', featured: true }, { program: 'conf-faveur', kind: 'conference', featured: true }])).status, 400, 'deux « à la une »');
    assert.equal((await put([{ program: 'msg-foi', kind: 'message', liveAt: '2026-11-01T20:00:00+01:00' }])).status, 400, 'créneau hors rubrique live');
    assert.equal((await put([{ program: 'msg-foi', kind: 'live', liveAt: 'demain soir' }])).status, 400, 'date invalide');
    assert.equal((await put([{ program: 'msg-foi', kind: 'podcast' }])).status, 400, 'rubrique inconnue');
    assert.equal((await put(Array.from({ length: 101 }, (_, i) => ({ program: `p${i}`, kind: 'message' })))).status, 400, '100 au plus');
    assert.equal((await call('PUT', '/api/admin/creators/inconnu/contents', { contents: [] }, adminCookie)).status, 404);
    const [count] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM creator_contents`;
    assert.equal(count?.n, '0', 'un refus ne laisse aucune ligne');
  });
});

describe('univers public', () => {
  it('page complète : présentation, chapitres, contenus dans l’ordre, rubriques comptées, fiches de programme', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const saved = await call('PUT', '/api/admin/creators/yvan/contents', {
      contents: [
        { program: 'direct-nuit', kind: 'live', liveAt: '2026-11-01T20:00:00+01:00' },
        { program: 'msg-foi', kind: 'message', featured: true },
        { program: 'serie-autorite', kind: 'serie', episodeLabel: 'Ép. 01' },
        { program: 'conf-faveur', kind: 'conference' },
        { program: 'brouillon', kind: 'message' },
      ],
    }, adminCookie);
    assert.equal(saved.status, 204);

    const response = await call('GET', '/api/creators/yvan');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /public, max-age=30/);
    const page = await json(response);
    assert.deepEqual([page.creator.slug, page.creator.alias, page.creator.domain, page.creator.accent], ['yvan', 'Apôtre', 'Prédication', '96 140 255']);
    assert.equal(page.creator.tagline, 'Des messages pour une vie transformée.');
    assert.deepEqual(page.chapters.map((c: any) => c.mark), ['I', 'II']);
    assert.deepEqual(page.contents.map((c: any) => c.program.slug), ['direct-nuit', 'msg-foi', 'serie-autorite', 'conf-faveur'], 'ordre conservé, brouillon masqué');
    assert.deepEqual(page.kinds, [{ kind: 'message', count: 1 }, { kind: 'conference', count: 1 }, { kind: 'serie', count: 1 }, { kind: 'live', count: 1 }]);
    const live = page.contents[0];
    assert.equal(live.liveAt, '2026-11-01T19:00:00.000Z');
    assert.equal(live.program.playable, false, 'annonce de direct : rien de lisible');
    assert.equal(page.contents[1].featured, true);
    assert.equal(page.contents[1].program.playable, true, 'les fiches reflètent la lecture réelle');
    assert.equal(page.contents[2].episodeLabel, 'Ép. 01');
    assert.equal(page.contents[1].program.title, 'La foi dans l’incertitude');

    // La liste des créateurs porte aussi les nouveaux champs.
    const list = (await json(await call('GET', '/api/creators'))).creators.find((c: any) => c.slug === 'yvan');
    assert.equal(list.alias, 'Apôtre');
    assert.equal(list.accent, '96 140 255');
  });

  it('un créateur non publié ou inconnu : 404 ; l’administration le voit', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await call('PUT', '/api/admin/creators/brouillon-c', { ...universe, name: 'Brouillon', published: false }, adminCookie);
    assert.equal((await call('GET', '/api/creators/brouillon-c')).status, 404);
    assert.equal((await call('GET', '/api/creators/inconnu')).status, 404);
    assert.equal((await call('GET', '/api/creators/Mauvais_Slug')).status, 400);
    const list = (await json(await call('GET', '/api/admin/creators', undefined, adminCookie))).creators;
    assert.deepEqual(list.map((c: any) => [c.slug, c.published, c.contentCount]).sort(), [['brouillon-c', false, 0], ['yvan', true, 5]]);
  });

  it('fiche admin : aller-retour exact (document et contenus renvoyés tels quels)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const view = await json(await call('GET', '/api/admin/creators/yvan', undefined, adminCookie));
    assert.equal(view.contents.length, 5, 'le brouillon figure côté administration');
    assert.equal(view.contents[0].liveAt, '2026-11-01T19:00:00.000Z');
    assert.equal((await call('PUT', '/api/admin/creators/yvan', view.document, adminCookie)).status, 204);
    assert.equal((await call('PUT', '/api/admin/creators/yvan/contents', { contents: view.contents }, adminCookie)).status, 204);
    assert.deepEqual(await json(await call('GET', '/api/admin/creators/yvan', undefined, adminCookie)), view);
    assert.equal((await call('GET', '/api/admin/creators/inconnu', undefined, adminCookie)).status, 404);
  });

  it('supprimer un créateur ou un programme retire les contenus liés', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await call('DELETE', '/api/admin/programs/conf-faveur', undefined, adminCookie)).status, 204);
    const page = await json(await call('GET', '/api/creators/yvan'));
    assert.deepEqual(page.contents.map((c: any) => c.program.slug), ['direct-nuit', 'msg-foi', 'serie-autorite']);
    assert.equal((await call('DELETE', '/api/admin/creators/yvan', undefined, adminCookie)).status, 204);
    assert.equal((await sql`SELECT 1 FROM creator_contents`).length, 0);
  });
});
