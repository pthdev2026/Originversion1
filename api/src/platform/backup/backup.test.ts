import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { after, before, describe, it } from 'node:test';
import { DEV_DATABASE_URL } from '../../config/env.ts';
import { connect, type Sql } from '../database/client.ts';
import { migrate } from '../database/migrate.ts';
import { decryptFile, encryptStream } from './crypto.ts';
import { backupDatabase, restoreDatabase, tablesInDependencyOrder, verifyBackupFiles } from './database.ts';
import { backupFolderName, incrementalCopy, parseBackupDate, selectBackupsToPrune } from './files.ts';

const databaseUrl = process.env['DATABASE_URL'] ?? DEV_DATABASE_URL;
const schemas = [`test_${randomBytes(5).toString('hex')}`, `test_${randomBytes(5).toString('hex')}`];
let admin: Sql;
let source: Sql;
let target: Sql;
let root: string;
let available = true;

before(async () => {
  admin = connect(databaseUrl, { max: 1 });
  try { await admin`SELECT 1`; } catch { available = false; await admin.end(); return; }
  for (const schema of schemas) await admin.unsafe(`CREATE SCHEMA ${schema}`);
  source = connect(databaseUrl, { max: 3, connection: { search_path: schemas[0] ?? '' } });
  target = connect(databaseUrl, { max: 3, connection: { search_path: schemas[1] ?? '' } });
  await migrate(source);
  root = await mkdtemp(path.join(tmpdir(), 'origin-backup-'));

  // Jeu de données varié : clés étrangères, texte avec virgules / guillemets / sauts de ligne, JSON, séquence.
  const userId = randomUUID();
  await source`INSERT INTO users (id, email, password_hash, display_name, role) VALUES (${userId}, 'sauve@mail.fr', '$argon2id$x', ${'Nom, "avec" guillemets\net saut de ligne'}, 'viewer')`;
  await source`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('h1', ${userId}, now() + interval '1 day')`;
  await source`INSERT INTO programs (slug, kind, title) VALUES ('film-sauvegarde', 'film', 'Été à l’école')`;
  await source`INSERT INTO media_assets (playback_id, program_slug, status, storage_path, duration_seconds, renditions) VALUES ('film-sauvegarde', 'film-sauvegarde', 'ready', 'film-sauvegarde/v1', 12.5, ${source.json([{ name: '720p', height: 720 }] as never)})`;
  await source`INSERT INTO my_list (user_id, slug) VALUES (${userId}, 'film-sauvegarde')`;
  for (let i = 0; i < 5; i += 1) await source`INSERT INTO audit_log (user_id, event, details) VALUES (${userId}, ${`evenement-${i}`}, ${source.json({ i } as never)})`;
});

after(async () => {
  if (!available) return;
  await source.end();
  await target.end();
  for (const schema of schemas) await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  await rm(root, { recursive: true, force: true });
});

describe('sauvegarde et restauration de la base', () => {
  it('ordonne les tables : parents avant enfants', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const order = await tablesInDependencyOrder(source);
    assert.ok(order.indexOf('users') < order.indexOf('sessions'));
    assert.ok(order.indexOf('programs') < order.indexOf('media_assets'));
    assert.ok(order.indexOf('users') < order.indexOf('watch_progress'));
  });

  it('sauvegarde puis restaure à l’identique, et recale les compteurs', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const dir = path.join(root, 'db-clair');
    const manifest = await backupDatabase(source, dir);
    assert.equal(manifest.encrypted, false);
    assert.equal(manifest.tables.find(table => table.name === 'users')?.rows, 1);
    assert.equal(manifest.tables.find(table => table.name === 'audit_log')?.rows, 5);
    await assert.rejects(stat(`${dir}.partial`), 'aucun dossier partiel ne subsiste');

    await restoreDatabase(target, dir);
    const [user] = await target<{ display_name: string }[]>`SELECT display_name FROM users`;
    assert.equal(user?.display_name, 'Nom, "avec" guillemets\net saut de ligne', 'caractères spéciaux préservés');
    const [asset] = await target<{ renditions: { height: number }[]; duration_seconds: string }[]>`SELECT renditions, duration_seconds::text FROM media_assets`;
    assert.equal(asset?.renditions[0]?.height, 720);
    assert.equal(Number(asset?.duration_seconds), 12.5);
    assert.equal((await target`SELECT 1 FROM sessions`).length, 1);

    // Un nouvel enregistrement ne doit pas entrer en collision avec les identifiants restaurés.
    const [row] = await target<{ id: string }[]>`INSERT INTO audit_log (event) VALUES ('apres-restauration') RETURNING id`;
    assert.ok(Number(row?.id) > 5);
  });

  it('refuse de restaurer dans une base non vide', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    await assert.rejects(restoreDatabase(target, path.join(root, 'db-clair')), /n'est pas vide/);
  });

  it('chiffre les sauvegardes et refuse une mauvaise phrase secrète', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const dir = path.join(root, 'db-chiffre');
    const passphrase = 'phrase-secrete-de-test-assez-longue';
    const manifest = await backupDatabase(source, dir, { passphrase });
    assert.equal(manifest.encrypted, true);
    const raw = await readFile(path.join(dir, 'users.csv.gz.enc'));
    assert.equal(raw.includes(Buffer.from('sauve@mail.fr')), false, 'aucune donnée lisible dans le fichier');

    await admin.unsafe(`DROP SCHEMA ${schemas[1]} CASCADE; CREATE SCHEMA ${schemas[1]}`);
    await assert.rejects(restoreDatabase(target, dir), /chiffrée/);
    await assert.rejects(restoreDatabase(target, dir, { passphrase: 'mauvaise-phrase-secrete-xxxxxxx' }));
    assert.equal((await target`SELECT to_regclass('users') AS t`)[0]?.['t'] === null || (await target`SELECT count(*)::int AS n FROM users`)[0]?.['n'] === 0, true, 'rien de restauré après un échec');

    await admin.unsafe(`DROP SCHEMA ${schemas[1]} CASCADE; CREATE SCHEMA ${schemas[1]}`);
    await restoreDatabase(target, dir, { passphrase });
    assert.equal((await target`SELECT email FROM users`)[0]?.['email'], 'sauve@mail.fr');
  });

  it('détecte un fichier de sauvegarde altéré', async t => {
    if (!available) return t.skip('PostgreSQL injoignable');
    const dir = path.join(root, 'db-clair');
    await verifyBackupFiles(dir);
    const file = path.join(dir, 'programs.csv.gz');
    const original = await readFile(file);
    await writeFile(file, Buffer.concat([original, Buffer.from('x')]));
    await assert.rejects(verifyBackupFiles(dir), /corrompue/);
    await writeFile(file, original);
  });
});

describe('chiffrement', () => {
  it('chiffre et déchiffre un flux, et détecte une altération', async t => {
    const file = path.join(root ?? tmpdir(), 'chiffre.bin');
    if (!root) return t.skip('répertoire de test indisponible');
    const passphrase = 'phrase-secrete-de-test-assez-longue';
    const { createWriteStream } = await import('node:fs');
    await pipeline(Readable.from([Buffer.from('bonjour '), Buffer.from('monde')]), encryptStream(passphrase), createWriteStream(file));

    const chunks: Buffer[] = [];
    for await (const chunk of await decryptFile(file, passphrase)) chunks.push(chunk as Buffer);
    assert.equal(Buffer.concat(chunks).toString(), 'bonjour monde');

    const bytes = await readFile(file);
    bytes[bytes.length - 20] = (bytes[bytes.length - 20] ?? 0) ^ 0xff; // altère le contenu chiffré
    await writeFile(file, bytes);
    await assert.rejects(async () => { for await (const _ of await decryptFile(file, passphrase)) { /* lecture */ } });
  });
});

describe('fichiers et rotation', () => {
  it('copie de façon incrémentale, sans jamais supprimer', async t => {
    if (!root) return t.skip('répertoire de test indisponible');
    const from = path.join(root, 'src');
    const to = path.join(root, 'copie');
    await mkdir(path.join(from, 'film'), { recursive: true });
    await writeFile(path.join(from, 'film', 'original.mp4'), Buffer.alloc(1000, 1));
    await writeFile(path.join(from, 'autre.mp4'), Buffer.alloc(500, 2));

    assert.deepEqual(await incrementalCopy(from, to), { copied: 2, skipped: 0, bytes: 1500 });
    assert.deepEqual(await incrementalCopy(from, to), { copied: 0, skipped: 2, bytes: 0 });

    await writeFile(path.join(from, 'film', 'original.mp4'), Buffer.alloc(1200, 3));
    const future = new Date(Date.now() + 5000);
    await utimes(path.join(from, 'film', 'original.mp4'), future, future);
    assert.equal((await incrementalCopy(from, to)).copied, 1);

    await rm(path.join(from, 'autre.mp4'));
    await incrementalCopy(from, to);
    assert.equal((await stat(path.join(to, 'autre.mp4'))).size, 500, 'la copie de sauvegarde est conservée');
  });

  it('nomme et relit les dossiers de sauvegarde', () => {
    const date = new Date(Date.UTC(2026, 9, 13, 18, 30, 5));
    const name = backupFolderName(date);
    assert.equal(name, 'db-20261013T183005Z');
    assert.equal(parseBackupDate(name)?.getTime(), date.getTime());
    assert.equal(parseBackupDate('files'), null);
  });

  it('garde 14 quotidiennes + 1 par semaine pour 8 semaines, et supprime le reste', () => {
    const names: string[] = [];
    for (let day = 0; day < 100; day += 1) names.push(backupFolderName(new Date(Date.UTC(2026, 9, 13) - day * 86_400_000)));
    names.push('files', 'notes.txt'); // jamais touchés
    const pruned = selectBackupsToPrune(names, { daily: 14, weekly: 8 });
    const kept = names.filter(name => parseBackupDate(name) && !pruned.includes(name));
    assert.ok(kept.length >= 14 && kept.length <= 14 + 8);
    assert.ok(kept.includes(backupFolderName(new Date(Date.UTC(2026, 9, 13)))), 'la plus récente est conservée');
    assert.equal(pruned.includes('files'), false);
    assert.equal(pruned.includes('notes.txt'), false);
  });
});
