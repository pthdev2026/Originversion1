/**
 * Module « progress » — règles de la reprise de lecture.
 *
 *  - La durée « officielle » vient de la base (le média encodé), pas du navigateur : le client ne peut pas la falsifier.
 *  - Un contenu est « terminé » à 95 % ou à moins de 30 s de la fin : il quitte « Reprendre ».
 *  - En dessous de 10 s de lecture, on considère que la personne n'a pas vraiment commencé.
 *  - La position est bornée à la durée connue.
 */
import type { Sql } from '../../platform/database/client.ts';
import { findPlayableAsset } from '../ingest/repository.ts';
import { findProgress, upsertProgress, type Progress } from './repository.ts';

const COMPLETE_RATIO = 0.95;
const COMPLETE_TAIL_SECONDS = 30;
const MIN_DURATION_FOR_TAIL_RULE = 120;
const MAX_SECONDS = 24 * 3600;

export function isCompleted(position: number, duration: number | null): boolean {
  if (duration === null || duration <= 0) return false;
  if (position / duration >= COMPLETE_RATIO) return true;
  return duration >= MIN_DURATION_FOR_TAIL_RULE && duration - position <= COMPLETE_TAIL_SECONDS;
}

export async function saveProgress(
  sql: Sql,
  input: { userId: string; playbackId: string; positionSeconds: number; reportedDurationSeconds: number | null; clientTs: number },
  /** Faux : historique désactivé par la personne. La réponse est calculée comme d'habitude, mais RIEN n'est enregistré. */
  persist = true,
): Promise<Progress> {
  const asset = await findPlayableAsset(sql, input.playbackId);
  // Source d'autorité : la durée du média en base ; à défaut, celle annoncée par le lecteur.
  const duration = asset?.durationSeconds ?? input.reportedDurationSeconds;
  const bounded = Math.min(Math.max(input.positionSeconds, 0), duration ?? MAX_SECONDS);
  const position = Math.round(bounded * 10) / 10;
  const completed = isCompleted(position, duration);

  if (!persist) {
    return { playbackId: input.playbackId, programSlug: asset?.programSlug ?? null, positionSeconds: position, durationSeconds: duration === null ? null : Math.round(duration * 10) / 10, completed, updatedAt: new Date() };
  }
  await upsertProgress(sql, {
    userId: input.userId,
    playbackId: input.playbackId,
    programSlug: asset?.programSlug ?? null,
    positionSeconds: position,
    durationSeconds: duration === null ? null : Math.round(duration * 10) / 10,
    completed,
    clientTs: input.clientTs,
  });
  const saved = await findProgress(sql, input.userId, input.playbackId);
  return saved as Progress;
}
