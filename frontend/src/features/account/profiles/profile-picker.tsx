import { useNavigate } from '@tanstack/react-router';
import { Check, Pencil, Settings2 } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { useSessionStatus } from '@/features/account/session/demo-session';
import { tintVars, useImageTint } from '@/lib/adaptive';
import { AddTile, ProfileTile } from './profile-tile';
import { profileTint } from './profile-tint';
import { useProfiles } from './use-profiles';

/**
 * « Qui regarde ? » — étape entre la connexion et l'accueil.
 * Un cadre de verre contient des carrés : plein = un profil, à lignes = un emplacement libre. Le fond de la page prend la teinte du carré survolé.
 */
export function ProfilePicker() {
  const navigate = useNavigate();
  const status = useSessionStatus();
  const { user, profiles, canAdd } = useProfiles();
  const [managing, setManaging] = useState(false);
  const [lit, setLit] = useState<string | null>(null);

  const current = profiles.find(profile => profile.id === lit) ?? profiles[0];
  const photo = current?.avatar?.kind === 'photo' ? current.avatar.src : undefined;
  const sampled = useImageTint(photo);
  const tint = sampled ?? (current ? profileTint(current) : null);

  useEffect(() => { if (status !== 'loading' && !user) void navigate({ to: '/connexion', replace: true }); }, [status, user, navigate]);
  if (!user || !current) return <main className="pk-page" aria-busy="true" />;

  return <main className="pk-page" style={tintVars(tint, 'pk') as CSSProperties | undefined}>
    <div className="pk-bg" aria-hidden="true">{profiles.map(profile => profile.avatar?.kind === 'photo' && <img key={profile.id} className={profile.id === current.id ? 'is-on' : ''} src={profile.avatar.src} alt="" />)}</div>
    <div className="pk-glass" aria-hidden="true" />
    <p className="pk-wordmark">MILLENIUM</p>
    <section className="pk-stage" aria-labelledby="pk-title">
      <h1 id="pk-title" key={managing ? 'manage' : 'pick'}>{managing ? 'Gérer les profils' : 'Qui regarde ?'}</h1>
      <div className="pk-frame" data-count={profiles.length + (canAdd ? 1 : 0)}>
        {profiles.map((profile, index) => <ProfileTile key={profile.id} profile={profile} index={index} managing={managing} autoFocus={index === 0} onLit={() => setLit(profile.id)} />)}
        {canAdd && <AddTile index={profiles.length} />}
      </div>
      <button type="button" className="pk-manage" aria-pressed={managing} onClick={() => setManaging(value => !value)}>
        <Pencil className="pk-manage-icon" aria-hidden="true" />
        <span className="pk-manage-label">{managing ? 'Terminé' : 'Gérer les profils'}</span>
        <span className="pk-manage-dot" aria-hidden="true">{managing ? <Check /> : <Settings2 />}</span>
      </button>
    </section>
  </main>;
}
