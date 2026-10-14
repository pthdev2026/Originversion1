import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
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
import { registerAsset, type IngestInput } from '../ingest/repository.ts';
import { decideIdent, parsePlaybackId, type IdentInput } from './ident-policy.ts';

const base: IdentInput = {
  policy: 'title', identAvailable: true, isBrandAsset: false, hasProgressInTitle: false, hasProgressInSeason: false,
  resumeSeconds: 0, clientSeen: false, autoplayNext: false,
};

describe('politique de l’ident (règles pures)', () => {
  it('montre l’ident à la première rencontre avec un titre', () => {
    assert.deepEqual(decideIdent(base), { show: true, reason: 'first_view' });
  });

  it('ne le répète pas une fois le titre commencé, ni si le navigateur l’a déjà joué', () => {
    assert.deepEqual(decideIdent({ ...base, hasProgressInTitle: true }), { show: false, reason: 'already_seen' });
    assert.deepEqual(decideIdent({ ...base, clientSeen: true }), { show: false, reason: 'already_seen' });
  });

  it('ne le joue ni à la reprise, ni à l’enchaînement automatique', () => {
    assert.deepEqual(decideIdent({ ...base, resumeSeconds: 600 }), { show: false, reason: 'resume' });
    assert.deepEqual(decideIdent({ ...base, resumeSeconds: 4 }), { show: true, reason: 'first_view' }, 'moins de 10 s : pas une vraie reprise');
    assert.deepEqual(decideIdent({ ...base, autoplayNext: true }), { show: false, reason: 'autoplay_next' });
  });

  it('respecte la politique « saison », « toujours » et « off »', () => {
    assert.equal(decideIdent({ ...base, policy: 'season', hasProgressInTitle: true, hasProgressInSeason: false }).show, true, 'nouvelle saison');
    assert.equal(decideIdent({ ...base, policy: 'season', hasProgressInTitle: true, hasProgressInSeason: true }).show, false);
    assert.equal(decideIdent({ ...base, policy: 'always', hasProgressInTitle: true }).show, true);
    assert.deepEqual(decideIdent({ ...base, policy: 'off' }), { show: false, reason: 'policy_off' });
  });

  it('n’affiche rien si l’ident n’est pas publié, ou s’il s’agit de l’ident lui-même', () => {
    assert.deepEqual(decideIdent({ ...base, identAvailable: false }), { show: false, reason: 'unavailable' });
    assert.deepEqual(decideIdent({ ...base, isBrandAsset: true }), { show: false, reason: 'is_brand_asset' });
  });

  it('lit la saison dans l’identifiant de lecture', () => {
    assert.deepEqual(parsePlaybackId('les-secrets-s2-e5'), { seasonPrefix: 'les-secrets-s2-' });
    assert.deepEqual(parsePlaybackId('tout-recommencer'), { seasonPrefix: null });
  });
});

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let available = true;

const asset = (playbackId: string, programSlug: string, overrides: Partial<IngestInput> = {}): IngestInput => ({
  playbackId, programSlug, kind: 'film', title: playbackId, storagePath: playbackId, durationSeconds: 3600,
  sourceWidth: 1920, sourceHeight: 1080, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: true, ...overrides,
});

function makeApp(identOverrides: Partial<{ policy: 'title' | 'season' | 'always' | 'off'; playbackId: string }> = {}): Hono<AppEnv> {
  const logger = pino({ level: 'silent' });
  const identity = createIdentityService({
    sql, logger, mailer: { async send() {} },
    config: { registrationMode: 'open', sessionTtlSeconds: 3600, publicAppUrl: 'http://localhost:3210' },
  });
  return createApp({
    sql, logger, storage: new StorageLayout('/tmp/origin-ident-unused'),
    mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
    rateLimits: { apiPerMinute: 10_000, mediaPerMinute: 10_000, authPerMinute: 10_000, metricsPerMinute: 10_000 },
    identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: false, uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
    ident: { policy: 'title', playbackId: 'origin-ident', skippableAfterSeconds: 2, ...identOverrides },
  });
}

const json = (body: unknown, cookie?: string) => ({
  method: 'POST' as const, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
});
const cookieOf = (response: Response) => (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

before(async () => {
  admin = connect(databaseUrl, { max: 1 });
  try { await admin`SELECT 1`; } catch { available = false; await admin.end(); return; }
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = connect(databaseUrl, { max: 4, connection: { search_path: schema } });
  await migrate(sql);
  await registerAsset(sql, asset('origin-ident', 'origin-brand', { kind: 'brand', title: 'Ident ORIGIN', durationSeconds: 6 }));
  await registerAsset(sql, asset('mon-film', 'mon-film'));
  for (const id of ['ma-serie-s1-e1', 'ma-serie-s1-e2', 'ma-serie-s2-e1']) await registerAsset(sql, asset(id, 'ma-serie', { kind: 'serie' }));
});

after(async () => {
  if (!available) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

describe('ident de marque dans la réponse de lecture', () => {
  type Playback = { ident: { show: boolean; reason: string; manifestUrl: string | null; durationSeconds: number | null; skippableAfterSeconds: number | null } };
  const playback = async (app: Hono<AppEnv>, id: string, query = '', cookie?: string): Promise<Playback> =>
    (await (await app.request(`/api/programs/${id}/playback${query}`, cookie ? { headers: { cookie } } : {})).json()) as Playback;

  it('le visiteur anonyme voit l’ident, sauf si son navigateur l’a déjà joué', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    const first = await playback(app, 'mon-film');
    assert.equal(first.ident.show, true);
    assert.equal(first.ident.reason, 'first_view');
    assert.match(first.ident.manifestUrl ?? '', /origin-ident\/master\.m3u8$/);
    assert.equal(first.ident.durationSeconds, 6);
    assert.equal(first.ident.skippableAfterSeconds, 2);
    const seen = await playback(app, 'mon-film', '?identSeen=1');
    assert.equal(seen.ident.show, false);
    assert.equal(seen.ident.manifestUrl, null);
  });

  it('le compte voit l’ident une seule fois par titre, puis plus (film et série)', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    const cookie = cookieOf(await app.request('/api/auth/register', json({ email: 'ident@mail.fr', password: 'Un très bon mot de passe' })));

    assert.equal((await playback(app, 'ma-serie-s1-e1', '', cookie)).ident.show, true);
    await app.request('/api/me/progress/ma-serie-s1-e1', { ...json({ positionSeconds: 120 }, cookie), method: 'PUT' });

    const resume = await playback(app, 'ma-serie-s1-e1', '', cookie);
    assert.equal(resume.ident.reason, 'resume');
    assert.equal((await playback(app, 'ma-serie-s1-e2', '', cookie)).ident.show, false, 'autre épisode de la même série');
    assert.equal((await playback(app, 'ma-serie-s2-e1', '', cookie)).ident.show, false, 'politique « title » : pas à chaque saison');
    assert.equal((await playback(app, 'mon-film', '', cookie)).ident.show, true, 'autre titre : première fois');
  });

  it('politique « season » : l’ident revient à la première lecture d’une nouvelle saison', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp({ policy: 'season' });
    const cookie = cookieOf(await app.request('/api/auth/login', json({ email: 'ident@mail.fr', password: 'Un très bon mot de passe' })));
    assert.equal((await playback(app, 'ma-serie-s1-e2', '', cookie)).ident.show, false);
    assert.equal((await playback(app, 'ma-serie-s2-e1', '', cookie)).ident.show, true);
  });

  it('jamais à l’enchaînement automatique, jamais pour l’ident lui-même, jamais en politique « off »', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    assert.equal((await playback(app, 'mon-film', '?autoplay=1')).ident.reason, 'autoplay_next');
    assert.equal((await playback(app, 'origin-ident')).ident.reason, 'is_brand_asset');
    assert.equal((await playback(makeApp({ policy: 'off' }), 'mon-film')).ident.reason, 'policy_off');
    assert.equal((await playback(makeApp({ playbackId: 'absent' }), 'mon-film')).ident.reason, 'unavailable');
  });

  it('l’ident n’apparaît jamais dans le catalogue', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const body = (await (await makeApp().request('/api/programs')).json()) as { programs: { slug: string }[] };
    assert.ok(body.programs.some(program => program.slug === 'mon-film'));
    assert.equal(body.programs.some(program => program.slug === 'origin-brand'), false);
  });
});
