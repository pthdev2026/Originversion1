/**
 * Module « catalog » — distribution des visuels éditoriaux (affiches, fonds, logos-titres, portraits).
 *
 * Les fichiers vivent dans `storage/images/<slug>/<fichier>` et sont publics : ce sont des visuels de présentation,
 * pas des contenus protégés. Seuls des formats d'image sont servis (pas de SVG : il peut contenir du script).
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { errors } from '../../platform/errors.ts';
import { isValidId, resolveInside, type StorageLayout } from '../../platform/storage/layout.ts';

const IMAGE_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  // Courts extraits de présentation (Hero) : servis avec les requêtes partielles dont Safari a besoin.
  '.mp4': 'video/mp4',
};

export function imageRoutes(deps: { storage: StorageLayout }): Hono {
  const routes = new Hono();

  routes.get('/images/:slug/:file', async c => {
    const { slug, file } = c.req.param();
    const type = IMAGE_TYPES[path.extname(file).toLowerCase()];
    if (!isValidId(slug) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/.test(file) || !type) throw errors.notFound();

    const target = resolveInside(path.join(deps.storage.imagesRoot, slug), file);
    if (!target) throw errors.notFound();
    let size: number;
    try {
      const info = await stat(target);
      if (!info.isFile()) throw new Error('pas un fichier');
      size = info.size;
    } catch {
      throw errors.notFound();
    }
    const headers: Record<string, string> = {
      'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff',
    };
    const range = c.req.header('Range')?.match(/^bytes=(\d*)-(\d*)$/);
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
      return new Response(Readable.toWeb(createReadStream(target, { start, end })) as ReadableStream, {
        status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
      });
    }
    return new Response(Readable.toWeb(createReadStream(target)) as ReadableStream, { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
  });

  return routes;
}
