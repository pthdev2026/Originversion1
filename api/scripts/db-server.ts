// Démarre une instance PostgreSQL 17 locale (binaires embarqués), données dans ../storage/pgdata.
// Usage : npm run db:start   (reste au premier plan ; Ctrl+C pour arrêter proprement)
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.PGDATA_DIR ?? path.join(here, '..', '..', 'storage', 'pgdata'));
const port = Number(process.env.PGPORT ?? 5433);

function portInUse(): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

if (await portInUse()) {
  console.log(`PostgreSQL est déjà démarré sur le port ${port} : rien à faire.`);
  console.log('Pour le relancer, arrêtez d’abord l’instance existante (entrée « origin-db » de l’app, ou kill du processus postgres).');
  process.exit(0);
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'origin',
  password: 'origin_dev',
  port,
  persistent: true,
  onLog: () => undefined,
  onError: message => console.error(String(message)),
});

const firstRun = !existsSync(path.join(dataDir, 'PG_VERSION'));
try {
  if (firstRun) await pg.initialise();
  await pg.start();
  if (firstRun) await pg.createDatabase('origin');
} catch (error) {
  console.error('Impossible de démarrer PostgreSQL :', error instanceof Error ? error.message : error ?? 'erreur inconnue');
  process.exit(1);
}
console.log(`PostgreSQL prêt : postgres://origin:***@127.0.0.1:${port}/origin  (données : ${dataDir})`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => undefined, 1 << 30);
