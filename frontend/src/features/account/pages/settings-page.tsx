import { useEffect, useState, type ReactNode } from 'react';
import { Bell, Captions, Check, Gauge, Languages, Mail, Newspaper, PlayCircle, Accessibility, RotateCcw, SkipForward, Sparkles, Type, Video, type LucideIcon } from 'lucide-react';
import { setLocale, useLocale, type Locale } from '@/lib/locale';
import { defaultPreferences, useMySpace, type Preferences } from '@/features/account/session/demo-space';
import { AccountShell } from '@/features/account/pages/account-shell';

type Row =
  | { kind: 'toggle'; key: keyof Preferences; icon: LucideIcon; label: string; hint: string }
  | { kind: 'choice'; key: keyof Preferences; icon: LucideIcon; label: string; hint: string; options: string[] };
interface Section { id: string; icon: LucideIcon; title: string; text: string; rows: Row[] }

const sections: Section[] = [
  { id: 'lecture', icon: PlayCircle, title: 'Lecture', text: 'Comment les histoires se lancent et s’enchaînent.', rows: [
    { kind: 'toggle', key: 'previews', icon: Video, label: 'Aperçus vidéo automatiques', hint: 'Les bandes-annonces se lancent sans le son au survol' },
    { kind: 'toggle', key: 'nextEpisode', icon: SkipForward, label: 'Épisode suivant automatique', hint: 'Enchaîne la série à la fin d’un épisode' },
    { kind: 'choice', key: 'quality', icon: Gauge, label: 'Qualité vidéo', hint: 'Auto s’adapte à votre connexion', options: ['Auto', 'Éco', 'Haute'] },
    { kind: 'choice', key: 'subtitles', icon: Captions, label: 'Sous-titres', hint: 'Langue affichée par défaut', options: ['Aucun', 'Français', 'English'] },
  ] },
  { id: 'notifications', icon: Bell, title: 'Notifications', text: 'Ce que MILLENIUM vous signale, et par quel canal.', rows: [
    { kind: 'toggle', key: 'newEpisodes', icon: Bell, label: 'Nouveaux épisodes de ma liste', hint: 'Une alerte quand un épisode sort' },
    { kind: 'toggle', key: 'news', icon: Newspaper, label: 'Nouveautés MILLENIUM', hint: 'Les sorties de la semaine' },
    { kind: 'toggle', key: 'emails', icon: Mail, label: 'E-mails', hint: 'Récapitulatif et informations du compte' },
  ] },
  { id: 'accessibilite', icon: Accessibility, title: 'Accessibilité', text: 'Un confort de lecture adapté à vous.', rows: [
    { kind: 'toggle', key: 'reduceMotion', icon: Sparkles, label: 'Réduire les animations', hint: 'Coupe le scroll animé, les néons animés et les aperçus' },
    { kind: 'choice', key: 'subtitleSize', icon: Type, label: 'Taille des sous-titres', hint: 'Lisibilité à l’écran', options: ['Petit', 'Moyen', 'Grand'] },
  ] },
];
const sampleSize: Record<Preferences['subtitleSize'], number> = { Petit: 11, Moyen: 14, Grand: 19 };

/** « Paramètres »: playback, language, notifications and accessibility as frosted-glass sections; every change saves itself. */
export function SettingsPage() {
  return <AccountShell><SettingsContent /></AccountShell>;
}

function SectionCard({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text: string; children: ReactNode }) {
  return <section className="st-card" aria-label={title}>
    <header className="st-head"><span className="st-chip"><Icon aria-hidden="true" /></span><div><h2>{title}</h2><p>{text}</p></div></header>
    <div className="st-rows">{children}</div>
  </section>;
}

function SettingsContent() {
  const { space, update } = useMySpace();
  const locale = useLocale();
  const [saved, setSaved] = useState(0);
  useEffect(() => { if (!saved) return; const timer = window.setTimeout(() => setSaved(0), 2200); return () => window.clearTimeout(timer); }, [saved]);
  if (!space) return null;

  const set = (key: keyof Preferences, value: Preferences[keyof Preferences]) => { update(current => ({ ...current, preferences: { ...current.preferences, [key]: value } })); setSaved(Date.now()); };
  const reset = () => { update(current => ({ ...current, preferences: { ...defaultPreferences } })); setSaved(Date.now()); };
  return <>
    <div className="st-top">
      <div><h1 className="sp-title">Paramètres</h1><p className="sp-sub">Chaque réglage s’enregistre tout seul.</p></div>
      <button type="button" className="st-reset" onClick={reset}><RotateCcw aria-hidden="true" />Réinitialiser</button>
    </div>

    {sections.slice(0, 1).map(section => <SettingsSection key={section.id} section={section} space={space.preferences} set={set} />)}

    <SectionCard icon={Languages} title="Langue" text="La langue des menus, boutons et textes de MILLENIUM.">
      <div className="st-row"><span className="st-ico"><Languages aria-hidden="true" /></span>
        <span className="st-text">Langue de l’interface<small>Pour l’instant, seuls les menus et la navigation sont traduits en anglais ; les contenus restent en français.</small></span>
        <div className="sp-seg" role="group" aria-label="Langue de l’interface">{(['fr', 'en'] as Locale[]).map(code => <button key={code} type="button" lang={code} aria-pressed={locale === code} onClick={() => { setLocale(code); setSaved(Date.now()); }}>{code === 'fr' ? 'Français' : 'English'}</button>)}</div>
      </div>
    </SectionCard>

    {sections.slice(1).map(section => <SettingsSection key={section.id} section={section} space={space.preferences} set={set} />)}
    {saved > 0 && <p className="sp-toast is-plain" role="status"><Check aria-hidden="true" />Préférence enregistrée</p>}
  </>;
}

function SettingsSection({ section, space, set }: { section: Section; space: Preferences; set: (key: keyof Preferences, value: Preferences[keyof Preferences]) => void }) {
  return <SectionCard icon={section.icon} title={section.title} text={section.text}>
    {section.rows.map(row => <div key={row.key} className="st-row">
      <span className="st-ico"><row.icon aria-hidden="true" /></span>
      <span className="st-text">{row.label}<small>{row.hint}</small></span>
      {row.kind === 'toggle'
        ? <button type="button" role="switch" aria-checked={Boolean(space[row.key])} aria-label={row.label} className="sp-switch" onClick={() => set(row.key, !space[row.key])} />
        : <div className="sp-seg" role="group" aria-label={row.label}>{row.options.map(option => <button key={option} type="button" aria-pressed={space[row.key] === option} onClick={() => set(row.key, option as Preferences[keyof Preferences])}>{option}</button>)}</div>}
    </div>)}
    {section.id === 'accessibilite' && <div className="st-preview" aria-hidden="true"><span style={{ fontSize: sampleSize[space.subtitleSize] }}>Quand la foule se tait, une voix répond.</span></div>}
  </SectionCard>;
}
