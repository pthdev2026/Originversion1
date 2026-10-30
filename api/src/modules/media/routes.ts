/**
 * Module « media » — distribution des fichiers HLS (playlists, segments, affiche).
 *
 * En production, ce rôle sera tenu par le CDN ; cette route reste l'« origine » qui lui fournit
 * les fichiers (et sert au développement). Elle gère les requêtes partielles (Range) dont le
 * lecteur vidéo a besoin pour avancer dans la vidéo.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { Hono } from 'hono';
import type { Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';
import { isValidId, type StorageLayout } from '../../platform/storage/layout.ts';
import { findPlayableAsset } from '../ingest/repository.ts';
import { verifyMediaToken } from './token.ts';

const CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
};

export function mediaRoutes(deps: { sql: Sql; storage: StorageLayout; mediaSecrets: readonly string[] }): Hono {
  const routes = new Hono();

  routes.get('/media/:token/:id/*', async c => {
    const { token, id: playbackId } = c.req.param();

    // 1. Autorisation : le jeton doit être valide, non expiré, et émis pour CE média.
    if (!isValidId(playbackId) || !verifyMediaToken(deps.mediaSecrets, playbackId, token)) throw errors.forbidden();

    // 2. Le média doit exister et être prêt.
    const asset = await findPlayableAsset(deps.sql, playbackId);
    if (!asset || asset.provider !== 'self') throw errors.notFound(); // un média Mux n'a pas de fichier chez nous

    // 3. Résolution du fichier, sans jamais sortir du dossier du média.
    const prefix = `/media/${token}/${playbackId}/`;
    let requested: string;
    try {
      requested = decodeURIComponent(new URL(c.req.url).pathname.slice(prefix.length));
    } catch {
      throw errors.badRequest('Chemin invalide.'); // pourcentage mal formé : ce n'est pas une panne
    }
    const filePath = deps.storage.resolveHlsFile(asset.storagePath, requested);
    if (!filePath) throw errors.notFound();

    let size: number;
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw errors.notFound();
      size = info.size;
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') throw error;
      throw errors.notFound();
    }

    const headers: Record<string, string> = {
      'Content-Type': CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    };

    // 4. Requête partielle (« donne-moi les octets a à b ») ou fichier entier.
    const range = c.req.header('Range')?.match(/^bytes=(\d*)-(\d*)$/);
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

  return routes;
}
