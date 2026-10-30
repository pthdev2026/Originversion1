// Amorçage de la base de RECETTE : copie le CATALOGUE (jamais les comptes, sessions, progressions ni listes) de la base de
// développement vers la base jetable, avec les médias prêts. Transport en JSON (`jsonb_populate_recordset`) : tous les types de
// colonnes sont conservés tels quels, les déclencheurs de recherche recalculent leurs champs.
// Usage : node scripts/recette/seed-catalog.ts <url-source> <url-cible>
import { connect } from '../../src/platform/database/client.ts';

const [sourceUrl, targetUrl] = process.argv.slice(2);
if (!sourceUrl || !targetUrl) { console.error('Usage : seed-catalog.ts <url-source> <url-cible>'); process.exit(1); }
if (!new URL(targetUrl).pathname.endsWith('origin_recette')) { console.error('Refus : la cible doit être la base jetable origin_recette.'); process.exit(1); }

const source = connect(sourceUrl, { max: 1 });
const target = connect(targetUrl, { max: 1 });
// Ordre imposé par les clés étrangères.
// (`themes.featured_slug` référence `programs` : les thématiques viennent après les programmes.)
const tables = ['programs', 'seasons', 'episodes', 'themes', 'program_themes', 'creators', 'collections', 'collection_items', 'creator_contents'];
try {
  for (const table of tables) {
    const rows = await source.unsafe(`SELECT to_jsonb(t) AS row FROM ${table} t`);
    if (rows.length === 0) continue;
    await target.unsafe(`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)`, [target.json(rows.map(row => row['row']))]);
    console.log(`  ${table}: ${rows.length}`);
  }
  const media = await source.unsafe(`SELECT to_jsonb(m) AS row FROM media_assets m WHERE status = 'ready'`);
  if (media.length > 0) {
    await target.unsafe(`INSERT INTO media_assets SELECT * FROM jsonb_populate_recordset(NULL::media_assets, $1::jsonb) r WHERE r.program_slug IN (SELECT slug FROM programs)`, [target.json(media.map(row => row['row']))]);
    console.log(`  media_assets prêts: ${media.length}`);
  }
} finally {
  await source.end();
  await target.end();
}
