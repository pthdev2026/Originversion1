/**
 * Applique `seed/theme-editorial.json` (sous-titre + programme phare de chaque thématique) à la base.
 * Idempotent et NON destructif : ne remplit que les champs encore vides, ne remplace jamais une valeur déjà choisie. Ne crée aucune thématique ni aucun programme : ce qui n'existe pas est signalé et ignoré.
 *   node scripts/theme-editorial.ts            (base de DATABASE_URL, sinon base de développement)
 */
import { readFile } from 'node:fs/promises';
import { DEV_DATABASE_URL } from '../src/config/env.ts';
import { connect } from '../src/platform/database/client.ts';

const sql = connect(process.env['DATABASE_URL'] ?? DEV_DATABASE_URL, { max: 1 });
const doc = JSON.parse(await readFile(new URL('../seed/theme-editorial.json', import.meta.url), 'utf8')) as Record<string, { subtitle: string; featured: string }>;
let applied = 0;
for (const [slug, entry] of Object.entries(doc)) {
  if (slug.startsWith('_')) continue;
  const [theme] = await sql`SELECT 1 FROM themes WHERE slug = ${slug}`;
  if (!theme) { console.log(`  thématique absente, ignorée : ${slug}`); continue; }
  const [program] = await sql`SELECT 1 FROM program_themes WHERE theme_slug = ${slug} AND program_slug = ${entry.featured}`;
  if (!program) console.log(`  phare « ${entry.featured} » absent du catalogue ou hors de la thématique « ${slug} » : sous-titre seul`);
  await sql`UPDATE themes SET subtitle = coalesce(subtitle, ${entry.subtitle}), featured_slug = coalesce(featured_slug, ${program ? entry.featured : null}) WHERE slug = ${slug}`;
  applied += 1;
}
console.log(`${applied} thématique(s) mise(s) à jour.`);
await sql.end();
