/** Module « mux » — routes d'administration (voir docs/API-CONTRACT.md). Aucun accès public. */
import { Hono } from 'hono';
import { z } from 'zod';
import { AppError, errors } from '../../platform/errors.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { isValidId } from '../../platform/storage/layout.ts';
import { requireAdmin } from '../identity/middleware.ts';
import type { MuxUploadRow } from './repository.ts';
import type { MuxService } from './service.ts';

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/, 'Identifiant invalide (minuscules, chiffres, tirets).');
const startSchema = z.object({
  playbackId: slug,
  programSlug: slug.optional(),
  kind: z.enum(['film', 'serie', 'documentaire']),
  title: z.string().trim().min(1, 'Titre requis.').max(200),
  demo: z.boolean().optional(),
}).strict();

const present = (row: MuxUploadRow) => ({
  id: row.id,
  playbackId: row.playbackId,
  programSlug: row.programSlug,
  kind: row.kind,
  title: row.title,
  status: row.status,
  error: row.error,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  finishedAt: row.finishedAt?.toISOString() ?? null,
});

export interface MuxRoutesDeps {
  /** `null` : Mux n'est pas configuré sur ce serveur. */
  mux: MuxService | null;
  /** Voie vidéo par défaut du back-office. */
  defaultProvider: 'self' | 'mux';
  playbackPolicy: 'public' | 'signed';
}

export function muxRoutes(deps: MuxRoutesDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const need = (): MuxService => {
    if (!deps.mux) throw errors.unavailable('Mux n’est pas configuré sur ce serveur (MUX_TOKEN_ID et MUX_TOKEN_SECRET).');
    return deps.mux;
  };
  const idOf = (raw: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(raw)) throw errors.badRequest('Identifiant invalide.');
    return raw;
  };

  // Quelle voie le back-office doit-il utiliser pour envoyer une vidéo ?
  routes.get('/api/admin/video-providers', c => {
    requireAdmin(c);
    return c.json({
      default: deps.defaultProvider,
      providers: [
        { id: 'self', label: 'ORIGIN (encodage sur notre serveur, diffusion Bunny ou serveur)', configured: true },
        { id: 'mux', label: 'Mux (préparation et diffusion par Mux)', configured: deps.mux !== null, ...(deps.mux ? { playbackPolicy: deps.playbackPolicy } : {}) },
      ],
    });
  });

  // Démarre un envoi : renvoie l'adresse où le NAVIGATEUR doit envoyer le fichier (PUT, directement chez Mux).
  routes.post('/api/admin/mux/uploads', async c => {
    const admin = requireAdmin(c);
    const mux = need();
    let raw: unknown;
    try { raw = await c.req.json(); } catch { throw errors.badRequest('Corps JSON invalide.'); }
    const parsed = startSchema.safeParse(raw);
    if (!parsed.success) throw errors.badRequest(parsed.error.issues[0]?.message ?? 'Requête invalide.');
    // Mux n'autorise l'envoi que depuis l'origine déclarée : celle du back-office (déjà vérifiée par la protection d'origine de l'API).
    const corsOrigin = c.req.header('origin') ?? '*';
    const { upload, uploadUrl } = await mux.startUpload({
      playbackId: parsed.data.playbackId,
      programSlug: parsed.data.programSlug ?? parsed.data.playbackId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      isDemo: parsed.data.demo ?? false,
      corsOrigin,
      createdBy: admin.id,
    });
    return c.json({ ...present(upload), uploadUrl }, 201);
  });

  routes.get('/api/admin/mux/uploads', async c => {
    requireAdmin(c);
    const mux = need();
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 30) || 30, 1), 100);
    const playbackId = c.req.query('playbackId');
    const program = c.req.query('program');
    if ((playbackId !== undefined && !isValidId(playbackId)) || (program !== undefined && !isValidId(program))) throw errors.badRequest('Filtre invalide.');
    const rows = await mux.list(limit, { ...(playbackId ? { playbackId } : {}), ...(program ? { programSlug: program } : {}) });
    return c.json({ uploads: rows.map(present) });
  });

  // Consulter un envoi le fait avancer (on interroge Mux au passage) : l'écran de suivi n'attend pas le prochain passage du poller.
  routes.get('/api/admin/mux/uploads/:id', async c => {
    requireAdmin(c);
    const mux = need();
    const row = await mux.get(idOf(c.req.param('id')));
    if (!row) throw errors.notFound('Envoi introuvable.');
    return c.json(present(await mux.refresh(row)));
  });

  routes.post('/api/admin/mux/uploads/:id/cancel', async c => {
    requireAdmin(c);
    const mux = need();
    if (!(await mux.cancel(idOf(c.req.param('id'))))) throw new AppError('conflict', 409, 'Cet envoi est déjà terminé ou introuvable.');
    return c.body(null, 204);
  });

  return routes;
}
