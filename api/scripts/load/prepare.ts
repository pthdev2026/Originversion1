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
const catalogSize = args.includes('--catalog') ? Number(args[args.indexOf('--catalog') + 1] || 0) : 0;
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
await sql`TRUNCATE users, programs, themes, collections, creators CASCADE`; // repart d'une base de test vide

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
// ── Catalogue synthétique (option --catalog N) : de quoi mesurer l'accueil, la recherche et les recommandations ──
if (catalogSize > 0) {
  const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)] as T;
  const themeSlugs = ['foi', 'couple', 'mariage', 'famille', 'identite', 'relations', 'pardon', 'reconstruction', 'leadership', 'ministere', 'temoignages', 'societe'];
  const genres = ['Drame', 'Documentaire', 'Interview', 'Podcast', 'Suspense', 'Science-fiction', 'Louange'];
  const kinds = ['film', 'serie', 'documentaire'] as const;
  const words = ['lumière', 'chemin', 'silence', 'retour', 'espérance', 'nuit', 'racines', 'pardon', 'voix', 'horizon', 'promesse', 'fidélité'];
  await sql`INSERT INTO themes ${sql(themeSlugs.map((slug, position) => ({ slug, title: slug[0]?.toUpperCase() + slug.slice(1), position })))}`;
  const slugs: string[] = [];
  const programRows = Array.from({ length: catalogSize }, (_, i) => {
    const slug = `synth-${String(i).padStart(5, '0')}`;
    slugs.push(slug);
    return {
      slug, kind: pick([...kinds]), title: `${pick(words)} ${pick(words)} ${i}`, category: pick(['Film original', 'Série originale', 'Documentaire']),
      tagline: `${pick(words)} et ${pick(words)}`, synopsis: 'Synopsis de démonstration.', is_demo: true, published: true,
    };
  });
  for (let offset = 0; offset < programRows.length; offset += 500) {
    await sql`INSERT INTO programs ${sql(programRows.slice(offset, offset + 500))}`;
  }
  // Genres (tableau) mis à jour en un coup : le déclencheur de recherche recalcule le texte indexé.
  await sql`UPDATE programs SET genres = ARRAY[(${genres}::text[])[1 + floor(random() * ${genres.length})::int]] WHERE slug LIKE 'synth-%'`;
  const links = slugs.flatMap(slug => [...new Set([pick(themeSlugs), pick(themeSlugs)])].map(theme => ({ program_slug: slug, theme_slug: theme })));
  for (let offset = 0; offset < links.length; offset += 1000) await sql`INSERT INTO program_themes ${sql(links.slice(offset, offset + 1000))}`;
  for (let c = 0; c < 10; c += 1) {
    await sql`INSERT INTO collections (slug, title, layout, home_position, published) VALUES (${'rail-' + c}, ${'Rail ' + c}, 'rail', ${c}, true)`;
    const chosen = [...new Set(Array.from({ length: 20 }, () => pick(slugs)))];
    await sql`INSERT INTO collection_items ${sql(chosen.map((program_slug, position) => ({ collection_slug: 'rail-' + c, program_slug, position })))}`;
  }
  // Un historique réaliste : 8 programmes regardés (dont 3 terminés) et 3 en liste, par spectateur.
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    const progress = batch.flatMap(row => [...new Set(Array.from({ length: 8 }, () => pick(slugs)))].map((slug, i) => ({
      user_id: row.id, playback_id: slug, program_slug: slug, position_seconds: i < 3 ? 95 : 40, duration_seconds: 100, completed: i < 3,
    })));
    await sql`INSERT INTO watch_progress ${sql(progress)}`;
    const list = batch.flatMap(row => [...new Set(Array.from({ length: 3 }, () => pick(slugs)))].map(slug => ({ user_id: row.id, slug })));
    await sql`INSERT INTO my_list ${sql(list)}`;
  }
  console.log(`✅ catalogue synthétique : ${catalogSize} programmes, ${themeSlugs.length} thèmes, 10 rails, historique de ${rows.length} comptes`);
}
await sql.end();

const out = path.join(config.storageRoot, 'load');
await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'users.json'), JSON.stringify({ password: PASSWORD, users: rows }), { mode: 0o600 });
console.log(`✅ ${users} comptes + sessions et 1 film de 2 h préparés en ${((Date.now() - started) / 1000).toFixed(1)} s (base origin_load)`);
console.log(`   URL de la base : ${loadUrl.replace(/:[^:@]*@/, ':***@')}`);
