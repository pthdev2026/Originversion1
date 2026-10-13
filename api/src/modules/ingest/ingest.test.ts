import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import pino from 'pino';
import type { Hono } from 'hono';
import { createApp } from '../../app.ts';
import { DEV_DATABASE_URL } from '../../config/env.ts';
import { connect, type Sql } from '../../platform/database/client.ts';
import { migrate } from '../../platform/database/migrate.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { StorageLayout } from '../../platform/storage/layout.ts';
import { hashPassword } from '../identity/password.ts';
import { insertUser } from '../identity/repository.ts';
import { createIdentityService } from '../identity/service.ts';
import { cancelJob, claimNextJob, enqueueJob, getJob, heartbeat, markFailed, markSucceeded, release, retryJob, type EnqueueInput } from './jobs.repository.ts';
import { parseUploadMetadata } from './uploads.routes.ts';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
let admin: Sql;
let sql: Sql;
let storageRoot: string;
let app: Hono<AppEnv>;
let adminCookie = '';
let available = true;

const job = (playbackId: string, overrides: Partial<EnqueueInput> = {}): EnqueueInput => ({
  id: randomUUID(), playbackId, programSlug: playbackId, kind: 'film', title: playbackId, isDemo: true,
  sourcePath: `${playbackId}/original.mp4`, preset: 'ultrafast', uploadId: null, createdBy: null, ...overrides,
});
const b64 = (value: string) => Buffer.from(value).toString('base64');
const tus = (method: string, p: string, headers: Record<string, string> = {}, body?: Uint8Array) =>
  app.request(p, { method, headers: { 'tus-resumable': '1.0.0', cookie: adminCookie, ...headers }, ...(body ? { body: body as unknown as BodyInit } : {}) });

before(async () => {
  admin = connect(databaseUrl, { max: 1 });
  try { await admin`SELECT 1`; } catch { available = false; await admin.end(); return; }
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = connect(databaseUrl, { max: 6, connection: { search_path: schema } });
  await migrate(sql);
  storageRoot = await mkdtemp(path.join(tmpdir(), 'origin-ingest-'));

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
    uploadMaxBytes: 10_000_000, encodePreset: 'ultrafast',
  });
  await insertUser(sql, { id: randomUUID(), email: 'root@origin.test', passwordHash: await hashPassword('Mot de passe administrateur 1'), displayName: null, role: 'admin' });
  const login = await app.request('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'root@origin.test', password: 'Mot de passe administrateur 1' }),
  });
  adminCookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
});

after(async () => {
  if (!available) return;
  await sql.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  await rm(storageRoot, { recursive: true, force: true });
});

describe('file de tâches', () => {
  it('refuse deux tâches actives pour le même média', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    assert.ok(await enqueueJob(sql, job('doublon')));
    assert.equal(await enqueueJob(sql, job('doublon')), null);
  });

  it('deux travailleurs ne prennent jamais la même tâche', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    await enqueueJob(sql, job('a-concurrence'));
    await enqueueJob(sql, job('b-concurrence'));
    const [first, second, third] = await Promise.all([
      claimNextJob(sql, 'w1', 60), claimNextJob(sql, 'w2', 60), claimNextJob(sql, 'w3', 60),
    ]);
    const claimed = [first, second, third].filter(Boolean);
    const ids = new Set(claimed.map(item => item?.id));
    assert.equal(ids.size, claimed.length, 'aucune tâche réservée deux fois');
    assert.ok(claimed.length >= 2);
  });

  it('reprend une tâche dont le travailleur a disparu (bail expiré)', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const created = await enqueueJob(sql, job('bail-expire'));
    await sql`UPDATE media_jobs SET status = 'queued' WHERE status = 'queued' AND playback_id <> 'bail-expire'`; // laisse les autres en file
    // On vide la file des autres tâches pour isoler le cas.
    await sql`UPDATE media_jobs SET status = 'canceled' WHERE playback_id <> 'bail-expire' AND status IN ('queued', 'running')`;
    const first = await claimNextJob(sql, 'mort', 60);
    assert.equal(first?.id, created?.id);
    assert.equal(await claimNextJob(sql, 'autre', 60), null, 'bail encore valide : personne d’autre ne la prend');
    await sql`UPDATE media_jobs SET locked_until = now() - interval '1 minute' WHERE id = ${created?.id ?? ''}`;
    const second = await claimNextJob(sql, 'vivant', 60);
    assert.equal(second?.id, created?.id);
    assert.equal(second?.attempts, 2);
  });

  it('conserve les points de reprise et la progression via le renouvellement du bail', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const created = await enqueueJob(sql, job('points-de-reprise'));
    await sql`UPDATE media_jobs SET status = 'canceled' WHERE playback_id <> 'points-de-reprise' AND status IN ('queued', 'running')`;
    const claimed = await claimNextJob(sql, 'w', 60);
    assert.equal(claimed?.id, created?.id);
    assert.equal(await heartbeat(sql, { jobId: claimed?.id ?? '', workerId: 'w', leaseSeconds: 60, progress: 45, step: 'encodage 720p', state: { completedRungs: ['1080p'] } }), true);
    assert.equal(await heartbeat(sql, { jobId: claimed?.id ?? '', workerId: 'intrus', leaseSeconds: 60, progress: 90, step: 'x' }), false, 'un autre travailleur ne peut pas la renouveler');
    const stored = await getJob(sql, claimed?.id ?? '');
    assert.equal(stored?.progress, 45);
    assert.deepEqual(stored?.state.completedRungs, ['1080p']);
  });

  it('réessaie avec un délai puis échoue définitivement après les tentatives', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const created = await enqueueJob(sql, job('echec-repete'));
    await sql`UPDATE media_jobs SET status = 'canceled' WHERE playback_id <> 'echec-repete' AND status IN ('queued', 'running')`;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await sql`UPDATE media_jobs SET run_after = now() WHERE id = ${created?.id ?? ''}`;
      const claimed = await claimNextJob(sql, 'w', 60);
      assert.equal(claimed?.attempts, attempt);
      const outcome = await markFailed(sql, { jobId: claimed?.id ?? '', workerId: 'w', error: 'disque plein', permanent: false });
      assert.equal(outcome, attempt < 3 ? 'retry' : 'failed');
    }
    assert.equal((await getJob(sql, created?.id ?? ''))?.status, 'failed');
    assert.equal(await retryJob(sql, created?.id ?? ''), true, 'l’administrateur peut la relancer');
    assert.equal((await getJob(sql, created?.id ?? ''))?.status, 'queued');
  });

  it('échoue tout de suite sur une erreur définitive, annule, et remet en file sans consommer de tentative', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    await sql`UPDATE media_jobs SET status = 'canceled' WHERE status IN ('queued', 'running')`;
    const permanent = await enqueueJob(sql, job('fichier-illisible'));
    const claimed = await claimNextJob(sql, 'w', 60);
    assert.equal(await markFailed(sql, { jobId: claimed?.id ?? '', workerId: 'w', error: 'Fichier illisible', permanent: true }), 'failed');

    const stopped = await enqueueJob(sql, job('arret-propre'));
    const second = await claimNextJob(sql, 'w', 60);
    await release(sql, second?.id ?? '', 'w');
    const after = await getJob(sql, stopped?.id ?? '');
    assert.equal(after?.status, 'queued');
    assert.equal(after?.attempts, 0);

    assert.equal(await cancelJob(sql, stopped?.id ?? ''), true);
    assert.equal(await cancelJob(sql, permanent?.id ?? ''), false, 'une tâche échouée ne s’annule pas');
    const done = await enqueueJob(sql, job('termine'));
    const third = await claimNextJob(sql, 'w', 60);
    await markSucceeded(sql, third?.id ?? '', 'w');
    assert.equal((await getJob(sql, done?.id ?? ''))?.status, 'succeeded');
  });
});

describe('envoi reprenable (tus)', () => {
  const metadata = (extra: Record<string, string> = {}) =>
    Object.entries({ filename: 'mon-film.mp4', playbackId: 'envoi-film', kind: 'film', title: 'Mon film', ...extra })
      .map(([key, value]) => `${key} ${b64(value)}`)
      .join(',');

  it('décode les métadonnées', () => {
    assert.deepEqual(parseUploadMetadata(`titre ${b64('Été')}, vide`), { titre: 'Été', vide: '' });
  });

  it('exige un administrateur et le bon en-tête de version', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const anonymous = await app.request('/uploads', { method: 'POST', headers: { 'tus-resumable': '1.0.0', 'upload-length': '10', 'upload-metadata': metadata() } });
    assert.equal(anonymous.status, 401);
    const noVersion = await app.request('/uploads', { method: 'POST', headers: { cookie: adminCookie, 'upload-length': '10', 'upload-metadata': metadata() } });
    assert.equal(noVersion.status, 412);
  });

  it('refuse un format inconnu, une taille excessive ou des métadonnées invalides', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    assert.equal((await tus('POST', '/uploads', { 'upload-length': '10', 'upload-metadata': metadata({ filename: 'virus.exe' }) })).status, 400);
    assert.equal((await tus('POST', '/uploads', { 'upload-length': '99999999999', 'upload-metadata': metadata() })).status, 413);
    assert.equal((await tus('POST', '/uploads', { 'upload-length': '10', 'upload-metadata': metadata({ playbackId: 'Mauvais ID' }) })).status, 400);
  });

  it('envoie en plusieurs morceaux, reprend après coupure, puis crée la tâche d’encodage', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    await sql`UPDATE media_jobs SET status = 'canceled' WHERE status IN ('queued', 'running')`;
    const data = Buffer.alloc(3000, 7);

    const created = await tus('POST', '/uploads', { 'upload-length': String(data.length), 'upload-metadata': metadata() });
    assert.equal(created.status, 201);
    const location = created.headers.get('location') ?? '';
    assert.match(location, /^\/uploads\/[0-9a-f-]{36}$/);

    const patch = (offset: number, chunk: Buffer) =>
      tus('PATCH', location, { 'content-type': 'application/offset+octet-stream', 'upload-offset': String(offset) }, chunk);

    const first = await patch(0, data.subarray(0, 1200));
    assert.equal(first.status, 204);
    assert.equal(first.headers.get('upload-offset'), '1200');

    // « Coupure » : le client demande où en est le serveur, puis reprend exactement là.
    const head = await tus('HEAD', location);
    assert.equal(head.headers.get('upload-offset'), '1200');
    assert.equal(head.headers.get('upload-length'), '3000');

    const wrong = await patch(500, data.subarray(500, 1000)); // mauvais décalage
    assert.equal(wrong.status, 409);

    assert.equal((await patch(1200, data.subarray(1200))).status, 204);

    const jobs = await sql<{ playback_id: string; status: string; source_path: string }[]>`SELECT playback_id, status, source_path FROM media_jobs WHERE playback_id = 'envoi-film'`;
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.status, 'queued');
    const stored = await stat(path.join(storageRoot, 'videos', 'sources', jobs[0]?.source_path ?? ''));
    assert.equal(stored.size, 3000, 'le fichier source est complet');
    assert.equal((await patch(3000, Buffer.alloc(1))).status, 409, 'envoi terminé');
  });

  it('refuse plus d’octets que la taille annoncée, et permet d’abandonner', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const created = await tus('POST', '/uploads', { 'upload-length': '100', 'upload-metadata': metadata({ playbackId: 'envoi-trop-gros' }) });
    const location = created.headers.get('location') ?? '';
    const tooMuch = await tus('PATCH', location, { 'content-type': 'application/offset+octet-stream', 'upload-offset': '0' }, Buffer.alloc(500));
    assert.equal(tooMuch.status, 413);
    assert.equal((await tus('DELETE', location)).status, 204);
  });

  it('expose le suivi des tâches aux administrateurs seulement', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    assert.equal((await app.request('/api/admin/jobs')).status, 401);
    const response = await app.request('/api/admin/jobs', { headers: { cookie: adminCookie } });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { jobs: { playbackId: string }[] };
    assert.ok(body.jobs.some(item => item.playbackId === 'envoi-film'));
  });
});
