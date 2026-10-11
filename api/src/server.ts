import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { connect } from './db/client.ts';
import { migrate } from './db/migrate.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR ?? path.join(here, '..', '..', 'storage', 'hls'));
const TTL_SECONDS = Number(process.env.MEDIA_TTL_SECONDS ?? 4 * 60 * 60);

if (process.env.NODE_ENV === 'production' && !process.env.MEDIA_SECRET) {
  throw new Error('MEDIA_SECRET est obligatoire en production.');
}
// En développement sans secret : un secret aléatoire par démarrage (les jetons expirent au redémarrage).
const mediaSecret = process.env.MEDIA_SECRET ?? randomBytes(32).toString('hex');
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map(origin => origin.trim()).filter(Boolean);

const sql = connect();
try {
  const applied = await migrate(sql);
  if (applied.length) console.log(`Migrations appliquées : ${applied.join(', ')}`);
} catch (error) {
  console.error('Base de données injoignable. Lancez « npm run db:start » dans un autre terminal.');
  console.error((error as Error).message);
  process.exit(1);
}

const app = createApp({ sql, storageDir: STORAGE_DIR, mediaSecret, ttlSeconds: TTL_SECONDS, corsOrigins });
const server = serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, info => {
  console.log(`ORIGIN API : http://127.0.0.1:${info.port}  (médias : ${STORAGE_DIR})`);
});

async function shutdown() {
  server.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
