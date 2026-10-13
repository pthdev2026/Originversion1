// Restaure une sauvegarde dans la base configurée (DATABASE_URL). La base cible DOIT être vide.
// Usage : npm run restore -- <nom-du-dossier-de-sauvegarde> --yes
import path from 'node:path';
import { loadConfig } from '../src/config/env.ts';
import { restoreDatabase } from '../src/platform/backup/database.ts';
import { connect } from '../src/platform/database/client.ts';

const config = loadConfig();
const name = process.argv[2];
if (!name || !process.argv.includes('--yes')) {
  console.error('Usage : npm run restore -- <db-AAAAMMJJTHHMMSSZ> --yes\n(la base cible doit être VIDE ; --yes confirme que vous savez ce que vous faites)');
  process.exit(1);
}
const sql = connect(config.databaseUrl, { max: 2 });
try {
  const manifest = await restoreDatabase(sql, path.join(config.ops.backupDir, name), { passphrase: config.ops.backupPassphrase ?? undefined });
  const rows = manifest.tables.reduce((total, table) => total + table.rows, 0);
  console.log(`✅ Restauration terminée : ${manifest.tables.length} tables, ${rows} lignes.`);
} catch (error) {
  console.error('❌ Restauration refusée ou échouée :', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
