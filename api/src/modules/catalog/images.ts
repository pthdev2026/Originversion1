/**
 * Module « catalog » — distribution des visuels éditoriaux (affiches, fonds, logos-titres, portraits).
 *
 * Les fichiers vivent dans `storage/images/<slug>/<fichier>` et sont publics : ce sont des visuels de présentation,
 * pas des contenus protégés. Seuls des formats d'image sont servis (pas de SVG : il peut contenir du script).
 */
import { createReadStream } from 'node:fs';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { errors } from '../../platform/errors.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { detectImageFormat } from '../../platform/storage/image-format.ts';
import { isValidId, resolveInside, type StorageLayout } from '../../platform/storage/layout.ts';
import { requireAdmin } from '../identity/middleware.ts';

/** Taille maximale d'une image envoyée par l'administration. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export { detectImageFormat };

const IMAGE_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  // Courts extraits de présentation (Hero) : servis avec les requêtes partielles dont Safari a besoin.
  '.mp4': 'video/mp4',
};

export function imageRoutes(deps: { storage: StorageLayout }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // Dépôt d'une image par l'administration (affiche, fond, logo, portrait). Le fichier remplace l'éventuel fichier de même nom.
  // L'URL renvoyée (`/images/<slug>/<fichier>`) se place ensuite dans la fiche du programme (posterUrl, heroUrl…).
  routes.put(
    '/files/images/:slug/:file',
    bodyLimit({ maxSize: MAX_IMAGE_BYTES, onError: () => { throw errors.tooLarge('Image trop volumineuse (10 Mo au plus).'); } }),
    async c => {
      requireAdmin(c);
      const { slug, file } = c.req.param();
      if (!isValidId(slug)) throw errors.badRequest('Identifiant de programme invalide.');
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/.test(file) || file.includes('..')) throw errors.badRequest('Nom de fichier invalide.');
      const extension = path.extname(file).toLowerCase().replace('.', '');
      if (!['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(extension)) throw errors.badRequest('Formats acceptés : jpg, png, webp, avif.');

      const bytes = new Uint8Array(await c.req.arrayBuffer());
      if (bytes.byteLength === 0) throw errors.badRequest('Fichier vide.');
      if (bytes.byteLength > MAX_IMAGE_BYTES) throw errors.tooLarge('Image trop volumineuse (10 Mo au plus).');
      const real = detectImageFormat(bytes);
      if (!real) throw errors.badRequest('Ce fichier n’est pas une image jpg, png, webp ou avif valide.');
      if (real !== (extension === 'jpeg' ? 'jpg' : extension)) {
        throw errors.badRequest(`L’extension « .${extension} » ne correspond pas au contenu réel du fichier (${real}).`);
      }

      const target = resolveInside(path.join(deps.storage.imagesRoot, slug), file);
      if (!target) throw errors.badRequest('Chemin invalide.');
      await mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.${process.pid}.tmp`;
      await writeFile(temporary, bytes);
      await rename(temporary, target); // remplacement atomique : jamais d'image à moitié écrite
      return c.json({ url: `/images/${slug}/${file}`, bytes: bytes.byteLength }, 201);
    },
  );

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
