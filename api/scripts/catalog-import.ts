// Importe un catalogue JSON (themes, programs, creators, collections) dans la base, avec la même validation que l'API.
// Usage : npm run catalog:import -- seed/catalog-demo.json     (idempotent : relancer remplace, ne duplique pas)
import { readFile } from 'node:fs/promises';
import { loadConfig } from '../src/config/env.ts';
import { upsertCollection, upsertCreator, upsertProgram, upsertTheme } from '../src/modules/catalog/admin.ts';
import { collectionSchema, creatorSchema, parseBody, programSchema, themeSchema } from '../src/modules/catalog/schemas.ts';
import { connect } from '../src/platform/database/client.ts';

const file = process.argv[2];
if (!file) {
  console.error('Usage : npm run catalog:import -- <fichier.json>');
  process.exit(1);
}
const document = JSON.parse(await readFile(file, 'utf8')) as Record<'themes' | 'programs' | 'creators' | 'collections', Record<string, unknown>>;
const sql = connect(loadConfig().databaseUrl, { max: 2 });
try {
  // Ordre imposé par les références : thèmes → programmes → créateurs → collections.
  for (const [slug, value] of Object.entries(document.themes ?? {})) await upsertTheme(sql, slug, parseBody(themeSchema, value));
  for (const [slug, value] of Object.entries(document.programs ?? {})) await upsertProgram(sql, slug, parseBody(programSchema, value));
  for (const [slug, value] of Object.entries(document.creators ?? {})) await upsertCreator(sql, slug, parseBody(creatorSchema, value));
  for (const [slug, value] of Object.entries(document.collections ?? {})) await upsertCollection(sql, slug, parseBody(collectionSchema, value));
  const count = (key: keyof typeof document) => Object.keys(document[key] ?? {}).length;
  console.log(`✅ Importé : ${count('programs')} programmes, ${count('themes')} thèmes, ${count('creators')} créateurs, ${count('collections')} collections.`);
} finally {
  await sql.end();
}
