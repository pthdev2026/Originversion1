/** Module « playback » — routes HTTP (voir docs/API-CONTRACT.md). */
import { Hono } from 'hono';
import type { Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import type { DeliverySigner } from './delivery.ts';
import { z } from 'zod';
import { requireAdmin } from '../identity/middleware.ts';
import { setMarkers } from '../ingest/repository.ts';
import { isValidId } from '../../platform/storage/layout.ts';
import { issueSessionGrant } from '../analytics/session-token.ts';
import { createPlaybackSession, resolvePlayTarget, type IdentConfig } from './service.ts';

const seconds = z.number().finite().min(0).max(86_400).nullable();
const markersSchema = z.object({ introStart: seconds, introEnd: seconds, creditsStart: seconds }).strict().superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if ((value.introStart === null) !== (value.introEnd === null)) fail('introStart et introEnd vont ensemble.');
  if (value.introStart !== null && value.introEnd !== null && value.introStart >= value.introEnd) fail('L’intro doit finir après son début.');
  if (value.introEnd !== null && value.creditsStart !== null && value.introEnd > value.creditsStart) fail('Le générique ne peut pas commencer avant la fin de l’intro.');
});

export function playbackRoutes(deps: { sql: Sql; signer: DeliverySigner; requireLogin: boolean; ident: IdentConfig; analyticsSecret: string; demoPlaybackOverride: readonly string[] | null }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // Informations de lecture d'un contenu. Pas de média prêt = 404 explicite (« not_available »),
  // jamais de faux contenu.
  routes.get('/api/programs/:id/playback', async c => {
    // Accès : ouvert tant que PLAYBACK_REQUIRES_LOGIN est faux ; sinon un compte connecté est exigé.
    if (deps.requireLogin && !c.get('user')) throw errors.unauthorized('Connectez-vous pour regarder ce programme.');
    const origin = new URL(c.req.url).origin;
    const flag = (name: string): boolean => ['1', 'true'].includes(c.req.query(name) ?? '');
    // MESURE DE DÉMO (temporaire, interdite en production) : le média demandé est remplacé par l'un des médias configurés,
    // choisi de façon stable selon l'identifiant demandé (un même programme lit toujours le même film).
    const requested = c.req.param('id');
    const playbackId = deps.demoPlaybackOverride?.length
      ? (deps.demoPlaybackOverride[[...requested].reduce((sum, char) => sum + char.charCodeAt(0), 0) % deps.demoPlaybackOverride.length] ?? requested)
      : requested;
    if (playbackId !== requested) c.header('x-demo-override', requested);
    const session = await createPlaybackSession(deps.sql, deps.signer, deps.ident, playbackId, {
      userId: c.get('user')?.id ?? null,
      publicOrigin: origin,
      identSeen: flag('identSeen'),
      autoplayNext: flag('autoplay'),
    });
    return c.json({ ...session, analytics: issueSessionGrant(deps.analyticsSecret, session.programId) });
  });

  // Quoi lancer depuis la fiche d'un programme (bouton « Lecture » / « Reprendre » / « Épisode suivant »).
  routes.get('/api/programs/:slug/play-target', async c => {
    if (deps.requireLogin && !c.get('user')) throw errors.unauthorized('Connectez-vous pour regarder ce programme.');
    return c.json(await resolvePlayTarget(deps.sql, c.get('user')?.id ?? null, c.req.param('slug')));
  });

  // Repères de lecture d'un média (intro, générique) — administrateur. Tout à `null` les efface.
  routes.put('/api/admin/media/:playbackId/markers', async c => {
    requireAdmin(c);
    const playbackId = c.req.param('playbackId');
    if (!isValidId(playbackId)) throw errors.badRequest('Identifiant de lecture invalide.');
    let raw: unknown;
    try { raw = await c.req.json(); } catch { throw errors.badRequest('Corps JSON invalide.'); }
    const parsed = markersSchema.safeParse(raw);
    if (!parsed.success) throw errors.badRequest(parsed.error.issues[0]?.message ?? 'Requête invalide.');
    try {
      if (!(await setMarkers(deps.sql, playbackId, { introStartSeconds: parsed.data.introStart, introEndSeconds: parsed.data.introEnd, creditsStartSeconds: parsed.data.creditsStart }))) {
        throw errors.notFound('Média introuvable.');
      }
    } catch (error) {
      if ((error as { code?: string }).code === '23514') throw errors.badRequest('Repères incohérents.');
      throw error;
    }
    return c.body(null, 204);
  });

  return routes;
}
