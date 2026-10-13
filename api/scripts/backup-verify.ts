// Prouve qu'une sauvegarde est RESTAURABLE : vérifie les empreintes, la recharge dans un schéma temporaire, compare les
// nombres de lignes, puis supprime le schéma temporaire. La base réelle n'est jamais modifiée.
// Usage : npm run backup:verify [-- <nom-du-dossier-de-sauvegarde>]   (par défaut : la plus récente)
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { loadConfig } from '../src/config/env.ts';
import { restoreDatabase, verifyBackupFiles } from '../src/platform/backup/database.ts';
import { connect } from '../src/platform/database/client.ts';
import { latestBackup } from '../src/platform/system/health.ts';

const config = loadConfig();
const name = process.argv[2] ?? (await latestBackup(config.ops.backupDir))?.name;
if (!name) {
  console.error('Aucune sauvegarde trouvée dans', config.ops.backupDir);
  process.exit(1);
}
const dir = path.join(config.ops.backupDir, name);

const manifest = await verifyBackupFiles(dir);
console.log(`✅ Empreintes : ${manifest.tables.length} fichiers intacts (${name}, créée le ${manifest.createdAt})`);

const schema = `restore_check_${randomBytes(4).toString('hex')}`;
const admin = connect(config.databaseUrl, { max: 1 });
await admin.unsafe(`CREATE SCHEMA ${schema}`);
const scratch = connect(config.databaseUrl, { max: 2, connection: { search_path: schema } });
try {
  const started = Date.now();
  await restoreDatabase(scratch, dir, { passphrase: config.ops.backupPassphrase ?? undefined });
  const rows = manifest.tables.reduce((total, table) => total + table.rows, 0);
  console.log(`✅ Restauration d'essai réussie : ${rows} lignes rechargées et vérifiées en ${Date.now() - started} ms`);
  console.log('La sauvegarde est exploitable.');
} catch (error) {
  console.error('❌ Restauration d’essai échouée :', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await scratch.end();
  await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
}
