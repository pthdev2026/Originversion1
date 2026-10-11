import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { findPlayableAsset, listPlayablePrograms } from './catalog.ts';
import type { Sql } from './db/client.ts';
import { createMediaToken, verifyMediaToken } from './media-token.ts';

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
};

export interface AppConfig {
  sql: Sql;
  storageDir: string;
  mediaSecret: string;
  ttlSeconds: number;
  corsOrigins?: string[] | undefined;
}

// Résout un chemin demandé à l'intérieur du dossier du programme, sans sortie possible.
export function resolveMediaPath(root: string, programId: string, requested: string): string | null {
  const base = path.resolve(root, programId);
  const target = path.resolve(base, requested);
  return target === base || !target.startsWith(base + path.sep) ? null : target;
}

export function createApp({ sql, storageDir, mediaSecret, ttlSeconds, corsOrigins }: AppConfig): Hono {
  const app = new Hono();

  app.use('*', cors({
    origin: origin => (corsOrigins ? (corsOrigins.includes(origin) ? origin : null) : LOCAL_ORIGIN.test(origin) ? origin : null),
    allowHeaders: ['Range'],
    exposeHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'],
  }));

  app.get('/health', async context => {
    try {
      await sql`SELECT 1`;
      return context.json({ status: 'ok', database: 'ok' });
    } catch {
      return context.json({ status: 'degraded', database: 'unreachable' }, 503);
    }
  });

  // Programmes disposant d'au moins un média prêt.
  app.get('/api/programs', async context => context.json({ programs: await listPlayablePrograms(sql) }));

  // Informations de lecture. Pas de média prêt = 404 explicite, jamais de faux contenu.
  app.get('/api/programs/:id/playback', async context => {
    const playbackId = context.req.param('id');
    const asset = ID_PATTERN.test(playbackId) ? await findPlayableAsset(sql, playbackId) : null;
    if (!asset) return context.json({ error: 'not_available', message: 'Ce programme n’est pas encore disponible à la lecture.' }, 404);

    const { token, expiresAt } = createMediaToken(mediaSecret, asset.playbackId, ttlSeconds);
    const base = `${new URL(context.req.url).origin}/media/${token}/${asset.playbackId}`;
    return context.json({
      programId: asset.playbackId,
      status: 'ready',
      manifestUrl: `${base}/master.m3u8`,
      posterUrl: `${base}/poster.jpg`,
      durationSeconds: asset.durationSeconds,
      renditions: asset.renditions,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    });
  });

  // Distribution des fichiers HLS (playlists, segments) avec requêtes Range.
  app.get('/media/:token/:id/*', async context => {
    const { token, id: playbackId } = context.req.param();
    if (!ID_PATTERN.test(playbackId) || !verifyMediaToken(mediaSecret, playbackId, token)) {
      return context.json({ error: 'forbidden' }, 403);
    }
    const asset = await findPlayableAsset(sql, playbackId);
    if (!asset) return context.json({ error: 'not_found' }, 404);

    const prefix = `/media/${token}/${playbackId}/`;
    const requested = decodeURIComponent(new URL(context.req.url).pathname.slice(prefix.length));
    const filePath = resolveMediaPath(storageDir, asset.storagePath, requested);
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

  return app;
}
