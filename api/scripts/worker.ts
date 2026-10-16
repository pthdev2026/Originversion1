// Travailleur d'encodage. Usage : npm run worker   (laisser tourner ; Ctrl+C l'arrête proprement)
import { loadConfig } from '../src/config/env.ts';
import { startWorker } from '../src/modules/ingest/worker.ts';
import { DEFAULT_LOUDNESS } from '../src/modules/ingest/pipeline/ffmpeg.ts';
import { checkTools } from '../src/modules/ingest/pipeline/ffmpeg.ts';
import { connect } from '../src/platform/database/client.ts';
import { createLogger } from '../src/platform/logger.ts';
import { StorageLayout } from '../src/platform/storage/layout.ts';
import { BunnyMediaStore, LocalMediaStore } from '../src/platform/storage/media-store.ts';

const config = loadConfig();
const logger = createLogger({ level: config.logLevel, pretty: !config.isProduction });
const tools = { ffmpeg: config.media.ffmpegPath, ffprobe: config.media.ffprobePath };

try {
  await checkTools(tools);
} catch (error) {
  logger.fatal({ err: error, tools }, 'ffmpeg ou ffprobe introuvable : renseignez FFMPEG_PATH et FFPROBE_PATH');
  process.exit(1);
}

const sql = connect(config.databaseUrl, { max: 4 });
try {
  await sql`SELECT 1 FROM media_jobs LIMIT 1`;
} catch {
  logger.fatal('table media_jobs absente : démarrez l’API une fois (elle applique les migrations) ou lancez « npm run db:migrate ».');
  process.exit(1);
}

const layout = new StorageLayout(config.storageRoot);
let store;
if (config.delivery.mode === 'bunny') {
  if (!config.delivery.storageZone || !config.delivery.storageKey) {
    logger.fatal('DELIVERY_MODE=bunny : BUNNY_STORAGE_ZONE et BUNNY_STORAGE_KEY sont obligatoires pour le travailleur.');
    process.exit(1);
  }
  store = new BunnyMediaStore({ host: config.delivery.storageHost, zone: config.delivery.storageZone, accessKey: config.delivery.storageKey });
  logger.info({ zone: config.delivery.storageZone, host: config.delivery.storageHost }, 'publication vers Bunny Storage');
} else {
  store = new LocalMediaStore(layout);
}
const loudness = config.media.loudnessLufs === null ? null : { ...DEFAULT_LOUDNESS, lufs: config.media.loudnessLufs };
logger.info({ loudness }, loudness ? `normalisation du volume activée (${loudness.lufs} LUFS)` : 'normalisation du volume désactivée');
const worker = startWorker({ sql, logger, layout, store, tools, loudness });

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'arrêt demandé : la tâche en cours est remise en file');
  await worker.stop();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
