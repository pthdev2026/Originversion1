/**
 * Contrôle qualité d'un rendu HLS, AVANT publication.
 *
 * Une vidéo « à moitié encodée » publiée est pire qu'une vidéo absente : le spectateur voit un film
 * qui s'arrête au bout de 40 minutes. On vérifie donc, fichier par fichier, que tout est là et cohérent.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseMediaPlaylist } from './playlist.ts';

export class QcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QcError';
  }
}

export interface RenditionStats {
  segmentCount: number;
  durationSeconds: number;
  totalBytes: number;
  peakBitsPerSecond: number;
  averageBitsPerSecond: number;
}

/** Écart de durée toléré entre la source et un rendu : 2 s, ou 0,5 % pour les longs contenus. */
export function durationTolerance(expectedSeconds: number): number {
  return Math.max(2, expectedSeconds * 0.005);
}

/** Vérifie une qualité : playlist terminée, tous les segments présents et non vides, durée cohérente. */
export async function validateRendition(dir: string, expectedDurationSeconds: number): Promise<RenditionStats> {
  let playlistText: string;
  try {
    playlistText = await readFile(path.join(dir, 'index.m3u8'), 'utf8');
  } catch {
    throw new QcError(`Playlist absente : ${path.basename(dir)}/index.m3u8`);
  }
  const playlist = parseMediaPlaylist(playlistText);
  if (!playlist.ended) throw new QcError(`Playlist non terminée (#EXT-X-ENDLIST manquant) : ${path.basename(dir)}`);
  if (playlist.segments.length === 0) throw new QcError(`Aucun segment : ${path.basename(dir)}`);
  if (!playlist.mapUri) throw new QcError(`Segment d'initialisation non déclaré : ${path.basename(dir)}`);

  let totalBytes = 0;
  let peak = 0;
  let totalDuration = 0;
  const initSize = (await stat(path.join(dir, playlist.mapUri)).catch(() => null))?.size ?? 0;
  if (initSize === 0) throw new QcError(`Segment d'initialisation absent ou vide : ${path.basename(dir)}/${playlist.mapUri}`);
  totalBytes += initSize;

  for (const segment of playlist.segments) {
    const size = (await stat(path.join(dir, segment.uri)).catch(() => null))?.size ?? 0;
    if (size === 0) throw new QcError(`Segment manquant ou vide : ${path.basename(dir)}/${segment.uri}`);
    totalBytes += size;
    totalDuration += segment.duration;
    if (segment.duration > 0) peak = Math.max(peak, (size * 8) / segment.duration);
  }

  const tolerance = durationTolerance(expectedDurationSeconds);
  if (Math.abs(totalDuration - expectedDurationSeconds) > tolerance) {
    throw new QcError(
      `Durée incohérente dans ${path.basename(dir)} : ${totalDuration.toFixed(1)} s au lieu de ${expectedDurationSeconds.toFixed(1)} s (tolérance ${tolerance.toFixed(1)} s)`,
    );
  }

  return {
    segmentCount: playlist.segments.length,
    durationSeconds: totalDuration,
    totalBytes,
    peakBitsPerSecond: Math.round(peak),
    averageBitsPerSecond: Math.round((totalBytes * 8) / totalDuration),
  };
}
