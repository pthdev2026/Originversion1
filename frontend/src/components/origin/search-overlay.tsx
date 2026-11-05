import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, X } from 'lucide-react';
import { searchCatalog, type WatchSuggestion } from '@/lib/watch-catalog';
import { clearRecentSearches, fetchRecentSearches, forgetSearch, rememberSearch, searchPrograms } from '@/lib/search-api';
import { useSession } from '@/features/account/session/session';
import { ApiError } from '@/lib/api';
import { SearchIcon } from '@/components/menu/menu-icons';
import { useRestoreFocus } from '@/lib/use-restore-focus';

type Filter = 'all' | WatchSuggestion['kind'];
const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tout' }, { id: 'film', label: 'Films' }, { id: 'serie', label: 'Séries' }, { id: 'documentaire', label: 'Documentaires' },
];

/**
 * Full-screen search: one large field, type filters, results as a grid of stills (a list on phones).
 * Enter opens the first result.
 */
export function SearchOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const restoreFocus = useRestoreFocus(open);
  const go = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const field = useRef<HTMLInputElement>(null);
  const user = useSession();
  const [remote, setRemote] = useState<{ hits: WatchSuggestion[]; corrected: string | null } | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [failure, setFailure] = useState<{ message: string; ref?: string | undefined } | null>(null);
  const [retry, setRetry] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  useEffect(() => { if (!open) { setQuery(''); setFilter('all'); setRemote(null); setStatus('idle'); } }, [open]);

  // Recherche réelle, anti-rebond de 150 ms ; une réponse arrivée après une frappe plus récente est ignorée.
  const trimmed = query.trim();
  const remoteQuery = trimmed.length >= 2;
  useEffect(() => {
    if (!open || !remoteQuery) { setRemote(null); setStatus('idle'); return undefined; }
    let current = true;
    setStatus('loading');
    const timer = window.setTimeout(() => {
      searchPrograms(trimmed)
        .then(outcome => { if (current) { setRemote(outcome); setStatus('idle'); } })
        .catch((cause: unknown) => { if (!current) return; setRemote(null); setStatus('error'); setFailure(cause instanceof ApiError && cause.isRateLimited ? { message: cause.message, ref: cause.requestId } : { message: 'Service momentanément indisponible. Vérifiez votre connexion, puis réessayez.', ref: cause instanceof ApiError ? cause.requestId : undefined }); });
    }, 150);
    return () => { current = false; window.clearTimeout(timer); };
  }, [open, remoteQuery, trimmed, retry]);

  // Recherches récentes du compte, affichées tant que le champ est vide.
  const email = user?.email ?? null;
  useEffect(() => {
    if (!open || !email) { setRecents([]); return; }
    let current = true;
    fetchRecentSearches().then(list => { if (current) setRecents(list); }).catch(() => undefined);
    return () => { current = false; };
  }, [open, email]);

  const hits = remoteQuery ? remote?.hits ?? [] : searchCatalog(trimmed, 40);
  const results = hits.filter(item => filter === 'all' || item.kind === filter).slice(0, 12);
  const openItem = (item: WatchSuggestion) => { if (user) rememberSearch(trimmed); onOpenChange(false); void go({ to: '/production/$slug', params: { slug: item.id }, search: {} }); };
  const searching = trimmed.length > 0;

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="so-overlay" />
      <Dialog.Content className="so-panel" aria-describedby={undefined}
        // Le champ prend le focus ici (pas par `autoFocus`) : la boîte de dialogue note d'abord l'élément d'où l'on vient,
        // et le lui rend à la fermeture au lieu de laisser le focus tomber sur <body>.
        onCloseAutoFocus={restoreFocus}
        onOpenAutoFocus={event => { event.preventDefault(); field.current?.focus(); }}>
        <div className="so-head">
          <Dialog.Title className="so-title">Rechercher</Dialog.Title>
          <Dialog.Close className="so-close" aria-label="Fermer la recherche"><X /></Dialog.Close>
        </div>
        <label className="so-field">
          <SearchIcon aria-hidden="true" />
          <input ref={field} value={query} onChange={event => setQuery(event.target.value)} placeholder="Un titre, un genre, une histoire…" aria-label="Rechercher un programme"
            onKeyDown={event => { const first = results[0]; if (event.key === 'Enter' && first) openItem(first); }} />
          {searching && <button type="button" className="so-clear" onClick={() => setQuery('')} aria-label="Effacer la recherche"><X /></button>}
        </label>
        <div className="so-filters" role="group" aria-label="Type de programme">
          {filters.map(item => <button key={item.id} type="button" className={filter === item.id ? 'is-on' : ''} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
        </div>
        {!searching && recents.length > 0 && <div className="so-recents" role="group" aria-label="Recherches récentes">
          <span>Récentes</span>
          {recents.map(item => <span key={item} className="so-recent"><button type="button" onClick={() => setQuery(item)}>{item}</button><button type="button" aria-label={`Oublier « ${item} »`} onClick={() => { setRecents(list => list.filter(value => value !== item)); void forgetSearch(item); }}><X aria-hidden="true" /></button></span>)}
          <button type="button" className="so-recents-clear" onClick={() => { setRecents([]); void clearRecentSearches(); }}>Tout effacer</button>
        </div>}
        <p className="so-count" aria-live="polite">{status === 'loading' ? 'Recherche…' : status === 'error' ? '' : searching ? (remote?.corrected ? `Résultats pour « ${remote.corrected} » · ${results.length}` : `${results.length} résultat${results.length > 1 ? 's' : ''}`) : 'Suggestions'}</p>
        {status === 'error' ? <div className="so-empty" role="alert">
            <p>{failure?.message ?? 'Service momentanément indisponible. Vérifiez votre connexion, puis réessayez.'}</p>
            {failure?.ref && <small className="so-ref">Référence : {failure.ref}</small>}
            <button type="button" className="so-retry" onClick={() => setRetry(value => value + 1)}>Réessayer</button>
          </div>
          : results.length
          ? <ul className="so-results">{results.map((item, index) => <li key={item.id} style={{ ['--i' as string]: index }}>
              <button type="button" className="so-result" onClick={() => openItem(item)}>
                <span className="so-still"><img src={item.image} alt="" width={320} height={180} loading="lazy" /></span>
                <span className="so-text"><strong>{item.title}</strong><small>{item.category}</small></span>
                <ArrowUpRight className="so-go" aria-hidden="true" />
              </button>
            </li>)}</ul>
          : <p className="so-empty">Aucune histoire trouvée pour « {query} ». Essayez un autre titre ou un genre.</p>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
