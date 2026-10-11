import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMediaToken, verifyMediaToken } from './media-token.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR ?? path.join(here, '..', '..', 'storage', 'hls'));
const TTL_SECONDS = Number(process.env.MEDIA_TTL_SECONDS ?? 4 * 60 * 60);
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

if (process.env.NODE_ENV === 'production' && !process.env.MEDIA_SECRET) {
  throw new Error('MEDIA_SECRET est obligatoire en production.');
}
// En développement sans secret : un secret aléatoire par démarrage (les jetons expirent au redémarrage).
const MEDIA_SECRET = process.env.MEDIA_SECRET ?? randomBytes(32).toString('hex');

const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map(origin => origin.trim()).filter(Boolean);
const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
};

interface RenditionMeta { index: number; name: string; height: number; videoKbps: number; audioKbps: number }
interface ProgramMeta { id: string; source: { durationSeconds: number }; renditions: RenditionMeta[] }

async function readMeta(programId: string): Promise<ProgramMeta | null> {
  if (!ID_PATTERN.test(programId)) return null;
  try {
    return JSON.parse(await readFile(path.join(STORAGE_DIR, programId, 'meta.json'), 'utf8')) as ProgramMeta;
  } catch {
    return null;
  }
}

// Résout un chemin demandé à l'intérieur du dossier du programme, sans sortie possible.
export function resolveMediaPath(root: string, programId: string, requested: string): string | null {
  const base = path.resolve(root, programId);
  const target = path.resolve(base, requested);
  return target === base || !target.startsWith(base + path.sep) ? null : target;
}

export const app = new Hono();

app.use('*', cors({
  origin: origin => (allowedOrigins ? (allowedOrigins.includes(origin) ? origin : null) : localOrigin.test(origin) ? origin : null),
  allowHeaders: ['Range'],
  exposeHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'],
}));

app.get('/health', context => context.json({ status: 'ok' }));

// Informations de lecture d'un programme. Aucune vidéo disponible = 404 explicite, jamais de faux contenu.
app.get('/api/programs/:id/playback', async context => {
  const programId = context.req.param('id');
  const meta = await readMeta(programId);
  if (!meta) return context.json({ error: 'not_available', message: 'Ce programme n’est pas encore disponible à la lecture.' }, 404);

  const { token, expiresAt } = createMediaToken(MEDIA_SECRET, programId, TTL_SECONDS);
  const origin = new URL(context.req.url).origin;
  const base = `${origin}/media/${token}/${programId}`;
  return context.json({
    programId,
    status: 'ready',
    manifestUrl: `${base}/master.m3u8`,
    posterUrl: `${base}/poster.jpg`,
    durationSeconds: meta.source.durationSeconds,
    renditions: meta.renditions.map(({ name, height, videoKbps }) => ({ name, height, videoKbps })),
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  });
});

// Distribution des fichiers HLS (playlists, segments) avec requêtes Range.
app.get('/media/:token/:id/*', async context => {
  const { token, id: programId } = context.req.param();
  if (!ID_PATTERN.test(programId) || !verifyMediaToken(MEDIA_SECRET, programId, token)) {
    return context.json({ error: 'forbidden' }, 403);
  }
  const prefix = `/media/${token}/${programId}/`;
  const requested = decodeURIComponent(new URL(context.req.url).pathname.slice(prefix.length));
  const filePath = resolveMediaPath(STORAGE_DIR, programId, requested);
  if (!filePath) return context.json({ error: 'not_found' }, 404);

  let size: number;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return context.json({ error: 'not_found' }, 404);
    size = info.size;
  } catch {
    return context.json({ error: 'not_found' }, 404);
  }

  const headers: Record<string, string> = {
    'Content-Type': CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  };

  const range = context.req.header('Range')?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    }
    const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    });
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, info => {
    console.log(`ORIGIN API : http://127.0.0.1:${info.port}  (médias : ${STORAGE_DIR})`);
  });
}
