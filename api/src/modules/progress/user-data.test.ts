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
import { isCompleted } from './service.ts';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let app: Hono<AppEnv>;
let available = true;
let alice = '';
let bob = '';
let adminCookie = '';

const send = (method: string, path: string, body?: unknown, cookie?: string, extra: Record<string, string> = {}) =>
  app.request(path, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), ...extra },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
const cookieOf = (response: Response) => (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

async function signUp(email: string): Promise<string> {
  const response = await send('POST', '/api/auth/register', { email, password: 'Un très bon mot de passe' });
  assert.equal(response.status, 201);
  return cookieOf(response);
}

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
  });

  // Un film de 2 heures (7 200 s) enregistré en base : source d'autorité pour la durée.
  await registerAsset(sql, {
    playbackId: 'long-film', programSlug: 'long-film', kind: 'film', title: 'Long film', storagePath: 'long-film',
    durationSeconds: 7200, sourceWidth: 1920, sourceHeight: 1080, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: true,
  });
  alice = await signUp('alice@mail.fr');
  bob = await signUp('bob@mail.fr');
  await insertUser(sql, { id: randomUUID(), email: 'root@origin.test', passwordHash: await hashPassword('Mot de passe administrateur 1'), displayName: null, role: 'admin' });
  adminCookie = cookieOf(await send('POST', '/api/auth/login', { email: 'root@origin.test', password: 'Mot de passe administrateur 1' }));
});

after(async () => {
  if (!available) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

describe('règle de fin de lecture', () => {
  it('termine à 95 % ou à moins de 30 s de la fin', () => {
    assert.equal(isCompleted(100, 7200), false);
    assert.equal(isCompleted(6840, 7200), true);   // 95 %
    assert.equal(isCompleted(7175, 7200), true);   // 25 s de la fin
    assert.equal(isCompleted(7100, 7200), true);   // 98,6 %
    assert.equal(isCompleted(6000, 7200), false);  // 83 %
    assert.equal(isCompleted(10, 15), false);      // contenu court : seule la règle des 95 % s'applique
    assert.equal(isCompleted(5, null), false);
  });
});

describe('reprise de lecture', () => {
  it('exige un compte', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    assert.equal((await send('PUT', '/api/me/progress/long-film', { positionSeconds: 100 })).status, 401);
    assert.equal((await send('GET', '/api/me/continue-watching')).status, 401);
  });

  it('enregistre la position et la rend à la reprise (film de 2 h)', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    assert.equal((await send('GET', '/api/me/progress/long-film', undefined, alice)).status, 404, 'jamais commencé');
    const saved = await send('PUT', '/api/me/progress/long-film', { positionSeconds: 3725.44, durationSeconds: 1 }, alice);
    assert.equal(saved.status, 200);
    const body = (await saved.json()) as { positionSeconds: number; durationSeconds: number; completed: boolean };
    assert.equal(body.positionSeconds, 3725.4);
    assert.equal(body.durationSeconds, 7200, 'la durée vient du média en base, pas du navigateur');
    assert.equal(body.completed, false);
    const resumed = (await (await send('GET', '/api/me/progress/long-film', undefined, alice)).json()) as { positionSeconds: number };
    assert.equal(resumed.positionSeconds, 3725.4);
  });

  it('isole les comptes : Bob ne voit pas la progression d’Alice', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    assert.equal((await send('GET', '/api/me/progress/long-film', undefined, bob)).status, 404);
    const list = (await (await send('GET', '/api/me/continue-watching', undefined, bob)).json()) as { items: unknown[] };
    assert.equal(list.items.length, 0);
  });

  it('liste « Reprendre » avec titre et ratio, puis retire un contenu terminé', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const list = (await (await send('GET', '/api/me/continue-watching', undefined, alice)).json()) as {
      items: { playbackId: string; title: string; progressRatio: number }[];
    };
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0]?.title, 'Long film');
    assert.equal(list.items[0]?.progressRatio, 0.517);
    await send('PUT', '/api/me/progress/long-film', { positionSeconds: 7190 }, alice);
    const after = (await (await send('GET', '/api/me/continue-watching', undefined, alice)).json()) as { items: unknown[] };
    assert.equal(after.items.length, 0, 'terminé : il quitte « Reprendre »');
  });

  it('ignore un envoi arrivé en retard et borne la position', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const base = Date.now() + 10_000; // postérieur aux envois précédents du test
    await send('PUT', '/api/me/progress/long-film', { positionSeconds: 2000, sentAt: base + 2000 }, alice);
    await send('PUT', '/api/me/progress/long-film', { positionSeconds: 900, sentAt: base + 1000 }, alice); // plus ancien
    const current = (await (await send('GET', '/api/me/progress/long-film', undefined, alice)).json()) as { positionSeconds: number };
    assert.equal(current.positionSeconds, 2000);
    const beyond = (await (await send('PUT', '/api/me/progress/long-film', { positionSeconds: 80_000, sentAt: base + 3000 }, alice)).json()) as { positionSeconds: number };
    assert.equal(beyond.positionSeconds, 7200, 'jamais au-delà de la durée');
  });

  it('refuse les entrées invalides', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    assert.equal((await send('PUT', '/api/me/progress/long-film', { positionSeconds: -5 }, alice)).status, 400);
    assert.equal((await send('PUT', '/api/me/progress/long-film', { positionSeconds: 'abc' }, alice)).status, 400);
    assert.equal((await send('PUT', '/api/me/progress/Mauvais_ID', { positionSeconds: 5 }, alice)).status, 400);
  });

  it('supprime une progression', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    assert.equal((await send('DELETE', '/api/me/progress/long-film', undefined, alice)).status, 204);
    assert.equal((await send('GET', '/api/me/progress/long-film', undefined, alice)).status, 404);
  });
});

describe('ma liste', () => {
  it('ajoute sans doublon, liste, retire, et isole les comptes', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    assert.equal((await send('PUT', '/api/me/list/deux-fois-oui', undefined, alice)).status, 204);
    assert.equal((await send('PUT', '/api/me/list/deux-fois-oui', undefined, alice)).status, 204, 'idempotent');
    assert.equal((await send('PUT', '/api/me/list/tout-recommencer', undefined, alice)).status, 204);
    const list = (await (await send('GET', '/api/me/list', undefined, alice)).json()) as { items: { slug: string }[] };
    assert.deepEqual(list.items.map(item => item.slug), ['tout-recommencer', 'deux-fois-oui']);
    assert.equal(((await (await send('GET', '/api/me/list', undefined, bob)).json()) as { items: unknown[] }).items.length, 0);
    assert.equal((await send('DELETE', '/api/me/list/deux-fois-oui', undefined, alice)).status, 204);
    assert.equal(((await (await send('GET', '/api/me/list', undefined, alice)).json()) as { items: unknown[] }).items.length, 1);
  });

  it('exige un compte et un identifiant valide', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    assert.equal((await send('GET', '/api/me/list')).status, 401);
    assert.equal((await send('PUT', '/api/me/list/Mauvais_Id', undefined, alice)).status, 400);
  });
});

describe('mesure de lecture', () => {
  const report = (overrides: Record<string, unknown> = {}) => ({
    id: randomUUID(), playbackId: 'long-film', startupMs: 800, rebufferCount: 0, rebufferMs: 0, watchSeconds: 60,
    levelSeconds: { '720': 60 }, maxHeight: 720, device: 'desktop', browser: 'Chrome', engine: 'hlsjs', connection: '4g', ...overrides,
  });

  it('accepte un rapport sans compte, en text/plain (envoi à la fermeture de page)', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const response = await send('POST', '/api/playback-sessions', JSON.stringify(report()), undefined, { 'content-type': 'text/plain' });
    assert.equal(response.status, 204);
  });

  it('refuse un rapport invalide', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    assert.equal((await send('POST', '/api/playback-sessions', report({ id: 'pas-un-uuid' }))).status, 400);
    assert.equal((await send('POST', '/api/playback-sessions', report({ device: 'frigo' }))).status, 400);
    assert.equal((await send('POST', '/api/playback-sessions', '{pas du json')).status, 400);
  });

  it('garde le maximum des compteurs quand les envois arrivent dans le désordre', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const id = randomUUID();
    await send('POST', '/api/playback-sessions', report({ id, watchSeconds: 120, rebufferCount: 2, rebufferMs: 3000 }));
    await send('POST', '/api/playback-sessions', report({ id, watchSeconds: 30, rebufferCount: 1, rebufferMs: 1000 })); // plus ancien
    const [row] = await sql<{ watch_seconds: string; rebuffer_count: number }[]>`SELECT watch_seconds, rebuffer_count FROM playback_sessions WHERE id = ${id}`;
    assert.equal(Number(row?.watch_seconds), 120);
    assert.equal(row?.rebuffer_count, 2);
  });

  it('réserve la synthèse aux administrateurs et calcule les objectifs', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    assert.equal((await send('GET', '/api/admin/metrics/playback')).status, 401);
    assert.equal((await send('GET', '/api/admin/metrics/playback', undefined, alice)).status, 403);
    const response = await send('GET', '/api/admin/metrics/playback?days=1', undefined, adminCookie);
    assert.equal(response.status, 200);
    const summary = (await response.json()) as { sessions: number; startupMs: { p75: number }; meetsTargets: { startup: boolean } };
    assert.ok(summary.sessions >= 2);
    assert.equal(summary.meetsTargets.startup, true, 'démarrage à 800 ms : sous l’objectif de 2 s');
  });
});

describe('suppression de compte', () => {
  it('supprime aussi la progression et la liste du compte', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const carol = await signUp('carol@mail.fr');
    await send('PUT', '/api/me/progress/long-film', { positionSeconds: 500 }, carol);
    await send('PUT', '/api/me/list/deux-fois-oui', undefined, carol);
    assert.equal((await send('POST', '/api/me/delete', { password: 'Un très bon mot de passe' }, carol)).status, 204);
    const [progress] = await sql<{ count: string }[]>`SELECT count(*)::text FROM watch_progress wp JOIN users u ON u.id = wp.user_id WHERE u.email = 'carol@mail.fr'`;
    assert.equal(progress?.count, '0');
    const [list] = await sql<{ count: string }[]>`SELECT count(*)::text FROM my_list ml JOIN users u ON u.id = ml.user_id WHERE u.email = 'carol@mail.fr'`;
    assert.equal(list?.count, '0');
  });
});
