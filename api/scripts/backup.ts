// Sauvegarde complète : base de données + fichiers non régénérables (sources, images, sous-titres), puis rotation.
// Usage : npm run backup      (à planifier chaque nuit : voir docs/EXPLOITATION.md)
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../src/config/env.ts';
import { backupDatabase } from '../src/platform/backup/database.ts';
import { backupFolderName, incrementalCopy, selectBackupsToPrune } from '../src/platform/backup/files.ts';
import { connect } from '../src/platform/database/client.ts';
import { StorageLayout } from '../src/platform/storage/layout.ts';

const config = loadConfig();
const layout = new StorageLayout(config.storageRoot);
const { backupDir, backupPassphrase } = config.ops;

if (!backupPassphrase) {
  console.warn('⚠️  BACKUP_PASSPHRASE absent : la sauvegarde ne sera PAS chiffrée (elle contient des adresses e-mail).');
}
await mkdir(backupDir, { recursive: true });

const sql = connect(config.databaseUrl, { max: 2 });
try {
  const started = Date.now();
  const name = backupFolderName(new Date());
  const manifest = await backupDatabase(sql, path.join(backupDir, name), { passphrase: backupPassphrase ?? undefined });
  const rows = manifest.tables.reduce((total, table) => total + table.rows, 0);
  console.log(`✅ Base : ${manifest.tables.length} tables, ${rows} lignes → ${name}${manifest.encrypted ? ' (chiffrée)' : ''}`);

  for (const [label, source] of [['sources', layout.sourcesRoot], ['images', layout.imagesRoot], ['sous-titres', layout.subtitlesRoot], ['photos de profil', layout.avatarsRoot]] as const) {
    const report = await incrementalCopy(source, path.join(backupDir, 'files', path.basename(source) === 'sources' ? 'videos-sources' : path.basename(source)));
    console.log(`✅ Fichiers (${label}) : ${report.copied} copiés (${(report.bytes / 1024 ** 3).toFixed(2)} Go), ${report.skipped} déjà à jour`);
  }

  const toPrune = selectBackupsToPrune(await readdir(backupDir), { daily: 14, weekly: 8 });
  for (const old of toPrune) await rm(path.join(backupDir, old), { recursive: true, force: true });
  if (toPrune.length > 0) console.log(`🧹 ${toPrune.length} ancienne(s) sauvegarde(s) supprimée(s) (rotation : 14 quotidiennes + 8 hebdomadaires)`);

  console.log(`Terminé en ${Math.round((Date.now() - started) / 1000)} s. Pensez à tester la restauration : npm run backup:verify`);
} finally {
  await sql.end();
}
