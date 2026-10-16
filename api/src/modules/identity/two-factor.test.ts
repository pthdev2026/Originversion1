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
import { hashPassword } from './password.ts';
import { insertUser } from './repository.ts';
import { createIdentityService } from './service.ts';
import { base32Decode, stepAt, totpAtStep } from './totp.ts';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let app: Hono<AppEnv>;
let available = true;

const PASSWORD = 'Un très bon mot de passe';
const post = (path: string, body: unknown, cookie?: string) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (response: Response) => (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
const codeFor = (secret: string, offset = 0) => totpAtStep(base32Decode(secret), stepAt(Date.now()) + offset);

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
    identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: false, requireAdminTwoFactor: true,
    uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
  });
  await insertUser(sql, { id: randomUUID(), email: 'root@origin.test', passwordHash: await hashPassword(PASSWORD), displayName: null, role: 'admin', emailVerified: true });
});

after(async () => {
  if (!available) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

describe('double authentification', () => {
  it('enrôlement, connexion avec code, rejeu refusé, codes de secours', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const reg = await post('/api/auth/register', { email: 'marie@mail.fr', password: PASSWORD });
    const cookie = cookieOf(reg);

    // Setup puis activation.
    const setup = (await (await post('/api/me/2fa/setup', {}, cookie)).json()) as { secret: string; otpauthUrl: string };
    assert.match(setup.secret, /^[A-Z2-7]{32}$/);
    assert.match(setup.otpauthUrl, /^otpauth:\/\/totp\//);
    assert.equal((await post('/api/me/2fa/enable', { code: '000000' }, cookie)).status, 400, 'mauvais code');
    const enabled = await post('/api/me/2fa/enable', { code: codeFor(setup.secret) }, cookie);
    assert.equal(enabled.status, 200);
    const { recoveryCodes } = (await enabled.json()) as { recoveryCodes: string[] };
    assert.equal(recoveryCodes.length, 8);
    assert.equal(((await (await app.request('/api/me', { headers: { cookie } })).json()) as { user: { twoFactorEnabled: boolean } }).user.twoFactorEnabled, true);
    assert.equal((await post('/api/me/2fa/setup', {}, cookie)).status, 409, 'déjà activée');

    // Connexion : mot de passe seul ne suffit plus.
    const noCode = await post('/api/auth/login', { email: 'marie@mail.fr', password: PASSWORD });
    assert.equal(noCode.status, 401);
    assert.equal(((await noCode.json()) as { error: string }).error, 'two_factor_required');
    assert.equal((await post('/api/auth/login', { email: 'marie@mail.fr', password: PASSWORD, code: '123456' })).status, 401);

    // Le code de l'étape suivante est accepté (± 1 pas) — et ne peut servir qu'une fois.
    const good = codeFor(setup.secret, 1);
    const ok = await post('/api/auth/login', { email: 'marie@mail.fr', password: PASSWORD, code: good });
    assert.equal(ok.status, 200);
    assert.equal((await post('/api/auth/login', { email: 'marie@mail.fr', password: PASSWORD, code: good })).status, 401, 'rejeu refusé');

    // Code de secours : usage unique.
    const recovery = recoveryCodes[0] as string;
    assert.equal((await post('/api/auth/login', { email: 'marie@mail.fr', password: PASSWORD, code: recovery })).status, 200);
    assert.equal((await post('/api/auth/login', { email: 'marie@mail.fr', password: PASSWORD, code: recovery })).status, 401);
  });

  it('désactivation : mot de passe ET code ; le secret n’est jamais en clair en base', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const reg = await post('/api/auth/register', { email: 'paul@mail.fr', password: PASSWORD });
    const cookie = cookieOf(reg);
    const setup = (await (await post('/api/me/2fa/setup', {}, cookie)).json()) as { secret: string };
    await post('/api/me/2fa/enable', { code: codeFor(setup.secret) }, cookie);
    const [row] = await sql<{ secret_enc: string }[]>`SELECT secret_enc FROM user_totp t JOIN users u ON u.id = t.user_id WHERE u.email = 'paul@mail.fr'`;
    assert.ok(row && !row.secret_enc.includes(setup.secret));

    assert.equal((await post('/api/me/2fa/disable', { password: 'faux mot de passe', code: codeFor(setup.secret, 1) }, cookie)).status, 401);
    assert.equal((await post('/api/me/2fa/disable', { password: PASSWORD, code: '000000' }, cookie)).status, 401);
    const off = await app.request('/api/me/2fa/disable', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ password: PASSWORD, code: codeFor(setup.secret, 1) }),
    });
    assert.equal(off.status, 204);
    assert.equal((await post('/api/auth/login', { email: 'paul@mail.fr', password: PASSWORD })).status, 200, 'plus de code requis');
  });

  it('trop de codes faux verrouillent le compte', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const reg = await post('/api/auth/register', { email: 'lea@mail.fr', password: PASSWORD });
    const cookie = cookieOf(reg);
    const setup = (await (await post('/api/me/2fa/setup', {}, cookie)).json()) as { secret: string };
    await post('/api/me/2fa/enable', { code: codeFor(setup.secret) }, cookie);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await post('/api/auth/login', { email: 'lea@mail.fr', password: PASSWORD, code: '999999' })).status);
    assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
  });

  it('administration : refusée à un administrateur sans double authentification (si exigé)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const login = await post('/api/auth/login', { email: 'root@origin.test', password: PASSWORD });
    assert.equal(login.status, 200);
    const cookie = cookieOf(login);
    const denied = await app.request('/api/admin/catalog', { headers: { cookie } });
    assert.equal(denied.status, 403);
    assert.equal(((await denied.json()) as { error: string }).error, 'two_factor_required');

    // Il peut l'activer, puis se reconnecter avec un code et accéder à l'administration.
    const setup = (await (await post('/api/me/2fa/setup', {}, cookie)).json()) as { secret: string };
    assert.equal((await post('/api/me/2fa/enable', { code: codeFor(setup.secret) }, cookie)).status, 200);
    const again = await post('/api/auth/login', { email: 'root@origin.test', password: PASSWORD, code: codeFor(setup.secret, 1) });
    assert.equal(again.status, 200);
    assert.equal((await app.request('/api/admin/catalog', { headers: { cookie: cookieOf(again) } })).status, 200);
  });
});
