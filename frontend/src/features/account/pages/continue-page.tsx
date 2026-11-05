import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { CheckCircle2, Play, SkipForward, X } from 'lucide-react';
import { contentById, useMySpace, type ProgressEntry } from '@/features/account/session/demo-space';
import { forgetProgress, markWatched, refreshContinue, restoreProgress } from '@/features/account/session/continue-store';
import { AccountShell } from '@/features/account/pages/account-shell';
import { ConfirmDialog } from '@/features/account/pages/confirm-dialog';
import { ContinueIcon } from '@/components/menu/menu-icons';

/** « Continuer à regarder »: programmes in progress, most recent first, with resume, mark as watched and remove. */
export function ContinuePage() {
  return <AccountShell><ContinueContent /></AccountShell>;
}

function ContinueContent() {
  const { space, update } = useMySpace();
  const [undo, setUndo] = useState<{ entry: ProgressEntry; index: number; message: string } | null>(null);
  const [asking, setAsking] = useState<{ entry: ProgressEntry; title: string } | null>(null);
  useEffect(() => { if (!undo) return; const timer = window.setTimeout(() => setUndo(null), 5000); return () => window.clearTimeout(timer); }, [undo]);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => { void refreshContinue(); }, []); // à chaque retour sur la page : données fraîches du serveur
  if (!space) return null;
  const drop = async (entry: ProgressEntry, message: string, mode: 'forget' | 'watched') => {
    setProblem(null);
    const index = space.progress.findIndex(item => item.id === entry.id);
    const done = mode === 'forget' ? await forgetProgress(entry) : await markWatched(entry);
    if (done) setUndo({ entry, index, message }); else setProblem('Impossible de mettre à jour « Continuer à regarder » pour le moment.');
  };
  const count = space.progress.length;
  return <>
    <div><h1 className="sp-title">Continuer à regarder</h1><p className="sp-sub">{count ? `${count} programme${count > 1 ? 's' : ''} en cours · du plus récent au plus ancien` : 'Aucun programme en cours'}</p></div>
    {count
      ? <ul className="cw-list">{space.progress.map(entry => {
          const content = contentById(entry.id);
          if (!content) return null;
          const slug = content.productionSlug ?? content.id;
          return <li key={entry.id} className="cw-item">
            <Link to="/production/$slug" params={{ slug }} search={{}} className="cw-still" aria-label={`Reprendre ${content.title}`}>
              <img src={content.image} alt={content.imageAlt} loading="lazy" />
              <span className="cw-play" aria-hidden="true"><Play fill="currentColor" /></span>
              <span className="cw-bar" aria-hidden="true"><i style={{ width: `${entry.percent}%` }} /></span>
            </Link>
            <div className="cw-text">
              <span className="cw-kicker">{entry.label}</span>
              <strong>{content.title}</strong>
              <small>{entry.remaining}</small>
              <div className="cw-actions">
                <Link to="/production/$slug" params={{ slug }} search={{}} className="sp-btn"><Play fill="currentColor" aria-hidden="true" />Reprendre</Link>
                <button type="button" className="sp-btn is-ghost" onClick={() => void drop(entry, entry.series ? `« ${content.title} » : l’épisode suivant vous attend` : `« ${content.title} » marqué comme vu`, 'watched')}>{entry.series ? <><SkipForward aria-hidden="true" />Épisode suivant</> : <><CheckCircle2 aria-hidden="true" />Marquer comme vu</>}</button>
                <button type="button" className="sp-btn is-text cw-remove" onClick={() => setAsking({ entry, title: content.title })}><X aria-hidden="true" />Retirer</button>
              </div>
            </div>
          </li>;
        })}</ul>
      : <div className="sp-empty"><strong>Vous êtes à jour</strong><p>Les programmes que vous commencez apparaîtront ici pour reprendre là où vous vous êtes arrêté.</p></div>}
    <ConfirmDialog open={Boolean(asking)} onOpenChange={open => { if (!open) setAsking(null); }} icon={<ContinueIcon />}
      title="Retirer ce programme ?" text={asking ? `« ${asking.title} » quittera « Continuer à regarder » et sa progression sera oubliée.` : ''}
      confirmLabel="Retirer" confirmIcon={<X aria-hidden="true" />} onConfirm={() => { if (asking) void drop(asking.entry, `« ${asking.title} » retiré de la liste`, 'forget'); setAsking(null); }} />
    {undo && <p className="sp-toast" role="status">{undo.message}<button type="button" className="sp-btn" onClick={() => { const entry = undo.entry; setUndo(null); void restoreProgress(entry).then(ok => { if (!ok) setProblem('Impossible d’annuler pour le moment.'); }); }}>Annuler</button></p>}
    {problem && <p className="sp-toast" role="alert">{problem}</p>}
    <p className="sp-note">Un programme apparaît ici dès que vous l’avez commencé et en sort une fois regardé à 95 %.</p>
  </>;
}
