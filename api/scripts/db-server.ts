// Démarre une instance PostgreSQL 17 locale (binaires embarqués), données dans ../storage/pgdata.
// Usage : npm run db:start   (reste au premier plan ; Ctrl+C pour arrêter proprement)
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.PGDATA_DIR ?? path.join(here, '..', '..', 'storage', 'pgdata'));
const port = Number(process.env.PGPORT ?? 5433);

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
if (firstRun) await pg.initialise();
await pg.start();
if (firstRun) await pg.createDatabase('origin');
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
