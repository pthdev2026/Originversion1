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
import { createIdentityService } from './service.ts';
import { insertUser } from './repository.ts';
import { hashPassword } from './password.ts';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let available = true;
const sentMails: { to: string; text: string }[] = [];

function makeApp(options: { registrationMode?: 'open' | 'invite'; playbackRequiresLogin?: boolean; failingMailer?: boolean } = {}): Hono<AppEnv> {
  const logger = pino({ level: 'silent' });
  const identity = createIdentityService({
    sql,
    logger,
    mailer: { async send(message) {
      if (options.failingMailer) throw new Error('fournisseur indisponible');
      sentMails.push({ to: message.to, text: message.text });
    } },
    config: { registrationMode: options.registrationMode ?? 'open', sessionTtlSeconds: 3600, publicAppUrl: 'http://localhost:3210' },
  });
  return createApp({
    sql, logger, storage: new StorageLayout('/tmp/origin-test-unused'),
    mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
    rateLimits: { apiPerMinute: 10_000, mediaPerMinute: 10_000, authPerMinute: 10_000, metricsPerMinute: 10_000 },
    identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: options.playbackRequiresLogin ?? false,
    uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
  });
}

const json = (body: unknown, extra: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...extra },
  body: JSON.stringify(body),
});
/** Extrait « nom=valeur » du cookie de session d'une réponse. */
const cookieOf = (response: Response): string => (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

before(async () => {
  admin = connect(databaseUrl, { max: 1 });
  try { await admin`SELECT 1`; } catch { available = false; await admin.end(); return; }
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = connect(databaseUrl, { max: 4, connection: { search_path: schema } });
  await migrate(sql);
});

after(async () => {
  if (!available) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

describe('comptes', () => {
  it('inscrit, ouvre une session et expose /api/me sans fuite de secret', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    const created = await app.request('/api/auth/register', json({ email: '  Marie.Dupont@Mail.FR ', password: 'Un très bon mot de passe', displayName: 'Marie' }));
    assert.equal(created.status, 201);
    const cookie = cookieOf(created);
    assert.match(created.headers.get('set-cookie') ?? '', /HttpOnly/i);
    assert.match(created.headers.get('set-cookie') ?? '', /SameSite=Lax/i);
    const body = (await created.json()) as { user: Record<string, unknown> };
    assert.equal(body.user['email'], 'marie.dupont@mail.fr', 'adresse normalisée');
    assert.equal('passwordHash' in body.user, false);

    const me = await app.request('/api/me', { headers: { cookie } });
    assert.equal(me.status, 200);
    assert.equal(((await me.json()) as { user: { role: string } }).user.role, 'viewer');

    // Le mot de passe n'est pas stocké en clair, et le jeton de session non plus.
    const [row] = await sql<{ password_hash: string }[]>`SELECT password_hash FROM users WHERE email = 'marie.dupont@mail.fr'`;
    assert.match(row?.password_hash ?? '', /^\$argon2id\$/);
    const tokenValue = cookie.split('=')[1] ?? '';
    const stored = await sql`SELECT 1 FROM sessions WHERE token_hash = ${tokenValue}`;
    assert.equal(stored.length, 0, 'seule l’empreinte du jeton est en base');
  });

  it('refuse un doublon, un mot de passe faible et une adresse invalide', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    const duplicate = await app.request('/api/auth/register', json({ email: 'marie.dupont@mail.fr', password: 'Un autre mot de passe fort' }));
    assert.equal(duplicate.status, 409);
    const weak = await app.request('/api/auth/register', json({ email: 'x@y.fr', password: 'azerty1234' }));
    assert.equal(weak.status, 400);
    const invalid = await app.request('/api/auth/register', json({ email: 'pas-un-email', password: 'Un très bon mot de passe' }));
    assert.equal(invalid.status, 400);
    const notJson = await app.request('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{pas du json' });
    assert.equal(notJson.status, 400);
  });

  it('se connecte, se déconnecte, et la session est révoquée côté serveur', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    const login = await app.request('/api/auth/login', json({ email: 'MARIE.dupont@mail.fr', password: 'Un très bon mot de passe' }));
    assert.equal(login.status, 200);
    const cookie = cookieOf(login);
    assert.equal((await app.request('/api/me', { headers: { cookie } })).status, 200);
    assert.equal((await app.request('/api/auth/logout', { method: 'POST', headers: { cookie } })).status, 204);
    // Le cookie volé ne fonctionne plus : la session est coupée côté serveur.
    assert.equal((await app.request('/api/me', { headers: { cookie } })).status, 401);
  });

  it('donne le même message pour une adresse inconnue et un mauvais mot de passe', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    const unknown = await app.request('/api/auth/login', json({ email: 'inconnu@mail.fr', password: 'Un très bon mot de passe' }));
    const wrong = await app.request('/api/auth/login', json({ email: 'marie.dupont@mail.fr', password: 'Mauvais mot de passe 1' }));
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.deepEqual(
      ((await unknown.json()) as { message: string }).message,
      ((await wrong.json()) as { message: string }).message,
    );
  });

  it('verrouille le compte après 5 échecs', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    await app.request('/api/auth/register', json({ email: 'verrou@mail.fr', password: 'Un très bon mot de passe' }));
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await app.request('/api/auth/login', json({ email: 'verrou@mail.fr', password: 'Mauvais mot de passe 1' }))).status, 401);
    }
    // Même avec le BON mot de passe, le compte reste verrouillé.
    const blocked = await app.request('/api/auth/login', json({ email: 'verrou@mail.fr', password: 'Un très bon mot de passe' }));
    assert.equal(blocked.status, 429);
    const events = await sql<{ event: string }[]>`SELECT event FROM audit_log WHERE event = 'account_locked'`;
    assert.ok(events.length >= 1, 'le verrouillage est inscrit au journal d’audit');
  });

  it('vérification d’adresse : lien à usage unique, renvoi limité, reset vaut preuve', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    const before = sentMails.length;
    const reg = await app.request('/api/auth/register', json({ email: 'verif@mail.fr', password: 'Premier mot de passe 1' }));
    assert.equal(reg.status, 201);
    const cookie = cookieOf(reg);
    assert.equal(((await reg.json()) as { user: { emailVerified: boolean } }).user.emailVerified, false);

    await new Promise(resolve => setTimeout(resolve, 20)); // l'envoi se fait « sans attendre »
    assert.equal(sentMails.length, before + 1);
    const token = /verifier-email\?token=([\w-]+)/.exec(sentMails.at(-1)?.text ?? '')?.[1] ?? '';
    assert.ok(token.length > 20);

    // Renvoi immédiat : refusé (au plus un par minute).
    const again = await app.request('/api/me/email/verification', { method: 'POST', headers: { cookie } });
    assert.equal(again.status, 429);

    assert.equal((await app.request('/api/auth/email/verify', json({ token: 'x'.repeat(30) }))).status, 400, 'jeton inconnu');
    assert.equal((await app.request('/api/auth/email/verify', json({ token }))).status, 200);
    assert.equal((await app.request('/api/auth/email/verify', json({ token }))).status, 400, 'usage unique');
    const me = (await (await app.request('/api/me', { headers: { cookie } })).json()) as { user: { emailVerified: boolean } };
    assert.equal(me.user.emailVerified, true);
    // Déjà vérifiée : le renvoi est sans effet (202, aucun e-mail).
    const count = sentMails.length;
    assert.equal((await app.request('/api/me/email/verification', { method: 'POST', headers: { cookie } })).status, 202);
    assert.equal(sentMails.length, count);

    // Un compte non vérifié qui réinitialise son mot de passe prouve le contrôle de l'adresse.
    await app.request('/api/auth/register', json({ email: 'verif2@mail.fr', password: 'Premier mot de passe 1' }));
    await app.request('/api/auth/password/forgot', json({ email: 'verif2@mail.fr' }));
    await new Promise(resolve => setTimeout(resolve, 20));
    const resetToken = /reinitialiser\?token=([\w-]+)/.exec(sentMails.at(-1)?.text ?? '')?.[1] ?? '';
    await app.request('/api/auth/password/reset', json({ token: resetToken, password: 'Nouveau mot de passe 2' }));
    const login = await app.request('/api/auth/login', json({ email: 'verif2@mail.fr', password: 'Nouveau mot de passe 2' }));
    assert.equal(((await login.json()) as { user: { emailVerified: boolean } }).user.emailVerified, true);
  });

  it('une panne d’envoi d’e-mail ne change pas la réponse (pas de fuite sur l’existence du compte)', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp({ failingMailer: true });
    await app.request('/api/auth/register', json({ email: 'panne@mail.fr', password: 'Premier mot de passe 1' }));
    const known = await app.request('/api/auth/password/forgot', json({ email: 'panne@mail.fr' }));
    const unknown = await app.request('/api/auth/password/forgot', json({ email: 'inconnu-panne@mail.fr' }));
    assert.equal(known.status, 202);
    assert.equal(unknown.status, 202);
    assert.deepEqual(await known.json(), await unknown.json());
    await new Promise(resolve => setTimeout(resolve, 20)); // laisse l'envoi échouer sans rejet non géré
  });

  it('réinitialise le mot de passe (lien à usage unique) et coupe les sessions', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    const reg = await app.request('/api/auth/register', json({ email: 'oubli@mail.fr', password: 'Premier mot de passe 1' }));
    const oldCookie = cookieOf(reg);

    const unknown = await app.request('/api/auth/password/forgot', json({ email: 'personne@mail.fr' }));
    assert.equal(unknown.status, 202, 'même réponse pour une adresse inconnue');
    const before = sentMails.length;
    assert.equal((await app.request('/api/auth/password/forgot', json({ email: 'oubli@mail.fr' }))).status, 202);
    assert.equal(sentMails.length, before + 1);

    const token = /token=([\w-]+)/.exec(sentMails.at(-1)?.text ?? '')?.[1] ?? '';
    assert.ok(token.length > 20);
    const reset = await app.request('/api/auth/password/reset', json({ token, password: 'Nouveau mot de passe 2' }));
    assert.equal(reset.status, 200);
    assert.equal((await app.request('/api/auth/password/reset', json({ token, password: 'Encore un autre mot de passe' }))).status, 400, 'usage unique');
    assert.equal((await app.request('/api/me', { headers: { cookie: oldCookie } })).status, 401, 'ancienne session coupée');
    assert.equal((await app.request('/api/auth/login', json({ email: 'oubli@mail.fr', password: 'Nouveau mot de passe 2' }))).status, 200);
  });

  it('change le mot de passe en gardant la session courante et en coupant les autres', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    await app.request('/api/auth/register', json({ email: 'changer@mail.fr', password: 'Premier mot de passe 1' }));
    const a = cookieOf(await app.request('/api/auth/login', json({ email: 'changer@mail.fr', password: 'Premier mot de passe 1' })));
    const b = cookieOf(await app.request('/api/auth/login', json({ email: 'changer@mail.fr', password: 'Premier mot de passe 1' })));
    const wrong = await app.request('/api/me/password', json({ currentPassword: 'faux faux faux 1', newPassword: 'Nouveau mot de passe 2' }, { cookie: a }));
    assert.equal(wrong.status, 401);
    const ok = await app.request('/api/me/password', json({ currentPassword: 'Premier mot de passe 1', newPassword: 'Nouveau mot de passe 2' }, { cookie: a }));
    assert.equal(ok.status, 200);
    assert.equal((await app.request('/api/me', { headers: { cookie: a } })).status, 200, 'session courante conservée');
    assert.equal((await app.request('/api/me', { headers: { cookie: b } })).status, 401, 'autre appareil déconnecté');
  });

  it('supprime le compte (droit à l’effacement) et anonymise le journal', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    const reg = await app.request('/api/auth/register', json({ email: 'effacer@mail.fr', password: 'Un très bon mot de passe' }));
    const cookie = cookieOf(reg);
    const userId = ((await reg.json()) as { user: { id: string } }).user.id;
    assert.equal((await app.request('/api/me/delete', json({ password: 'faux' }, { cookie }))).status, 401);
    assert.equal((await app.request('/api/me/delete', json({ password: 'Un très bon mot de passe' }, { cookie }))).status, 204);
    assert.equal((await sql`SELECT 1 FROM users WHERE id = ${userId}`).length, 0);
    assert.equal((await sql`SELECT 1 FROM sessions WHERE user_id = ${userId}`).length, 0);
    assert.equal((await sql`SELECT 1 FROM audit_log WHERE user_id = ${userId}`).length, 0, 'plus aucun lien avec la personne');
  });
});

describe('invitations et accès', () => {
  it('exige un code d’invitation en mode « invite »', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const open = makeApp();
    const adminPassword = 'Mot de passe administrateur 1';
    const created = await insertUser(sql, { id: crypto.randomUUID(), email: 'admin@origin.test', passwordHash: await hashPassword(adminPassword), displayName: null, role: 'admin' });
    assert.ok(created);
    const adminCookie = cookieOf(await open.request('/api/auth/login', json({ email: 'admin@origin.test', password: adminPassword })));

    // Un spectateur ordinaire ne peut pas créer d'invitation.
    const viewer = cookieOf(await open.request('/api/auth/register', json({ email: 'simple@mail.fr', password: 'Un très bon mot de passe' })));
    assert.equal((await open.request('/api/admin/invitations', json({}, { cookie: viewer }))).status, 403);
    assert.equal((await open.request('/api/admin/invitations', json({}))).status, 401);

    const invitation = await open.request('/api/admin/invitations', json({ note: 'bêta', maxUses: 1 }, { cookie: adminCookie }));
    assert.equal(invitation.status, 201);
    const { code } = (await invitation.json()) as { code: string };

    const closed = makeApp({ registrationMode: 'invite' });
    assert.equal((await closed.request('/api/auth/register', json({ email: 'sans@mail.fr', password: 'Un très bon mot de passe' }))).status, 403);
    assert.equal((await closed.request('/api/auth/register', json({ email: 'avec@mail.fr', password: 'Un très bon mot de passe', inviteCode: code }))).status, 201);
    assert.equal((await closed.request('/api/auth/register', json({ email: 'deux@mail.fr', password: 'Un très bon mot de passe', inviteCode: code }))).status, 403, 'usage unique');
  });

  it('protège la lecture quand PLAYBACK_REQUIRES_LOGIN est actif', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp({ playbackRequiresLogin: true });
    const anonymous = await app.request('/api/programs/film-test/playback');
    assert.equal(anonymous.status, 401);
    const cookie = cookieOf(await app.request('/api/auth/login', json({ email: 'marie.dupont@mail.fr', password: 'Un très bon mot de passe' })));
    const connected = await app.request('/api/programs/film-test/playback', { headers: { cookie } });
    assert.notEqual(connected.status, 401, 'connecté : on passe l’étape d’accès (404 si le média n’existe pas)');
  });

  it('refuse les écritures venant d’un autre site (CSRF)', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const app = makeApp();
    const hostile = await app.request('/api/auth/login', json({ email: 'marie.dupont@mail.fr', password: 'Un très bon mot de passe' }, { origin: 'https://site-malveillant.example' }));
    assert.equal(hostile.status, 403);
    const trusted = await app.request('/api/auth/login', json({ email: 'marie.dupont@mail.fr', password: 'Un très bon mot de passe' }, { origin: 'http://localhost:3210' }));
    assert.equal(trusted.status, 200);
  });
});
