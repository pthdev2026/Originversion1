// Enregistre dans la base un programme déjà encodé par video-pipeline/.
// Usage : npm run ingest -- <playbackId> --kind film|serie|documentaire --title "Titre" [--program <slug>] [--demo]
//   <playbackId>  nom du dossier dans storage/videos/hls/ (= identifiant de lecture)
//   --program     slug du programme (défaut : le playbackId)
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../src/config/env.ts';
import { registerAsset } from '../src/modules/ingest/repository.ts';
import { connect } from '../src/platform/database/client.ts';
import { StorageLayout } from '../src/platform/storage/layout.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const playbackId = args.find((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'));
const kind = flag('kind');
const title = flag('title');
if (!playbackId || !title || !['film', 'serie', 'documentaire', 'brand'].includes(kind ?? '')) {
  console.error('Usage : npm run ingest -- <playbackId> --kind film|serie|documentaire --title "Titre" [--program <slug>] [--demo]');
  process.exit(1);
}

const config = loadConfig();
const storage = new StorageLayout(config.storageRoot);

interface EncodeMeta {
  source: { width: number; height: number; durationSeconds: number };
  renditions: { name: string; height: number; videoKbps: number }[];
  preset?: string;
  encodeSeconds?: number;
  encodedAt?: string;
}
const meta = JSON.parse(await readFile(path.join(storage.hlsDir(playbackId), 'meta.json'), 'utf8')) as EncodeMeta;

const sql = connect(config.databaseUrl);
try {
  await registerAsset(sql, {
    playbackId,
    programSlug: flag('program') ?? playbackId,
    kind: kind as 'film' | 'serie' | 'documentaire' | 'brand',
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
