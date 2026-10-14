// Met une vidéo en file d'encodage depuis le disque (sans passer par l'envoi HTTP).
// Usage : npm run media:enqueue -- /chemin/film.mp4 --id mon-film --kind film --title "Mon film" [--program slug] [--demo]
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../src/config/env.ts';
import { enqueueJob } from '../src/modules/ingest/jobs.repository.ts';
import { connect } from '../src/platform/database/client.ts';
import { StorageLayout } from '../src/platform/storage/layout.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const file = args.find((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'));
const id = flag('id');
const kind = flag('kind');
const title = flag('title');
if (!file || !id || !title || !['film', 'serie', 'documentaire', 'brand'].includes(kind ?? '') || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(id)) {
  console.error('Usage : npm run media:enqueue -- <fichier> --id <identifiant-de-lecture> --kind film|serie|documentaire|brand --title "Titre" [--program <slug>] [--demo]');
  process.exit(1);
}

const config = loadConfig();
const layout = new StorageLayout(config.storageRoot);
const relative = path.join(id, `original${path.extname(file).toLowerCase()}`);
await mkdir(path.dirname(path.join(layout.sourcesRoot, relative)), { recursive: true });
await copyFile(file, path.join(layout.sourcesRoot, relative));

const sql = connect(config.databaseUrl);
try {
  const job = await enqueueJob(sql, {
    id: randomUUID(), playbackId: id, programSlug: flag('program') ?? id, kind: kind as 'film' | 'serie' | 'documentaire' | 'brand', title,
    isDemo: args.includes('--demo'), sourcePath: relative, preset: config.media.encodePreset, uploadId: null, createdBy: null,
  });
  console.log(job ? `Tâche créée : ${job.id} (${id}). Lancez « npm run worker » si ce n'est pas déjà fait.` : `Un encodage est déjà actif pour « ${id} ».`);
} finally {
  await sql.end();
}
