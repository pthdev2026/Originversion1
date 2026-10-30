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
import { purgeExpired } from '../ops/maintenance.repository.ts';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let app: Hono<AppEnv>;
let available = true;
let adminCookie = '';
let viewerCookie = '';
const mails: { to: string; subject: string; text: string }[] = [];
const call = (method: string, path: string, body?: unknown, cookie?: string) =>
  app.request(path, { method, headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const json = async (response: Response) => (await response.json()) as any;
const valid = { name: 'Marie Dupont', email: 'Marie@Mail.fr', topic: 'playback', message: 'La vidéo se fige au bout de dix minutes sur mon téléphone.' };

before(async () => {
  admin = connect(databaseUrl, { max: 1 });
  try { await admin`SELECT 1`; } catch { available = false; await admin.end(); return; }
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = connect(databaseUrl, { max: 4, connection: { search_path: schema } });
  await migrate(sql);
  const logger = pino({ level: 'silent' });
  const mailer = { async send(message: { to: string; subject: string; text: string }) { mails.push(message); } };
  const identity = createIdentityService({ sql, logger, mailer, config: { registrationMode: 'open', sessionTtlSeconds: 3600, publicAppUrl: 'http://localhost:3210' } });
  app = createApp({
    sql, logger, mailer, storage: new StorageLayout('/tmp/origin-contact-unused'), supportEmail: 'aide@origin.test', contactPerHour: 12,
    mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
    rateLimits: { apiPerMinute: 100_000, mediaPerMinute: 100_000, authPerMinute: 100_000, metricsPerMinute: 100_000 },
    identity, cookieSecure: false, sessionTtlSeconds: 3600, playbackRequiresLogin: false, uploadMaxBytes: 1024 ** 3, encodePreset: 'ultrafast',
  });
  await insertUser(sql, { id: randomUUID(), email: 'root@origin.test', passwordHash: await hashPassword('Mot de passe administrateur 1'), displayName: null, role: 'admin' });
  adminCookie = ((await call('POST', '/api/auth/login', { email: 'root@origin.test', password: 'Mot de passe administrateur 1' })).headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  viewerCookie = ((await call('POST', '/api/auth/register', { email: 'viewer@mail.fr', password: 'Un très bon mot de passe' })).headers.get('set-cookie') ?? '').split(';')[0] ?? '';
});

after(async () => {
  if (!available) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

describe('formulaire « Nous contacter »', () => {
  it('accepte un message (sans compte), le conserve et prévient l’équipe', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const response = await call('POST', '/api/contact', valid);
    assert.equal(response.status, 202);
    assert.match((await json(response)).message, /Merci/);
    await new Promise(resolve => setTimeout(resolve, 25));
    const support = mails.filter(m => m.to === 'aide@origin.test');
    assert.equal(support.length, 1);
    assert.match(support[0]?.text ?? '', /Marie Dupont <Marie@Mail\.fr>/);
    const stored = (await json(await call('GET', '/api/admin/contact', undefined, adminCookie))).messages;
    assert.equal(stored.length, 1);
    assert.deepEqual([stored[0].email, stored[0].topic, stored[0].status, stored[0].hasAccount], ['marie@mail.fr', 'playback', 'new', false]);
  });

  it('rattache le message au compte s’il est connecté', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await call('POST', '/api/contact', { ...valid, message: 'Je voudrais changer mon adresse e-mail, que faire ?' }, viewerCookie);
    const messages = (await json(await call('GET', '/api/admin/contact?status=new', undefined, adminCookie))).messages;
    assert.equal(messages.filter((m: any) => m.hasAccount).length, 1);
  });

  it('valide strictement', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    for (const body of [{}, { ...valid, name: '' }, { ...valid, email: 'pas-un-email' }, { ...valid, message: 'court' }, { ...valid, message: 'x'.repeat(4001) }, { ...valid, topic: 'inconnu' }, { ...valid, role: 'admin' }]) {
      assert.equal((await call('POST', '/api/contact', body)).status, 400, JSON.stringify(body).slice(0, 60));
    }
  });

  it('piège à robots : champ caché rempli = réponse identique, rien de conservé ni envoyé', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const before = (await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM contact_messages`)[0]?.n;
    const supportCount = () => mails.filter(m => m.to === 'aide@origin.test').length;
    const mailsBefore = supportCount();
    const response = await call('POST', '/api/contact', { ...valid, website: 'http://spam.example' });
    assert.equal(response.status, 202);
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal((await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM contact_messages`)[0]?.n, before);
    assert.equal(supportCount(), mailsBefore);
  });

  it('administration : réservée, filtrable, « traité » une seule fois', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await call('GET', '/api/admin/contact')).status, 401);
    assert.equal((await call('GET', '/api/admin/contact', undefined, viewerCookie)).status, 403);
    assert.equal((await call('GET', '/api/admin/contact?status=autre', undefined, adminCookie)).status, 400);
    const first = (await json(await call('GET', '/api/admin/contact', undefined, adminCookie))).messages[0];
    assert.equal((await call('POST', `/api/admin/contact/${first.id}/handled`, undefined, adminCookie)).status, 204);
    assert.equal((await call('POST', `/api/admin/contact/${first.id}/handled`, undefined, adminCookie)).status, 404, 'déjà traité');
    assert.equal((await json(await call('GET', '/api/admin/contact?status=handled', undefined, adminCookie))).messages.length, 1);
    assert.equal((await call('POST', '/api/admin/contact/pas-un-id/handled', undefined, adminCookie)).status, 400);
  });

  it('limite d’envoi par heure ; les anciens messages sont purgés', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await call('POST', '/api/contact', valid)).status);
    assert.ok(statuses.includes(429), `limite attendue, reçu ${statuses.join(',')}`);
    await sql`UPDATE contact_messages SET created_at = now() - interval '400 days' WHERE id = (SELECT id FROM contact_messages ORDER BY created_at LIMIT 1)`;
    const report = await purgeExpired(sql, { telemetryDays: 180, auditDays: 365 });
    assert.equal(report.audit, 1, 'le message de plus d’un an est supprimé');
  });
});

describe('journal des modifications du catalogue', () => {
  it('enregistre qui a modifié quoi, réservé à l’administration', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const origin = { origin: 'http://localhost:3210' };
    void origin;
    assert.equal((await call('GET', '/api/admin/audit', undefined, viewerCookie)).status, 403);
    assert.equal((await call('PUT', '/api/admin/themes/drame', { title: 'Drame' }, adminCookie)).status, 204);
    assert.equal((await call('PUT', '/api/admin/themes/drame', { title: '' }, adminCookie)).status, 400);
    assert.equal((await call('DELETE', '/api/admin/themes/drame', undefined, adminCookie)).status, 204);
    const { entries } = await json(await call('GET', '/api/admin/audit', undefined, adminCookie));
    assert.deepEqual(entries.map((e: any) => e.event), ['catalog.theme.delete', 'catalog.theme.save']);
    assert.equal(entries[0].by, 'root@origin.test');
    assert.deepEqual(entries[0].details, { slug: 'drame' });
  });
});
