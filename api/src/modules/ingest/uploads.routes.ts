/**
 * Envoi de gros fichiers, REPRENABLE — protocole « tus » (https://tus.io), sous /uploads.
 *
 * Pourquoi : un film de 2 h pèse 10 à 20 Go. Si la connexion coupe à 80 %, on ne recommence pas depuis zéro :
 * le client demande « où en es-tu ? » (HEAD) puis reprend à cet octet (PATCH).
 *
 *   POST   /uploads        crée l'envoi (taille + informations de publication)  → 201 + Location
 *   HEAD   /uploads/:id    où en est l'envoi ?                                   → Upload-Offset
 *   PATCH  /uploads/:id    envoie les octets à partir de Upload-Offset            → nouveau Upload-Offset
 *   DELETE /uploads/:id    abandonne l'envoi
 *
 * Réservé aux administrateurs. Quand le dernier octet arrive, le fichier est rangé comme « source » et une
 * tâche d'encodage est créée automatiquement. La TAILLE DU FICHIER sur disque est la vérité : elle ne ment pas
 * même si une coupure a interrompu un envoi en plein milieu.
 */
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Sql } from '../../platform/database/client.ts';
import { AppError, errors } from '../../platform/errors.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { isValidId, type StorageLayout } from '../../platform/storage/layout.ts';
import { freeBytesOf, type FreeBytes } from '../../platform/system/health.ts';
import { requireAdmin } from '../identity/middleware.ts';
import { enqueueJob } from './jobs.repository.ts';
import { findUpload, insertUpload, setUploadOffset, setUploadStatus, type UploadMetadata } from './uploads.repository.ts';

const TUS_VERSION = '1.0.0';
const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi', '.mxf']);

const metadataSchema = z.object({
  filename: z.string().min(1).max(255),
  playbackId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/, 'playbackId invalide (minuscules, chiffres, tirets).'),
  kind: z.enum(['film', 'serie', 'documentaire', 'brand']),
  title: z.string().trim().min(1).max(200),
  programSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/).optional(),
  demo: z.enum(['true', 'false']).optional(),
});

/** Décode l'en-tête `Upload-Metadata` : « clé base64(valeur), clé base64(valeur) ». */
export function parseUploadMetadata(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (header ?? '').split(',')) {
    const [key, value] = part.trim().split(' ');
    if (key) result[key] = value ? Buffer.from(value, 'base64').toString('utf8') : '';
  }
  return result;
}

function tusHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'Tus-Resumable': TUS_VERSION, 'Cache-Control': 'no-store', ...extra };
}

export interface UploadRoutesDeps {
  sql: Sql;
  layout: StorageLayout;
  maxBytes: number;
  preset: string;
  /** Espace libre à CONSERVER après l'envoi et l'encodage. */
  minFreeBytes?: number;
  freeBytes?: FreeBytes;
}

export function uploadRoutes(deps: UploadRoutesDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const active = new Set<string>(); // envois en cours d'écriture sur cette instance

  routes.use('/uploads/*', async (c, next) => {
    requireAdmin(c);
    const version = c.req.header('tus-resumable');
    if (c.req.method !== 'OPTIONS' && version !== TUS_VERSION) {
      return new Response(null, { status: 412, headers: { 'Tus-Version': TUS_VERSION, 'Tus-Resumable': TUS_VERSION } });
    }
    await next();
  });

  routes.post('/uploads', async c => {
    const admin = requireAdmin(c);
    const length = Number(c.req.header('upload-length'));
    if (!Number.isInteger(length) || length <= 0) throw errors.badRequest('Upload-Length requis (octets).');
    if (length > deps.maxBytes) throw errors.tooLarge(`Fichier trop volumineux (maximum ${Math.floor(deps.maxBytes / 1024 ** 3)} Go).`);

    // Espace disque : la source (1×) + le dossier d'encodage (≈ 0,6×) + la marge de sécurité configurée.
    const free = await (deps.freeBytes ?? freeBytesOf)(deps.layout.root).catch(() => null);
    const needed = Math.ceil(length * 1.6) + (deps.minFreeBytes ?? 0);
    if (free !== null && free < needed) {
      throw new AppError('unavailable', 503, `Espace disque insuffisant : ${(needed / 1024 ** 3).toFixed(1)} Go nécessaires, ${(free / 1024 ** 3).toFixed(1)} Go libres.`);
    }

    const parsed = metadataSchema.safeParse(parseUploadMetadata(c.req.header('upload-metadata')));
    if (!parsed.success) throw errors.badRequest(parsed.error.issues[0]?.message ?? 'Métadonnées invalides.');
    const extension = path.extname(parsed.data.filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) throw errors.badRequest(`Format non pris en charge (${[...ALLOWED_EXTENSIONS].join(', ')}).`);

    const metadata: UploadMetadata = {
      playbackId: parsed.data.playbackId,
      programSlug: parsed.data.programSlug ?? parsed.data.playbackId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      isDemo: parsed.data.demo === 'true',
    };
    const id = randomUUID();
    await mkdir(deps.layout.uploadsRoot, { recursive: true });
    await (await open(deps.layout.uploadFile(id), 'w')).close();
    await insertUpload(deps.sql, { id, userId: admin.id, filename: path.basename(parsed.data.filename), sizeBytes: length, metadata });
    return new Response(null, { status: 201, headers: tusHeaders({ Location: `/uploads/${id}`, 'Upload-Offset': '0' }) });
  });

  // Hono traite HEAD avec le gestionnaire GET (en retirant le corps) : c'est ce que le protocole tus attend.
  routes.get('/uploads/:id', async c => {
    const upload = await loadUpload(c.req.param('id'));
    const size = await currentSize(upload.id);
    return new Response(null, { status: 200, headers: tusHeaders({ 'Upload-Offset': String(size), 'Upload-Length': String(upload.sizeBytes) }) });
  });

  routes.patch('/uploads/:id', async c => {
    const upload = await loadUpload(c.req.param('id'));
    if (upload.status !== 'uploading') throw new AppError('conflict', 409, 'Cet envoi est déjà terminé ou abandonné.');
    if (c.req.header('content-type') !== 'application/offset+octet-stream') {
      throw errors.badRequest('Content-Type doit être application/offset+octet-stream.');
    }
    const clientOffset = Number(c.req.header('upload-offset'));
    const size = await currentSize(upload.id);
    if (!Number.isInteger(clientOffset) || clientOffset !== size) {
      throw new AppError('conflict', 409, `Décalage incorrect : le serveur est à l'octet ${size}.`);
    }
    if (!c.req.raw.body) throw errors.badRequest('Corps vide.');
    if (active.has(upload.id)) throw new AppError('conflict', 409, 'Un envoi est déjà en cours pour ce fichier.');

    active.add(upload.id);
    try {
      let received = 0;
      const remaining = upload.sizeBytes - size;
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          received += chunk.length;
          if (received > remaining) callback(new Error('Trop d’octets reçus par rapport à Upload-Length.'));
          else callback(null, chunk);
        },
      });
      try {
        await pipeline(
          Readable.fromWeb(c.req.raw.body as never),
          limiter,
          createWriteStream(deps.layout.uploadFile(upload.id), { flags: 'r+', start: size }),
        );
      } catch (error) {
        // Coupure en cours de route : les octets déjà écrits sont conservés, le client reprendra via HEAD.
        const written = await currentSize(upload.id);
        await setUploadOffset(deps.sql, upload.id, written);
        if (received > remaining) throw errors.tooLarge();
        throw error;
      }

      const newOffset = size + received;
      await setUploadOffset(deps.sql, upload.id, newOffset);
      if (newOffset === upload.sizeBytes) await finalize(upload.id, admin(c).id);
      return new Response(null, { status: 204, headers: tusHeaders({ 'Upload-Offset': String(newOffset) }) });
    } finally {
      active.delete(upload.id);
    }
  });

  routes.delete('/uploads/:id', async c => {
    const upload = await loadUpload(c.req.param('id'));
    if (upload.status === 'uploading') {
      await rm(deps.layout.uploadFile(upload.id), { force: true });
      await setUploadStatus(deps.sql, upload.id, 'aborted');
    }
    return new Response(null, { status: 204, headers: tusHeaders() });
  });

  const admin = (c: Parameters<typeof requireAdmin>[0]) => requireAdmin(c);

  async function loadUpload(rawId: string) {
    if (!isValidId(rawId)) throw errors.notFound('Envoi introuvable.');
    const upload = await findUpload(deps.sql, rawId);
    if (!upload) throw errors.notFound('Envoi introuvable.');
    return upload;
  }

  async function currentSize(uploadId: string): Promise<number> {
    return (await stat(deps.layout.uploadFile(uploadId)).catch(() => null))?.size ?? 0;
  }

  /** Dernier octet reçu : on range le fichier comme « source » et on crée la tâche d'encodage. */
  async function finalize(uploadId: string, adminId: string): Promise<void> {
    const upload = await loadUpload(uploadId);
    const extension = path.extname(upload.filename).toLowerCase();
    const relative = path.join(upload.metadata.playbackId, `original${extension}`);
    const destination = path.join(deps.layout.sourcesRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await rename(deps.layout.uploadFile(uploadId), destination);
    await setUploadStatus(deps.sql, uploadId, 'complete');
    const job = await enqueueJob(deps.sql, {
      id: randomUUID(),
      playbackId: upload.metadata.playbackId,
      programSlug: upload.metadata.programSlug,
      kind: upload.metadata.kind,
      title: upload.metadata.title,
      isDemo: upload.metadata.isDemo,
      sourcePath: relative,
      preset: deps.preset,
      uploadId,
      createdBy: adminId,
    });
    if (!job) throw new AppError('conflict', 409, 'Un encodage est déjà en cours pour ce contenu.');
  }

  return routes;
}
