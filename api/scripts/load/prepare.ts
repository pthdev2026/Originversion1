// Prépare une base DÉDIÉE au test de charge (jamais la base de développement) :
//  - crée la base « origin_load » si besoin et applique les migrations ;
//  - crée N comptes de test (mot de passe connu) avec une session valide chacun ;
//  - enregistre un « film de 2 h » (durée 7 200 s) qui pointe vers un dossier HLS réel.
// Usage : npm run load:prepare -- --users 1000
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../../src/config/env.ts';
import { hashPassword } from '../../src/modules/identity/password.ts';
import { registerAsset } from '../../src/modules/ingest/repository.ts';
import { connect } from '../../src/platform/database/client.ts';
import { migrate } from '../../src/platform/database/migrate.ts';

const args = process.argv.slice(2);
const users = Number(args[args.indexOf('--users') + 1] || 1000);
const hlsSource = args.includes('--hls') ? args[args.indexOf('--hls') + 1] ?? 'demo-b4' : 'demo-b4';
const PASSWORD = 'Mot de passe de charge 2026';

const config = loadConfig();
const adminUrl = config.databaseUrl;
const loadUrl = adminUrl.replace(/\/[^/]+$/, '/origin_load');

const admin = connect(adminUrl, { max: 1 });
const exists = await admin`SELECT 1 FROM pg_database WHERE datname = 'origin_load'`;
if (exists.length === 0) await admin.unsafe('CREATE DATABASE origin_load');
await admin.end();

const sql = connect(loadUrl, { max: 8 });
await migrate(sql);
await sql`TRUNCATE users, programs CASCADE`; // repart d'une base de test vide

const started = Date.now();
const passwordHash = await hashPassword(PASSWORD); // même empreinte pour tous : la charge ne teste pas argon2 ici
const rows: { id: string; email: string; token: string }[] = [];
for (let i = 0; i < users; i += 1) rows.push({ id: randomUUID(), email: `charge-${String(i).padStart(4, '0')}@example.org`, token: randomBytes(32).toString('base64url') });

for (let offset = 0; offset < rows.length; offset += 500) {
  const batch = rows.slice(offset, offset + 500);
  await sql`INSERT INTO users ${sql(batch.map(row => ({ id: row.id, email: row.email, password_hash: passwordHash, role: 'viewer' })))}`;
  await sql`INSERT INTO sessions ${sql(batch.map(row => ({
    token_hash: createHash('sha256').update(row.token).digest('hex'), user_id: row.id, expires_at: new Date(Date.now() + 86_400_000),
  })))}`;
}

await registerAsset(sql, {
  playbackId: 'load-film', programSlug: 'load-film', kind: 'film', title: 'Film de charge (2 h)', storagePath: hlsSource,
  durationSeconds: 7200, sourceWidth: 1920, sourceHeight: 1080,
  renditions: [{ name: '720p', height: 720, videoKbps: 2800 }], preset: null, encodeSeconds: null, encodedAt: null, isDemo: true,
});
await registerAsset(sql, {
  playbackId: 'origin-ident', programSlug: 'origin-brand', kind: 'brand', title: 'Ident', storagePath: 'origin-ident',
  durationSeconds: 6, sourceWidth: 1920, sourceHeight: 1080, renditions: [], preset: null, encodeSeconds: null, encodedAt: null, isDemo: false,
});
await sql.end();

const out = path.join(config.storageRoot, 'load');
await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'users.json'), JSON.stringify({ password: PASSWORD, users: rows }), { mode: 0o600 });
console.log(`✅ ${users} comptes + sessions et 1 film de 2 h préparés en ${((Date.now() - started) / 1000).toFixed(1)} s (base origin_load)`);
console.log(`   URL de la base : ${loadUrl.replace(/:[^:@]*@/, ':***@')}`);
