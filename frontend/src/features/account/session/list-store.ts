import { useSyncExternalStore } from 'react';
import { api, ApiError } from '@/lib/api';
import { env } from '@/lib/env';
import { onAccountChange, setSessionCounts } from '@/features/account/session/session';
import type { CatalogContent } from '@/lib/origin-catalogs';

/**
 * « Ma liste » RÉELLE : la source de vérité est PostgreSQL (via l'API). Ce module ne garde en mémoire que le miroir du serveur.
 *  - chargé à l'ouverture de session (`GET /api/me/list`), vidé à chaque changement de compte ;
 *  - ajout/retrait OPTIMISTES (l'écran réagit tout de suite), avec RETOUR ARRIÈRE si le serveur refuse ;
 *  - une file par contenu : deux clics rapides sur le même titre sont envoyés dans l'ordre, jamais en parallèle ;
 *  - l'identifiant envoyé est celui capturé au moment du clic.
 */
interface ServerCard { slug: string; title: string; category: string | null; images?: { poster?: string | null; hero?: string | null; alt?: string | null } }
interface ServerListItem { slug: string; addedAt: string; program: ServerCard | null }

let slugs: string[] = [];                 // du plus ancien au plus récent (l'écran inverse pour « récents d'abord »)
let cards = new Map<string, ServerCard>();
let loaded = false;
let error: string | null = null;
let version = 0;
let loadToken = 0;
const listeners = new Set<() => void>();
const queues = new Map<string, Promise<void>>();
const emit = () => { version += 1; listeners.forEach(listener => listener()); };

const absolute = (url: string | null | undefined) => (!url ? '' : url.startsWith('/') && env.apiUrl ? `${env.apiUrl}${url}` : url);

async function load() {
  const token = ++loadToken;
  try {
    const data = await api<{ items: ServerListItem[] }>('GET', '/api/me/list');
    if (token !== loadToken) return;           // réponse tardive d'un compte précédent : ignorée
    const items = [...data.items].reverse();
    slugs = items.map(item => item.slug);
    cards = new Map(items.flatMap(item => (item.program ? [[item.slug, item.program] as const] : [])));
    loaded = true; error = null;
    setSessionCounts({ savedCount: slugs.length });
  } catch (cause) {
    if (token !== loadToken) return;
    loaded = true;
    error = cause instanceof ApiError && cause.isUnauthorized ? null : 'Impossible de charger votre liste pour le moment.';
  }
  emit();
}

onAccountChange(email => {
  loadToken += 1; queues.clear();
  slugs = []; cards = new Map(); loaded = false; error = null;
  emit();
  if (email) void load();
});

function failed(slug: string, cause: unknown, action: 'add' | 'remove', rollback: () => void) {
  rollback();
  error = cause instanceof ApiError
    ? (cause.status === 404 ? 'Ce titre n’est plus disponible.' : cause.status === 400 ? 'Votre liste est pleine (500 titres au plus).' : cause.isUnauthorized ? 'Votre session a expiré : reconnectez-vous.' : cause.message)
    : 'Impossible de mettre à jour votre liste.';
  void slug; void action;
  emit();
}

/** Ajoute ou retire des titres. Optimiste, avec file par contenu et retour arrière. */
export function applyListChange(added: string[], removed: string[]) {
  for (const slug of added) schedule(slug, 'add');
  for (const slug of removed) schedule(slug, 'remove');
}

function schedule(slug: string, action: 'add' | 'remove') {
  const had = slugs.includes(slug);
  if (action === 'add' && had) return;
  if (action === 'remove' && !had) return;
  const previous = [...slugs];
  slugs = action === 'add' ? [...slugs, slug] : slugs.filter(item => item !== slug);
  error = null;
  setSessionCounts({ savedCount: slugs.length });
  emit();
  const run = async () => {
    try {
      await api(action === 'add' ? 'PUT' : 'DELETE', `/api/me/list/${encodeURIComponent(slug)}`);
    } catch (cause) {
      failed(slug, cause, action, () => { slugs = previous; setSessionCounts({ savedCount: slugs.length }); });
    }
  };
  queues.set(slug, (queues.get(slug) ?? Promise.resolve()).then(run));
}

export const dismissListError = () => { if (error) { error = null; emit(); } };
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export const useListVersion = () => useSyncExternalStore(subscribe, () => version, () => 0);
export const useListError = () => useSyncExternalStore(subscribe, () => error, () => null);
export const listSlugs = () => slugs;
export const listVersion = () => version;
export const isListLoaded = () => loaded;
export const useListLoaded = () => useSyncExternalStore(subscribe, () => loaded, () => false);

/** Fiche d'un titre de la liste fournie par le serveur (pour les titres absents du catalogue embarqué). */
export function serverContent(id: string): CatalogContent | undefined {
  const card = cards.get(id);
  if (!card) return undefined;
  return { id: card.slug, title: card.title, category: card.category ?? 'Film', image: absolute(card.images?.poster ?? card.images?.hero), imageAlt: card.images?.alt ?? card.title, themes: [], isDemo: false };
}
