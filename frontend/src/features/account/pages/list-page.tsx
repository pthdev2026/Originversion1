import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { BookmarkMinus, Compass, Play, X } from 'lucide-react';
import { contentById, kindOf, useMySpace, type ListFilter } from '@/features/account/session/demo-space';
import { AccountShell } from '@/features/account/pages/account-shell';
import { ConfirmDialog } from '@/features/account/pages/confirm-dialog';
import { BookmarkIcon } from '@/components/menu/menu-icons';

const filters: { id: ListFilter; label: string }[] = [{ id: 'all', label: 'Tout' }, { id: 'film', label: 'Films' }, { id: 'serie', label: 'Séries' }, { id: 'doc', label: 'Documentaires' }];

/** « Ma liste »: the titles saved with « + », filterable and sortable, removable with an undo. */
export function ListPage() {
  return <AccountShell><ListContent /></AccountShell>;
}

function ListContent() {
  const { space, update } = useMySpace();
  const [filter, setFilter] = useState<ListFilter>('all');
  const [sort, setSort] = useState<'recent' | 'alpha'>('recent');
  const [undo, setUndo] = useState<{ id: string; index: number; title: string } | null>(null);
  // Removing asks first; the undo toast stays as a second safety net.
  const [asking, setAsking] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => { if (!undo) return; const timer = window.setTimeout(() => setUndo(null), 5000); return () => window.clearTimeout(timer); }, [undo]);
  if (!space) return null;

  const items = space.list.map(id => contentById(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const ordered = sort === 'alpha' ? [...items].sort((a, b) => a.title.localeCompare(b.title, 'fr')) : [...items].reverse();
  const shown = ordered.filter(item => filter === 'all' || kindOf(item.category) === filter);
  const remove = (id: string, title: string) => { setUndo({ id, index: space.list.indexOf(id), title }); update(current => ({ ...current, list: current.list.filter(item => item !== id) })); };

  return <>
    <div className="ls-head">
      <div><h1 className="sp-title">Ma liste</h1><p className="sp-sub">{items.length ? `${items.length} titre${items.length > 1 ? 's' : ''}` : 'Aucun titre pour le moment'}</p></div>
      <label className="ls-sort" htmlFor="ls-sort">Trier
        <select id="ls-sort" className="ls-select" value={sort} onChange={event => setSort(event.target.value as 'recent' | 'alpha')}><option value="recent">Ajoutés récemment</option><option value="alpha">A → Z</option></select>
      </label>
    </div>
    <div className="ls-filters" role="group" aria-label="Type de programme">
      {filters.map(item => <button key={item.id} type="button" className={`sp-pill ${filter === item.id ? 'is-on' : ''}`} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
    </div>
    {shown.length
      ? <>
          {(() => {
            const lead = shown[0]!;
            const slug = lead.productionSlug ?? lead.id;
            return <article className="ls-feature">
              <img src={lead.image} alt={lead.imageAlt} />
              <div className="ls-feature-copy">
                <span className="ls-kicker">{sort === 'recent' ? 'Ajouté récemment' : 'Dans votre liste'} · {lead.category}</span>
                <h2>{lead.title}</h2>
                {lead.synopsis && <p>{lead.synopsis}</p>}
                <div className="ls-feature-actions">
                  <Link to="/production/$slug" params={{ slug }} search={{}} className="sp-btn"><Play fill="currentColor" aria-hidden="true" />Regarder</Link>
                  <button type="button" className="sp-btn is-ghost" onClick={() => setAsking({ id: lead.id, title: lead.title })}><BookmarkMinus aria-hidden="true" />Retirer de ma liste</button>
                </div>
              </div>
            </article>;
          })()}
          {shown.length > 1 && <ul className="ls-grid">{shown.slice(1).map(item => <li key={item.id} className="ls-item">
            <Link to="/production/$slug" params={{ slug: item.productionSlug ?? item.id }} search={{}} className="ls-poster" aria-label={`Regarder ${item.title}`}>
              <img src={item.image} alt={item.imageAlt} loading="lazy" />
              <span className="ls-poster-copy"><small>{item.category}</small><strong>{item.title}</strong><span className="ls-watch"><Play fill="currentColor" aria-hidden="true" />Regarder</span></span>
            </Link>
            <button type="button" className="ls-remove" aria-label={`Retirer ${item.title} de ma liste`} onClick={() => setAsking({ id: item.id, title: item.title })}><X /></button>
          </li>)}</ul>}
        </>
      : <div className="sp-empty"><strong>{items.length ? 'Aucun titre de ce type' : 'Rien ici pour le moment'}</strong><p>Ajoutez des histoires avec le bouton « + » pour les retrouver ici.</p><Link to="/" hash="thematiques" className="sp-btn"><Compass aria-hidden="true" />Explorer par thématique</Link></div>}
    <ConfirmDialog open={Boolean(asking)} onOpenChange={open => { if (!open) setAsking(null); }} icon={<BookmarkIcon />}
      title="Retirer de votre liste ?" text={asking ? `« ${asking.title} » ne sera plus dans Ma liste. Vous pourrez l’y remettre à tout moment avec le bouton « + ».` : ''}
      confirmLabel="Retirer" confirmIcon={<BookmarkMinus aria-hidden="true" />} onConfirm={() => { if (asking) remove(asking.id, asking.title); setAsking(null); }} />
    {undo && <p className="sp-toast" role="status">« {undo.title} » retiré de votre liste<button type="button" className="sp-btn" onClick={() => { update(current => { const list = [...current.list]; list.splice(Math.min(undo.index, list.length), 0, undo.id); return { ...current, list }; }); setUndo(null); }}>Annuler</button></p>}
  </>;
}
