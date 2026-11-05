import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { Camera, Check, Download, KeyRound, Link2, LogOut, Mail, Monitor, Pencil, Send, ShieldCheck, Trash2, Unlink } from 'lucide-react';
import { deleteAccount, renameUser } from '@/features/account/session/demo-session';
import { downloadMyData } from '@/features/account/session/account-export';
import { clearSpace, contentById, useMySpace, type Space } from '@/features/account/session/demo-space';
import { AccountShell } from '@/features/account/pages/account-shell';
import { PhotoDialog } from '@/features/account/profiles/photo-dialog';
import { UserAvatar } from '@/features/account/profiles/user-avatar';

type Rubric = 'profil' | 'securite' | 'appareils' | 'confidentialite';
const rubrics: { id: Rubric; label: string }[] = [
  { id: 'profil', label: 'Profil' }, { id: 'securite', label: 'Connexion & sécurité' }, { id: 'appareils', label: 'Appareils' }, { id: 'confidentialite', label: 'Confidentialité' },
];
const isRubric = (value: string): value is Rubric => rubrics.some(rubric => rubric.id === value);

/** Password strength 0–4, the same scale as the sign-up page. */
const strength = (value: string) => [value.length >= 8, /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;

/** « Mon compte »: profile, sign-in & security, devices and privacy, each reachable by its anchor (/compte#securite…). */
export function AccountPage() {
  return <AccountShell><AccountContent /></AccountShell>;
}

function AccountContent() {
  const { user, space, update } = useMySpace();
  const navigate = useNavigate();
  const [rubric, setRubric] = useState<Rubric>('profil');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { const hash = window.location.hash.slice(1); if (isRubric(hash)) setRubric(hash); }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 3200); return () => window.clearTimeout(timer); }, [toast]);
  if (!user || !space) return null;

  const choose = (id: Rubric) => { setRubric(id); history.replaceState(history.state, '', `#${id}`); };
  return <>
    <section className="ac-head">
      <button type="button" className="ac-avatar-btn" onClick={() => setPhotoOpen(true)} aria-label="Modifier la photo de profil">
        <UserAvatar user={user} avatar={space.avatar} className="ac-avatar" />
        <span className="ac-avatar-badge" aria-hidden="true"><Camera /></span>
      </button>
      <div className="ac-who">
        <h1 className="sp-title">{user.name}</h1>
        <p className="sp-sub">Compte personnel · membre depuis {space.memberSince}</p>
      </div>
      <button type="button" className="sp-btn is-ghost" onClick={() => setPhotoOpen(true)}><Camera aria-hidden="true" />Modifier la photo</button>
    </section>

    <nav className="sp-pills" aria-label="Rubriques du compte">
      {rubrics.map(item => <button key={item.id} type="button" className={`sp-pill ${rubric === item.id ? 'is-on' : ''}`} aria-current={rubric === item.id ? 'true' : undefined} onClick={() => choose(item.id)}>{item.label}</button>)}
    </nav>

    {rubric === 'profil' && <ProfileRubric space={space} name={user.name} email={user.email} onPhoto={() => setPhotoOpen(true)} onSecurity={() => choose('securite')} onSaved={setToast} />}
    {rubric === 'securite' && <SecurityRubric space={space} email={user.email} update={update} onSaved={setToast} />}
    {rubric === 'appareils' && <DevicesRubric space={space} update={update} />}
    {rubric === 'confidentialite' && <PrivacyRubric space={space} update={update} onSaved={setToast} onDeleted={async password => { const email = user.email; const result = await deleteAccount(password); if (result.ok) { clearSpace(email); void navigate({ to: '/' }); } return result; }} />}

    {toast && <p className="sp-toast is-plain" role="status"><Check aria-hidden="true" />{toast}</p>}
    <PhotoDialog open={photoOpen} onOpenChange={setPhotoOpen} current={space.avatar} onSave={avatar => { update(current => ({ ...current, avatar })); setToast(avatar ? 'Photo mise à jour' : 'Photo retirée'); }} />
  </>;
}

const maskEmail = (email: string) => { const [local = '', domain = ''] = email.split('@'); return `${local.slice(0, 1)}•••@${domain}`; };

function ProfileRubric({ space, name, email, onPhoto, onSecurity, onSaved }: { space: Space; name: string; email: string; onPhoto: () => void; onSecurity: () => void; onSaved: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const listed = space.list.map(contentById).filter(Boolean).slice(0, 3);
  const resume = space.progress[0];
  const resumed = resume ? contentById(resume.id) : undefined;
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!value.trim()) return; const done = await renameUser(value); setEditing(false); onSaved(done ? 'Nom mis à jour' : 'Impossible de mettre à jour le nom pour le moment'); };
  return <>
    <section className="ac-section">
      <h2 className="sp-h2">Profil</h2>
      <div className="sp-panel">
        <div className="sp-row"><span className="sp-row-text">Photo de profil<small>{space.avatar ? 'Visible dans la barre du haut et le menu' : 'Vos initiales sont affichées'}</small></span><button type="button" className="sp-btn is-text" onClick={onPhoto}><Pencil aria-hidden="true" />Modifier</button></div>
        <div className="sp-row"><span className="sp-row-text">Nom affiché<small>{name}</small></span>{!editing && <button type="button" className="sp-btn is-text" onClick={() => { setValue(name); setEditing(true); }}><Pencil aria-hidden="true" />Modifier</button>}</div>
        {editing && <form className="sp-row-form" onSubmit={submit}>
          <div className="sp-field"><label htmlFor="ac-name">Nom affiché</label><input id="ac-name" className="sp-input" value={value} maxLength={40} onChange={event => setValue(event.target.value)} autoFocus /></div>
          <div className="sp-actions"><button type="button" className="sp-btn is-ghost" onClick={() => setEditing(false)}>Annuler</button><button type="submit" className="sp-btn" disabled={!value.trim()}><Check aria-hidden="true" />Enregistrer</button></div>
        </form>}
        <div className="sp-row"><span className="sp-row-text">Adresse e-mail<small>{maskEmail(email)}</small></span><button type="button" className="sp-btn is-text" onClick={onSecurity}><ShieldCheck aria-hidden="true" />Gérer</button></div>
      </div>
    </section>
    <section className="ac-shortcuts">
      <Link to="/ma-liste" className="ac-card">
        <span className="ac-card-head"><strong>Ma liste</strong><small>{space.list.length} titre{space.list.length > 1 ? 's' : ''}</small></span>
        {listed.length ? <span className="ac-stills">{listed.map(item => <img key={item!.id} src={item!.image} alt={item!.title} loading="lazy" />)}</span> : <small className="sp-note">Ajoutez des histoires avec le bouton « + ».</small>}
      </Link>
      <Link to="/continuer" className="ac-card">
        <span className="ac-card-head"><strong>Continuer à regarder</strong><small>{space.progress.length} en cours</small></span>
        {resume && resumed ? <><span className="ac-resume"><img src={resumed.image} alt={resumed.title} loading="lazy" /><span className="ac-bar"><i style={{ width: `${resume.percent}%` }} /></span></span><small className="sp-note">{resumed.title} · {resume.label} · {resume.remaining.toLowerCase()}</small></> : <small className="sp-note">Rien en cours pour le moment.</small>}
      </Link>
    </section>
  </>;
}

function SecurityRubric({ space, email, update, onSaved }: { space: Space; email: string; update: (change: (space: Space) => Space) => void; onSaved: (message: string) => void }) {
  const [open, setOpen] = useState<'email' | 'password' | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const level = strength(next);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim());
  const passwordOk = current.length > 0 && level >= 3 && next.length >= 8;
  const close = () => { setOpen(null); setNewEmail(''); setCurrent(''); setNext(''); };
  return <section className="ac-section">
    <div className="sp-panel">
      <div className="sp-row"><span className="sp-row-text">Adresse e-mail<small>{maskEmail(email)} · vérifiée</small></span><button type="button" className="sp-btn is-small" onClick={() => setOpen(open === 'email' ? null : 'email')}><Mail aria-hidden="true" />Modifier</button></div>
      {open === 'email' && <form className="sp-row-form" onSubmit={event => { event.preventDefault(); if (!emailOk) return; close(); onSaved('Code envoyé (démonstration : aucun e-mail n’est envoyé)'); }}>
        <div className="sp-field"><label htmlFor="ac-email">Nouvelle adresse e-mail</label><input id="ac-email" className="sp-input" type="email" placeholder="votre@email.com" value={newEmail} onChange={event => setNewEmail(event.target.value)} autoFocus /></div>
        <p className="sp-note">Un code à 6 chiffres sera envoyé à cette adresse pour la confirmer. Votre adresse actuelle recevra un avertissement.</p>
        <div className="sp-actions"><button type="button" className="sp-btn is-ghost" onClick={close}>Annuler</button><button type="submit" className="sp-btn" disabled={!emailOk}><Send aria-hidden="true" />Envoyer le code</button></div>
      </form>}
      <div className="sp-row"><span className="sp-row-text">Mot de passe<small>Utilisé pour vous connecter avec votre e-mail</small></span><button type="button" className="sp-btn is-small" onClick={() => setOpen(open === 'password' ? null : 'password')}><KeyRound aria-hidden="true" />Modifier</button></div>
      {open === 'password' && <form className="sp-row-form" onSubmit={event => { event.preventDefault(); if (!passwordOk) return; if (signOutOthers) update(space => ({ ...space, devices: space.devices.filter(device => device.current) })); close(); onSaved('Mot de passe mis à jour'); }}>
        <div className="sp-field"><label htmlFor="ac-current">Mot de passe actuel</label><input id="ac-current" className="sp-input" type="password" autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value)} autoFocus /></div>
        <div className="sp-field"><label htmlFor="ac-next">Nouveau mot de passe</label><input id="ac-next" className="sp-input" type="password" autoComplete="new-password" value={next} onChange={event => setNext(event.target.value)} />
          <span className="ac-meter" aria-hidden="true">{[0, 1, 2, 3].map(index => <i key={index} className={index < level ? 'is-on' : ''} />)}</span>
          <p className="sp-note">{['Trop faible', 'Faible', 'Moyen', 'Solide', 'Très solide'][level]} · 8 caractères minimum, une majuscule et un chiffre.</p></div>
        <label className="ac-check"><input type="checkbox" checked={signOutOthers} onChange={event => setSignOutOthers(event.target.checked)} />Déconnecter mes autres appareils</label>
        <div className="sp-actions ac-between"><Link to="/mot-de-passe-oublie" className="sp-btn is-text">Mot de passe oublié ?</Link><span className="sp-actions"><button type="button" className="sp-btn is-ghost" onClick={close}>Annuler</button><button type="submit" className="sp-btn" disabled={!passwordOk}><Check aria-hidden="true" />Enregistrer</button></span></div>
      </form>}
      {(['google', 'apple'] as const).map(provider => {
        const linked = space.providers[provider];
        const name = provider === 'google' ? 'Google' : 'Apple';
        return <div key={provider} className="sp-row"><span className="sp-row-text">{name}<small>{linked ? `Relié · connexion possible avec ${name}` : 'Non relié'}</small></span>
          <button type="button" className={linked ? 'sp-btn is-small' : 'sp-btn'} onClick={() => { update(space => ({ ...space, providers: { ...space.providers, [provider]: !linked } })); onSaved(linked ? `${name} délié` : `${name} relié (démonstration)`); }}>{linked ? <><Unlink aria-hidden="true" />Délier</> : <><Link2 aria-hidden="true" />Relier</>}</button></div>;
      })}
    </div>
    <p className="sp-note">Pour votre sécurité, ces changements redemanderont votre mot de passe si votre connexion date de plus de 15 minutes.</p>
  </section>;
}

function DevicesRubric({ space, update }: { space: Space; update: (change: (space: Space) => Space) => void }) {
  const others = space.devices.some(device => !device.current);
  return <section className="ac-section">
    <div className="sp-panel">
      {space.devices.map(device => <div key={device.id} className="sp-row">
        <span className="ac-device-icon" aria-hidden="true"><Monitor /></span>
        <span className="sp-row-text">{device.name}<small>{device.where}</small></span>
        {device.current ? <span className="ac-current">Cet appareil</span> : <button type="button" className="sp-btn is-small" onClick={() => update(space => ({ ...space, devices: space.devices.filter(item => item.id !== device.id) }))}><LogOut aria-hidden="true" />Déconnecter</button>}
      </div>)}
    </div>
    <div className="sp-actions ac-between">
      <p className="sp-note">Un appareil que vous ne reconnaissez pas ? Déconnectez-le, puis changez votre mot de passe.</p>
      <button type="button" className="sp-btn is-ghost" disabled={!others} onClick={() => update(space => ({ ...space, devices: space.devices.filter(device => device.current) }))}><LogOut aria-hidden="true" />Déconnecter tous les autres</button>
    </div>
  </section>;
}

function PrivacyRubric({ space, update, onSaved, onDeleted }: { space: Space; update: (change: (space: Space) => Space) => void; onSaved: (message: string) => void; onDeleted: (password: string) => Promise<{ ok: true } | { ok: false; error: string }> }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const ready = typed.trim().toUpperCase() === 'SUPPRIMER' && password.length > 0 && !deleting;
  const confirmDelete = async () => { setDeleting(true); setDeleteError(null); const result = await onDeleted(password); setDeleting(false); if (!result.ok) setDeleteError(result.error); };
  return <section className="ac-section">
    <div className="sp-panel">
      <div className="sp-row"><span className="sp-row-text">Historique de visionnage<small>Sert à « Continuer à regarder » et aux recommandations</small></span>
        <button type="button" role="switch" aria-checked={space.history} aria-label="Historique de visionnage" className="sp-switch" onClick={() => update(current => ({ ...current, history: !current.history }))} /></div>
      <div className="sp-row"><span className="sp-row-text">Mes données<small>Une copie de votre compte, de votre liste et de votre historique</small></span>
        <button type="button" className="sp-btn is-small" onClick={() => void downloadMyData().then(result => onSaved(result.message))}><Download aria-hidden="true" />Demander une copie</button></div>
    </div>
    <div className="ac-danger">
      <strong>Supprimer mon compte</strong>
      <p className="sp-note">Votre liste, votre historique et votre photo seront effacés. Cette action est définitive.</p>
      {confirming && <div className="sp-field"><label htmlFor="ac-delete">Tapez SUPPRIMER pour confirmer</label><input id="ac-delete" className="sp-input ac-danger-input" value={typed} onChange={event => setTyped(event.target.value)} autoFocus /></div>}
      {confirming && <div className="sp-field"><label htmlFor="ac-delete-pw">Votre mot de passe (exigé par le serveur)</label><input id="ac-delete-pw" type="password" autoComplete="current-password" className="sp-input ac-danger-input" value={password} onChange={event => setPassword(event.target.value)} /></div>}
      {deleteError && <p className="sp-note" role="alert">{deleteError}</p>}
      <div className="sp-actions" style={{ justifyContent: 'flex-start' }}>
        {confirming
          ? <><button type="button" className={`sp-btn is-danger ${ready ? 'is-ready' : ''}`} disabled={!ready} onClick={() => void confirmDelete()}><Trash2 aria-hidden="true" />Supprimer définitivement</button><button type="button" className="sp-btn is-ghost" onClick={() => { setConfirming(false); setTyped(''); setPassword(''); setDeleteError(null); }}>Annuler</button></>
          : <button type="button" className="sp-btn is-danger" onClick={() => setConfirming(true)}><Trash2 aria-hidden="true" />Supprimer mon compte</button>}
      </div>
    </div>
  </section>;
}
