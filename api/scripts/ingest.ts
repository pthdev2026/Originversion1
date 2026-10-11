// Enregistre dans la base un programme déjà encodé par video-pipeline.
// Usage : npm run ingest -- <dossier-hls> --kind film|serie|documentaire --title "Titre" [--program <slug>] [--demo]
//   <dossier-hls> = nom du dossier dans storage/hls (= identifiant de lecture)
//   --program     slug du programme (défaut : identifiant de lecture)
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerAsset } from '../src/catalog.ts';
import { connect } from '../src/db/client.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const storageDir = path.resolve(process.env.STORAGE_DIR ?? path.join(here, '..', '..', 'storage', 'hls'));

const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const playbackId = args.find(arg => !arg.startsWith('--') && args[args.indexOf(arg) - 1]?.startsWith('--') !== true);
const kind = flag('kind');
const title = flag('title');
if (!playbackId || !title || !['film', 'serie', 'documentaire'].includes(kind ?? '')) {
  console.error('Usage : npm run ingest -- <dossier-hls> --kind film|serie|documentaire --title "Titre" [--program <slug>] [--demo]');
  process.exit(1);
}

const meta = JSON.parse(await readFile(path.join(storageDir, playbackId, 'meta.json'), 'utf8')) as {
  source: { width: number; height: number; durationSeconds: number };
  renditions: { name: string; height: number; videoKbps: number }[];
  preset?: string;
  encodeSeconds?: number;
  encodedAt?: string;
};

const sql = connect();
try {
  await registerAsset(sql, {
    playbackId,
    programSlug: flag('program') ?? playbackId,
    kind: kind as 'film' | 'serie' | 'documentaire',
    title,
    storagePath: playbackId,
    durationSeconds: meta.source.durationSeconds,
    sourceWidth: meta.source.width,
    sourceHeight: meta.source.height,
    renditions: meta.renditions.map(({ name, height, videoKbps }) => ({ name, height, videoKbps })),
    preset: meta.preset ?? null,
    encodeSeconds: meta.encodeSeconds ?? null,
    encodedAt: meta.encodedAt ?? null,
    isDemo: args.includes('--demo'),
  });
  console.log(`Enregistré : ${playbackId} (${title})`);
} finally {
  await sql.end();
}
