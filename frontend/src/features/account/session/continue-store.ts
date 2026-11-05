import { useSyncExternalStore } from 'react';
import { api, ApiError } from '@/lib/api';
import { onAccountChange, setSessionCounts } from '@/features/account/session/session';
import { toContent, type ServerCard } from '@/lib/catalog-api';
import type { CatalogContent } from '@/lib/origin-catalogs';

/**
 * « Continuer à regarder » RÉEL : miroir de `GET /api/me/continue-watching` (PostgreSQL via l'API).
 * Rafraîchi à l'ouverture de session, après chaque enregistrement de progression et à chaque retour sur la page ;
 * vidé à chaque changement de compte. Retirer / marquer comme vu passent par le serveur, avec retour arrière si refus.
 */
export interface ProgressEntry {
  id: string; label: string; remaining: string; percent: number; series: boolean;
  /** Identifiant de lecture (film ou épisode) et position : de quoi retirer, marquer comme vu ou annuler côté serveur. */
  playbackId?: string; positionSeconds?: number; durationSeconds?: number;
}

interface ServerItem {
  playbackId: string; programSlug: string | null; positionSeconds: number; durationSeconds: number | null; progressRatio: number | null;
  kind: string | null; episode: { number: number; seasonNumber: number } | null;
  /** Fiche du programme fournie par le serveur (visuel, titre…) : plus besoin d'un catalogue embarqué pour afficher la ligne. */
  program?: ServerCard | null;
}

let entries: ProgressEntry[] = [];
let cards = new Map<string, ServerCard>();
let loaded = false;
let version = 0;
let token = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => { version += 1; listeners.forEach(listener => listener()); };

export function toEntry(item: ServerItem): ProgressEntry {
  const duration = item.durationSeconds ?? 0;
  const left = Math.max(0, Math.ceil((duration - item.positionSeconds) / 60));
  return {
    id: item.programSlug ?? item.playbackId,
    label: item.episode ? `Épisode ${item.episode.number} · Saison ${item.episode.seasonNumber}` : 'Film',
    remaining: duration > 0 ? `Il reste ${left} min` : 'En cours',
    percent: Math.round(Math.min(1, Math.max(0, item.progressRatio ?? 0)) * 100),
    series: item.kind === 'serie' || item.episode !== null,
    playbackId: item.playbackId, positionSeconds: item.positionSeconds, durationSeconds: duration,
  };
}

/** Un seul élément par programme (le plus récent), dans l'ordre du serveur (récents d'abord). */
export function toEntries(items: ServerItem[]): ProgressEntry[] {
  const seen = new Set<string>();
  const out: ProgressEntry[] = [];
  for (const item of items) { const entry = toEntry(item); if (!seen.has(entry.id)) { seen.add(entry.id); out.push(entry); } }
  return out;
}

export function refreshContinue(): Promise<void> {
  if (inflight) return inflight;
  const mine = token;
  inflight = (async () => {
    try {
      const data = await api<{ items: ServerItem[] }>('GET', '/api/me/continue-watching?limit=50');
      if (mine !== token) return;                 // réponse tardive d'un compte précédent : ignorée
      entries = toEntries(data.items); loaded = true;
      cards = new Map(data.items.flatMap(item => (item.program ? [[item.program.slug, item.program] as const] : [])));
      setSessionCounts({ inProgressCount: entries.length });
    } catch (cause) {
      if (mine !== token) return;
      loaded = true;
      if (!(cause instanceof ApiError && cause.isUnauthorized)) { /* réseau ou serveur : on garde l'affichage précédent */ }
    } finally { inflight = null; }
    emit();
  })();
  return inflight;
}

onAccountChange(email => {
  token += 1; inflight = null; entries = []; cards = new Map(); loaded = false; emit();
  if (email) void refreshContinue();
});

const without = (id: string) => entries.filter(item => item.id !== id);

/** Retire le programme de « Continuer à regarder » et OUBLIE sa progression. Retour arrière si le serveur refuse. */
export async function forgetProgress(entry: ProgressEntry): Promise<boolean> {
  if (!entry.playbackId) return false;
  const before = entries; entries = without(entry.id); emit();
  try { await api('DELETE', `/api/me/progress/${encodeURIComponent(entry.playbackId)}`); return true; }
  catch { entries = before; emit(); return false; }
}

/** Marque le contenu comme vu : le serveur le considère terminé (il sort de la liste, l'épisode suivant devient la cible). */
export async function markWatched(entry: ProgressEntry): Promise<boolean> {
  if (!entry.playbackId || !entry.durationSeconds) return false;
  const before = entries; entries = without(entry.id); emit();
  try { await api('PUT', `/api/me/progress/${encodeURIComponent(entry.playbackId)}`, { positionSeconds: entry.durationSeconds, durationSeconds: entry.durationSeconds, sentAt: Date.now() }); return true; }
  catch { entries = before; emit(); return false; }
}

/** Annule un retrait / un « vu » : rétablit la position d'origine côté serveur. */
export async function restoreProgress(entry: ProgressEntry): Promise<boolean> {
  if (!entry.playbackId || entry.positionSeconds === undefined) return false;
  try {
    await api('PUT', `/api/me/progress/${encodeURIComponent(entry.playbackId)}`, { positionSeconds: entry.positionSeconds, durationSeconds: entry.durationSeconds ?? undefined, sentAt: Date.now() });
    await refreshContinue();
    return true;
  } catch { return false; }
}

function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export const useContinueVersion = () => useSyncExternalStore(subscribe, () => version, () => 0);
export const continueEntries = () => entries;
export const continueVersion = () => version;
export const isContinueLoaded = () => loaded;

/** Fiche d'un programme en cours (fournie par le serveur avec la ligne), pour les écrans qui affichent son visuel. */
export function continueContent(id: string): CatalogContent | undefined {
  const card = cards.get(id);
  return card ? toContent(card) : undefined;
}
