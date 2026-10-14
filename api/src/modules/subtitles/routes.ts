/**
 * Module « subtitles » — dépôt (administrateur) et distribution (public) des sous-titres WebVTT.
 *
 * Dépôt sous `/files/subtitles/...` : un fichier de sous-titres d'un film de 2 h dépasse la limite de 64 Ko de
 * `/api/*`, il emprunte donc le même chemin que les envois de fichiers (administrateur, origine de confiance).
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import type { Sql } from '../../platform/database/client.ts';
import { errors } from '../../platform/errors.ts';
import type { AppEnv } from '../../platform/http/types.ts';
import { isValidId, resolveInside, type StorageLayout } from '../../platform/storage/layout.ts';
import { requireAdmin } from '../identity/middleware.ts';
import { deleteTrack, trackExists, upsertTrack } from './repository.ts';

const MAX_VTT_BYTES = 1024 * 1024;
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

/** Vérifie qu'un texte est un WebVTT plausible : en-tête, texte UTF-8, aucune balise de script. */
export function validateVtt(text: string): string | null {
  if (!text.replace(/^﻿/, '').startsWith('WEBVTT')) return 'Le fichier doit commencer par « WEBVTT ».';
  if (text.includes('\u0000')) return 'Caractère nul interdit.';
  if (!/-->/.test(text)) return 'Aucun repère de temps (« --> ») trouvé.';
  if (/<script/i.test(text)) return 'Balise interdite.';
  return null;
}

export function subtitleRoutes(deps: { sql: Sql; storage: StorageLayout }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const fileOf = (playbackId: string, lang: string) => resolveInside(path.join(deps.storage.subtitlesRoot, playbackId), `${lang}.vtt`);
  const params = (playbackId: string, lang: string) => {
    if (!isValidId(playbackId)) throw errors.badRequest('Identifiant de lecture invalide.');
    if (!LANG.test(lang)) throw errors.badRequest('Code de langue invalide (ex. fr, en, es, pt-BR).');
  };

  // Dépôt : corps = le fichier WebVTT brut ; `label` et `default` en paramètres de requête.
  routes.put('/files/subtitles/:playbackId/:lang', async c => {
    requireAdmin(c);
    const { playbackId, lang } = c.req.param();
    params(playbackId, lang);
    const label = (c.req.query('label') ?? lang).trim().slice(0, 60) || lang;
    const declared = Number(c.req.header('content-length') ?? 0);
    if (declared > MAX_VTT_BYTES) throw errors.tooLarge('Fichier de sous-titres trop volumineux (1 Mo au plus).');
    const bytes = Buffer.from(await c.req.arrayBuffer());
    if (bytes.byteLength === 0) throw errors.badRequest('Fichier vide.');
    if (bytes.byteLength > MAX_VTT_BYTES) throw errors.tooLarge('Fichier de sous-titres trop volumineux (1 Mo au plus).');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const problem = validateVtt(text);
    if (problem) throw errors.badRequest(problem);

    const target = fileOf(playbackId, lang);
    if (!target) throw errors.badRequest('Chemin invalide.');
    const known = await upsertTrack(deps.sql, {
      playbackId, lang, label, isDefault: ['1', 'true'].includes(c.req.query('default') ?? ''), byteSize: bytes.byteLength,
    });
    if (!known) throw errors.notFound('Média introuvable : encodez-le avant d’ajouter des sous-titres.');
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, target); // remplacement atomique : jamais de fichier à moitié écrit
    return c.body(null, 204);
  });

  routes.delete('/files/subtitles/:playbackId/:lang', async c => {
    requireAdmin(c);
    const { playbackId, lang } = c.req.param();
    params(playbackId, lang);
    if (!(await deleteTrack(deps.sql, playbackId, lang))) throw errors.notFound('Piste introuvable.');
    const target = fileOf(playbackId, lang);
    if (target) await rm(target, { force: true });
    return c.body(null, 204);
  });

  // Distribution publique (balise <track> du lecteur). Cache d'une heure.
  routes.get('/subtitles/:playbackId/:file', async c => {
    const { playbackId, file } = c.req.param();
    const lang = file.endsWith('.vtt') ? file.slice(0, -4) : '';
    if (!isValidId(playbackId) || !LANG.test(lang)) throw errors.notFound();
    if (!(await trackExists(deps.sql, playbackId, lang))) throw errors.notFound();
    const target = fileOf(playbackId, lang);
    if (!target) throw errors.notFound();
    let body: Buffer;
    try {
      body = await readFile(target);
    } catch {
      throw errors.notFound();
    }
    return new Response(body.toString('utf8'), {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff',
      },
    });
  });

  return routes;
}
