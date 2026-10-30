/** Espace personnel : profil, préférences, appareils, thématiques, photo, changement d'e-mail, historique. */
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
import { registerAsset } from '../ingest/repository.ts';
import { createAccountService } from './service.ts';

const PASSWORD = 'Un très bon mot de passe';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const AVIF = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif'), Buffer.alloc(16)]);
const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schema = `test_${randomBytes(6).toString('hex')}`;
const storageRoot = `/tmp/origin-account-${randomBytes(4).toString('hex')}`;
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

describe('profil', () => {
  it('exige un compte ; /api/me expose date d’inscription, langue et photo', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    assert.equal((await call('PATCH', '/api/me', { displayName: 'X' })).status, 401);
    const cookie = await register('profil@mail.fr');
    const me = (await json(await call('GET', '/api/me', undefined, cookie))).user;
    assert.match(me.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(me.locale, 'fr');
    assert.equal(me.avatar, null);
  });

  it('modifie le nom et la langue ; valide strictement', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const cookie = await register('nom@mail.fr');
    const done = await json(await call('PATCH', '/api/me', { displayName: '  Grace M.  ', locale: 'en' }, cookie));
    assert.equal(done.user.displayName, 'Grace M.', 'espaces retirés');
    assert.equal(done.user.locale, 'en');
    assert.equal((await json(await call('PATCH', '/api/me', { displayName: null }, cookie))).user.displayName, null, 'nom effaçable');
    for (const body of [{}, { displayName: '' }, { displayName: 'x'.repeat(61) }, { locale: 'de' }, { role: 'admin' }, { email: 'a@b.fr' }]) {
      assert.equal((await call('PATCH', '/api/me', body, cookie)).status, 400, JSON.stringify(body));
    }
  });
});

describe('préférences', () => {
  it('valeurs par défaut, mise à jour partielle, validation stricte, isolation entre comptes', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const alice = await register('prefs-a@mail.fr');
    const bob = await register('prefs-b@mail.fr');
    const defaults = (await json(await call('GET', '/api/me/preferences', undefined, alice))).preferences;
    assert.deepEqual(defaults, {
      previews: true, nextEpisode: true, quality: 'auto', subtitles: 'fr', subtitleSize: 'medium',
      newEpisodes: true, news: false, emails: true, reduceMotion: false, history: true,
    });
    const updated = (await json(await call('PUT', '/api/me/preferences', { quality: 'eco', news: true }, alice))).preferences;
    assert.equal(updated.quality, 'eco');
    assert.equal(updated.news, true);
    assert.equal(updated.subtitles, 'fr', 'le reste est conservé');
    assert.deepEqual((await json(await call('GET', '/api/me/preferences', undefined, alice))).preferences, updated, 'persisté');
    assert.equal((await json(await call('GET', '/api/me/preferences', undefined, bob))).preferences.quality, 'auto', 'isolé');
    for (const body of [{}, { quality: 'ultra' }, { previews: 'oui' }, { inconnu: true }, { subtitleSize: 'XL' }]) {
      assert.equal((await call('PUT', '/api/me/preferences', body, alice)).status, 400, JSON.stringify(body));
    }
    assert.equal((await call('GET', '/api/me/preferences')).status, 401);
  });

  it('un document stocké abîmé ne casse rien (retombe sur les valeurs par défaut)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const cookie = await register('prefs-abime@mail.fr');
    const [user] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = 'prefs-abime@mail.fr'`;
    await sql`INSERT INTO user_preferences (user_id, data) VALUES (${user!.id}, ${sql.json({ quality: 12, history: 'x', news: true, vieux: 1 } as never)})`;
    const prefs = (await json(await call('GET', '/api/me/preferences', undefined, cookie))).preferences;
    assert.equal(prefs.quality, 'auto');
    assert.equal(prefs.history, true);
    assert.equal(prefs.news, true, 'les champs valides sont gardés');
    assert.ok(!('vieux' in prefs));
  });
});

describe('appareils connectés', () => {
  it('liste les appareils avec un nom approximatif, repère le courant, déconnecte les autres', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await register('appareils@mail.fr'); // session n°1 (Chrome · macOS)
    const mac = cookieOf(await login('appareils@mail.fr', CHROME_MAC));
    const phone = cookieOf(await login('appareils@mail.fr', SAFARI_IPHONE));
    const list = (await json(await call('GET', '/api/me/sessions', undefined, mac))).sessions as { id: string; device: string; current: boolean; lastSeenAt: string }[];
    assert.equal(list.length, 3);
    assert.deepEqual(list.map(s => s.device).sort(), ['Chrome · macOS', 'Chrome · macOS', 'Safari · iPhone']);
    assert.equal(list.filter(s => s.current).length, 1);
    assert.ok(list.every(s => /^[0-9a-f-]{36}$/.test(s.id) && s.lastSeenAt));
    assert.ok(!JSON.stringify(list).match(/token|hash|\d+\.\d+\.\d+\.\d+/i), 'ni jeton, ni empreinte, ni adresse IP');

    const iphone = list.find(s => s.device === 'Safari · iPhone')!;
    assert.equal((await call('GET', '/api/me', undefined, phone)).status, 200);
    assert.equal((await call('DELETE', `/api/me/sessions/${iphone.id}`, undefined, mac)).status, 204);
    assert.equal((await call('GET', '/api/me', undefined, phone)).status, 401, 'l’appareil déconnecté perd l’accès');
    const current = list.find(s => s.current)!;
    assert.equal((await call('DELETE', `/api/me/sessions/${current.id}`, undefined, mac)).status, 409, 'l’appareil en cours : utiliser « Se déconnecter »');
    assert.equal((await call('DELETE', `/api/me/sessions/${randomUUID()}`, undefined, mac)).status, 404);
    assert.equal((await call('DELETE', '/api/me/sessions/pas-un-id', undefined, mac)).status, 400);

    const others = await json(await call('POST', '/api/me/sessions/revoke-others', undefined, mac));
    assert.equal(others.revoked, 1);
    assert.equal((await call('GET', '/api/me', undefined, mac)).status, 200, 'la session en cours reste ouverte');
  });

  it('on ne voit ni ne déconnecte jamais les appareils d’un autre compte', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const eve = await register('eve@mail.fr');
    const mallory = await register('mallory@mail.fr');
    const eveSessions = (await json(await call('GET', '/api/me/sessions', undefined, eve))).sessions;
    assert.equal(eveSessions.length, 1);
    assert.equal((await call('DELETE', `/api/me/sessions/${eveSessions[0].id}`, undefined, mallory)).status, 404);
    assert.equal((await call('GET', '/api/me', undefined, eve)).status, 200);
    assert.equal((await call('GET', '/api/me/sessions')).status, 401);
  });
});

describe('thématiques préférées et « Pour vous » dès l’inscription', () => {
  it('enregistre, valide, et nourrit les recommandations sans aucun historique', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    for (const [slug, title] of [['foi', 'Foi'], ['famille', 'Famille']]) await call('PUT', `/api/admin/themes/${slug}`, { title }, adminCookie);
    for (const [slug, themes] of [['film-foi', ['foi']], ['film-famille', ['famille']], ['film-neutre', []]] as const) {
      await call('PUT', `/api/admin/programs/${slug}`, { kind: 'film', title: slug, published: true, themes }, adminCookie);
    }
    const cookie = await register('themes@mail.fr');
    assert.deepEqual((await json(await call('GET', '/api/me/themes', undefined, cookie))).themes, []);
    const before = await json(await call('GET', '/api/recommendations', undefined, cookie));
    assert.equal(before.personalized, false, 'sans thématique ni historique : pas de faux « pour vous »');

    assert.equal((await call('PUT', '/api/me/themes', { themes: ['inconnue'] }, cookie)).status, 400);
    assert.equal((await call('PUT', '/api/me/themes', { themes: Array.from({ length: 13 }, (_, i) => `t${i}`) }, cookie)).status, 400);
    assert.equal((await call('PUT', '/api/me/themes', { themes: ['Mauvais_Slug'] }, cookie)).status, 400);
    assert.deepEqual((await json(await call('GET', '/api/me/themes', undefined, cookie))).themes, [], 'refus = liste inchangée');

    const saved = await json(await call('PUT', '/api/me/themes', { themes: ['foi', 'foi'] }, cookie));
    assert.deepEqual(saved.themes, ['foi'], 'doublons retirés');
    const recs = await json(await call('GET', '/api/recommendations?limit=3', undefined, cookie));
    assert.equal(recs.personalized, true);
    assert.equal(recs.items[0].program.slug, 'film-foi');
    assert.equal(recs.items[0].reason, 'Parce que vous aimez « Foi »');
    assert.deepEqual((await json(await call('PUT', '/api/me/themes', { themes: [] }, cookie))).themes, []);
    assert.equal((await json(await call('GET', '/api/recommendations', undefined, cookie))).personalized, false, 'liste vidée = retour au repli honnête');
  });
});

describe('photo de profil', () => {
  it('envoi, distribution publique, remplacement (ancien fichier supprimé), recadrage, avatar prédéfini, retrait', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const cookie = await register('photo@mail.fr');
    const first = await call('PUT', '/files/me/avatar', PNG, cookie, { 'content-type': 'image/png' });
    assert.equal(first.status, 201);
    const avatar = (await json(first)).avatar;
    assert.equal(avatar.kind, 'photo');
    assert.match(avatar.url, /^\/avatars\/[a-f0-9]{32}\.png$/);
    assert.equal(avatar.zoom, 1);
    const served = await call('GET', avatar.url);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/png');
    assert.match(served.headers.get('cache-control') ?? '', /immutable/);
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), PNG);

    assert.equal((await json(await call('PUT', '/api/me/avatar', { kind: 'photo', zoom: 2.5 }, cookie))).avatar.zoom, 2.5);
    assert.equal((await call('PUT', '/api/me/avatar', { kind: 'photo', zoom: 9 }, cookie)).status, 400);

    const second = (await json(await call('PUT', '/files/me/avatar', JPG, cookie))).avatar;
    assert.match(second.url, /\.jpg$/);
    assert.equal((await call('GET', avatar.url)).status, 404, 'l’ancienne photo n’existe plus');
    assert.equal((await call('GET', second.url)).status, 200);

    const preset = (await json(await call('PUT', '/api/me/avatar', { kind: 'preset', preset: 3 }, cookie))).avatar;
    assert.deepEqual(preset, { kind: 'preset', preset: 3 });
    assert.equal((await call('GET', second.url)).status, 404, 'passer à un avatar prédéfini supprime la photo');
    assert.equal((await call('PUT', '/api/me/avatar', { kind: 'photo', zoom: 2 }, cookie)).status, 400, 'pas de photo à recadrer');
    assert.equal((await call('PUT', '/api/me/avatar', { kind: 'preset', preset: 8 }, cookie)).status, 400);

    await call('PUT', '/files/me/avatar', PNG, cookie);
    assert.equal((await json(await call('PUT', '/api/me/avatar', { kind: null }, cookie))).avatar, null);
    assert.equal((await json(await call('GET', '/api/me', undefined, cookie))).user.avatar, null);
  });

  it('refuse ce qui n’est pas une photo valide, trop lourd, ou sans compte', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const cookie = await register('photo-refus@mail.fr');
    assert.equal((await call('PUT', '/files/me/avatar', PNG)).status, 401);
    assert.equal((await call('PUT', '/files/me/avatar', Buffer.from('<svg/>'), cookie)).status, 400);
    assert.equal((await call('PUT', '/files/me/avatar', Buffer.from('du texte'), cookie)).status, 400);
    assert.equal((await call('PUT', '/files/me/avatar', AVIF, cookie)).status, 400, 'AVIF non accepté pour une photo de profil');
    assert.equal((await call('PUT', '/files/me/avatar', Buffer.alloc(0), cookie)).status, 400);
    assert.equal((await call('PUT', '/files/me/avatar', Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), cookie)).status, 413);
    for (const file of ['x.png', '..%2F..%2Fetc%2Fpasswd', `${'a'.repeat(32)}.svg`, `${'a'.repeat(31)}.png`]) {
      assert.equal((await call('GET', `/avatars/${file}`)).status, 404, file);
    }
  });

  it('la photo disparaît avec le compte (donnée personnelle)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const cookie = await register('photo-suppr@mail.fr');
    const url = (await json(await call('PUT', '/files/me/avatar', PNG, cookie))).avatar.url;
    assert.equal((await call('GET', url)).status, 200);
    assert.equal((await call('POST', '/api/me/delete', { password: PASSWORD }, cookie)).status, 204);
    assert.equal((await call('GET', url)).status, 404);
  });
});

describe('changement d’adresse e-mail', () => {
  const lastCodeTo = (address: string) => /\b(\d{6})\b/.exec([...mails].reverse().find(mail => mail.to === address)?.text ?? '')?.[1] ?? '';

  it('mot de passe exigé, code envoyé à la NOUVELLE adresse, ancienne adresse prévenue, autres appareils déconnectés', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const cookie = await register('ancienne@mail.fr');
    const other = cookieOf(await login('ancienne@mail.fr', SAFARI_IPHONE));
    assert.equal((await call('POST', '/api/me/email/change', { newEmail: 'nouvelle@mail.fr', password: 'faux mot de passe' }, cookie)).status, 401);
    assert.equal((await call('POST', '/api/me/email/change', { newEmail: 'ancienne@mail.fr', password: PASSWORD }, cookie)).status, 400, 'déjà son adresse');
    assert.equal((await call('POST', '/api/me/email/change', { newEmail: 'pas-un-email', password: PASSWORD }, cookie)).status, 400);
    const count = mails.length;
    assert.equal((await call('POST', '/api/me/email/change', { newEmail: ' Nouvelle@Mail.fr ', password: PASSWORD }, cookie)).status, 202);
    await tick();
    assert.equal(mails.length, count + 2);
    const code = lastCodeTo('nouvelle@mail.fr');
    assert.match(code, /^\d{6}$/);
    assert.ok(mails.some(mail => mail.to === 'ancienne@mail.fr' && /changement d’adresse/i.test(mail.subject)), 'avertissement à l’ancienne adresse');
    const [stored] = await sql<{ code_hash: string }[]>`SELECT code_hash FROM email_changes WHERE new_email = 'nouvelle@mail.fr'`;
    assert.ok(stored && !stored.code_hash.includes(code), 'seule l’empreinte est conservée');

    assert.equal((await call('POST', '/api/me/email/change/confirm', { code: code === '000000' ? '111111' : '000000' }, cookie)).status, 400, 'mauvais code');
    const done = await call('POST', '/api/me/email/change/confirm', { code }, cookie);
    assert.equal(done.status, 200);
    const user = (await json(done)).user;
    assert.equal(user.email, 'nouvelle@mail.fr');
    assert.equal(user.emailVerified, true);
    assert.equal((await call('GET', '/api/me', undefined, cookie)).status, 200, 'la session en cours reste ouverte');
    assert.equal((await call('GET', '/api/me', undefined, other)).status, 401, 'les autres appareils sont déconnectés');
    assert.equal((await login('nouvelle@mail.fr', CHROME_MAC)).status, 200);
    assert.equal((await login('ancienne@mail.fr', CHROME_MAC)).status, 401);
    await tick();
    assert.ok(mails.some(mail => mail.to === 'ancienne@mail.fr' && /a été modifiée/.test(mail.subject)), 'ancienne adresse informée du résultat');
    assert.equal((await call('POST', '/api/me/email/change/confirm', { code }, cookie)).status, 400, 'code à usage unique');
  });

  it('adresse déjà prise : même réponse, aucun code envoyé (on ne révèle pas qui est inscrit)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await register('prise@mail.fr');
    const cookie = await register('demandeur@mail.fr');
    const count = mails.length;
    const response = await call('POST', '/api/me/email/change', { newEmail: 'prise@mail.fr', password: PASSWORD }, cookie);
    assert.equal(response.status, 202);
    await tick();
    assert.equal(mails.length, count, 'rien n’est envoyé');
    assert.equal((await call('POST', '/api/me/email/change/confirm', { code: '123456' }, cookie)).status, 400);
  });

  it('5 essais au plus, puis la demande est annulée ; un code expiré est refusé', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const cookie = await register('essais@mail.fr');
    await call('POST', '/api/me/email/change', { newEmail: 'essais2@mail.fr', password: PASSWORD }, cookie);
    await tick();
    const good = lastCodeTo('essais2@mail.fr');
    const wrong = good === '999999' ? '888888' : '999999';
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await call('POST', '/api/me/email/change/confirm', { code: wrong }, cookie)).status);
    assert.deepEqual(statuses, [400, 400, 400, 400, 400, 429]);
    assert.equal((await call('POST', '/api/me/email/change/confirm', { code: good }, cookie)).status, 400, 'même le bon code ne passe plus : demande annulée');

    await call('POST', '/api/me/email/change', { newEmail: 'essais3@mail.fr', password: PASSWORD }, cookie);
    await tick();
    const code = lastCodeTo('essais3@mail.fr');
    await sql`UPDATE email_changes SET expires_at = now() - interval '1 minute'`;
    assert.equal((await call('POST', '/api/me/email/change/confirm', { code }, cookie)).status, 400, 'expiré');
    assert.equal((await call('POST', '/api/me/email/change/confirm', { code: '12ab56' }, cookie)).status, 400, 'format invalide');
  });
});

describe('historique de visionnage', () => {
  const asset = (id: string, slug: string, kind: 'film' | 'serie' = 'film') => registerAsset(sql, {
    playbackId: id, programSlug: slug, kind, title: slug, storagePath: id, durationSeconds: 1000,
    sourceWidth: 1280, sourceHeight: 720, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: true,
  });

  it('« Continuer à regarder » indique l’épisode (« Épisode 2 · Saison 1 »)', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    await call('PUT', '/api/admin/programs/ma-serie-h', {
      kind: 'serie', title: 'Ma série', published: true,
      seasons: [{ number: 1, episodes: [{ key: 's1-e1', number: 1, title: 'Un' }, { key: 's1-e2', number: 2, title: 'Deux' }] }],
    }, adminCookie);
    await asset('ma-serie-h-s1-e2', 'ma-serie-h', 'serie');
    await asset('film-h', 'film-h');
    const cookie = await register('histo@mail.fr');
    await call('PUT', '/api/me/progress/ma-serie-h-s1-e2', { positionSeconds: 300 }, cookie);
    await call('PUT', '/api/me/progress/film-h', { positionSeconds: 100 }, cookie);
    const items = (await json(await call('GET', '/api/me/continue-watching', undefined, cookie))).items as any[];
    const episode = items.find(item => item.playbackId === 'ma-serie-h-s1-e2');
    assert.deepEqual(episode.episode, { key: 's1-e2', number: 2, seasonNumber: 1, title: 'Deux' });
    assert.equal(items.find(item => item.playbackId === 'film-h').episode, null);
  });

  it('historique désactivé : rien n’est enregistré, rien n’est affiché, rien n’alimente les recommandations', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const cookie = await register('histo-off@mail.fr');
    await call('PUT', '/api/me/progress/film-h', { positionSeconds: 100 }, cookie);
    assert.equal((await json(await call('GET', '/api/me/continue-watching', undefined, cookie))).items.length, 1);

    await call('PUT', '/api/me/preferences', { history: false }, cookie);
    const response = await call('PUT', '/api/me/progress/film-h', { positionSeconds: 700 }, cookie);
    assert.equal(response.status, 200, 'le lecteur n’est pas perturbé');
    assert.equal((await json(response)).positionSeconds, 700);
    assert.equal((await json(await call('GET', '/api/me/continue-watching', undefined, cookie))).items.length, 0, 'masqué');
    assert.equal((await call('GET', '/api/me/progress/film-h', undefined, cookie)).status, 404);
    assert.deepEqual((await json(await call('GET', '/api/me/progress?program=film-h', undefined, cookie))).items, []);
    const [stored] = await sql<{ position_seconds: string }[]>`SELECT position_seconds FROM watch_progress wp JOIN users u ON u.id = wp.user_id WHERE u.email = 'histo-off@mail.fr'`;
    assert.equal(Number(stored?.position_seconds), 100, 'la position n’a PAS été écrasée par le nouvel envoi');

    await call('PUT', '/api/me/preferences', { history: true }, cookie);
    assert.equal((await json(await call('GET', '/api/me/continue-watching', undefined, cookie))).items.length, 1, 'réactivé : l’ancien historique réapparaît');
  });

  it('« Effacer l’historique » supprime tout, uniquement pour ce compte', async t => {
    if (!available) return t.skip('PostgreSQL indisponible');
    const a = await register('efface-a@mail.fr');
    const b = await register('efface-b@mail.fr');
    for (const cookie of [a, b]) await call('PUT', '/api/me/progress/film-h', { positionSeconds: 100 }, cookie);
    assert.equal((await call('DELETE', '/api/me/history')).status, 401);
    assert.deepEqual(await json(await call('DELETE', '/api/me/history', undefined, a)), { cleared: 1 });
    assert.equal((await json(await call('GET', '/api/me/continue-watching', undefined, a))).items.length, 0);
    assert.equal((await json(await call('GET', '/api/me/continue-watching', undefined, b))).items.length, 1, 'l’autre compte est intact');
  });
});
