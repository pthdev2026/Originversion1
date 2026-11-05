import { Link, useNavigate } from '@tanstack/react-router';
import { useMySpace } from '@/features/account/session/demo-space';
import { useEffect, useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Play, Plus } from 'lucide-react';
import { catalogContents, catalogThemes, themeRailOrder, themeSelection, themeShowcase, type CatalogContent } from '@/lib/origin-catalogs';
import { scrollPageTo } from '@/components/smooth-scroll';
import { useCompact } from '@/lib/use-compact';
import { THEME_EVENT, takeRequestedTheme } from '@/lib/theme-pick';
import { useImageTint } from '@/lib/adaptive';
import { useImmersion } from './use-immersion';
import { RevealWords } from './reveal-words';

const themesOf = () => catalogThemes.filter(theme => theme.id !== 'all'); // lu à l'usage : le catalogue serveur remplace les thèmes après le chargement
const themeTitle = (id: string) => themesOf().find(theme => theme.id === id)?.title ?? '';
/** Tabs of the phone layout: the featured rail order first, then every other theme. */
const compactTabs = () => {
  const featured = themeRailOrder.filter(id => id !== 'tendances');
  return [...featured, ...themesOf().map(theme => theme.id).filter(id => id !== 'tendances' && !featured.includes(id))];
};
const fallbackSynopsis = 'Présentation à venir — contenu de démonstration.';

/**
 * Theme explorer: one section with two states, never a dialog or a new page.
 * « theme » shows the featured content of the selected theme over its backdrop, then the theme selection;
 * « all » swaps that area for the grid of every theme. Picking a theme returns to « theme » with its featured content.
 */
export function ThemeExplorer() {
  const section = useRef<HTMLElement>(null);
  // Choosing a content brings the reader back to the top of the section, where the selection is featured.
  const bringToTop = () => {
    const top = section.current?.getBoundingClientRect().top;
    if (top !== undefined && top < -40) scrollPageTo(top + window.scrollY);
  };
  const track = useRef<HTMLDivElement>(null);
  const tabRow = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'theme' | 'all'>('theme');
  const [themeId, setThemeId] = useState('reconstruction');
  // A theme opened from the grid takes the last rail slot while it is selected, so the selection always stays visible.
  const rail = themeRailOrder.includes(themeId) ? themeRailOrder : [...themeRailOrder.slice(0, -1), themeId];
  // Phones: every theme is a tab of the sliding row (the featured ones first), so nothing hides behind « Toutes les thématiques ».
  const tabs = compactTabs();
  const selection = themeSelection(themeId);
  const [contentId, setContentId] = useState(selection.featured.id);
  const [shown, setShown] = useState<string[]>([selection.featured.id]);
  // « + » saves to « Ma liste » for a signed-in user; a visitor is invited to sign in.
  const { user, space, update } = useMySpace();
  const navigate = useNavigate();
  const [edges, setEdges] = useState({ start: true, end: false, ratio: 1, progress: 0 });
  useImmersion(section);

  const content = catalogContents.find(item => item.id === contentId) ?? selection.featured;
  const compact = useCompact();
  // On phones the glass and the backdrop take the colour of the selected film, like the Hero.
  const tint = useImageTint(content.image, compact);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const position = Math.max(0, selection.contents.findIndex(item => item.id === content.id));
  const onTouchStart = (event: TouchEvent) => { const point = event.touches[0]; touch.current = point ? { x: point.clientX, y: point.clientY } : null; };
  const onTouchEnd = (event: TouchEvent) => {
    const start = touch.current; const point = event.changedTouches[0];
    touch.current = null;
    if (!compact || !start || !point) return;
    const dx = point.clientX - start.x, dy = point.clientY - start.y;
    // A mostly vertical gesture is the page scrolling, not a swipe between the theme's proposals.
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const next = selection.contents[Math.max(0, Math.min(selection.contents.length - 1, position + (dx < 0 ? 1 : -1)))];
      if (next) setContentId(next.id);
    }
  };
  useEffect(() => { setShown(list => list.includes(content.id) ? list : [...list, content.id]); }, [content.id]);

  // The selected tab stays in view in the sliding row.
  const pickedTab = useRef(false);
  useEffect(() => {
    const row = tabRow.current;
    const active = row?.querySelector<HTMLElement>('.tx-chip.is-lit');
    // Only after the reader picks a tab: on arrival the row starts at its first tab.
    if (!compact || !row || !active || !pickedTab.current) return;
    const offset = active.getBoundingClientRect().left - row.getBoundingClientRect().left - (row.clientWidth - active.offsetWidth) / 2;
    row.scrollTo({ left: row.scrollLeft + offset, behavior: 'smooth' });
  }, [themeId, compact]);

  useEffect(() => {
    const open = (id: string | null) => { if (id && themesOf().some(theme => theme.id === id)) pickTheme(id); };
    open(takeRequestedTheme());
    const onRequest = (event: Event) => { open((event as CustomEvent<string>).detail); takeRequestedTheme(); };
    window.addEventListener(THEME_EVENT, onRequest);
    return () => window.removeEventListener(THEME_EVENT, onRequest);
  // pickTheme only sets state: it is safe to call from this single subscription
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickTheme(id: string) {
    pickedTab.current = true;
    setThemeId(id);
    setContentId(themeSelection(id).featured.id);
    setView('theme');
  }

  function updateRail() {
    const element = track.current;
    if (!element) return;
    const max = element.scrollWidth - element.clientWidth;
    setEdges({ start: element.scrollLeft < 8, end: element.scrollLeft > max - 8, ratio: Math.min(1, element.clientWidth / element.scrollWidth), progress: max > 0 ? element.scrollLeft / max : 0 });
  }
  useEffect(() => {
    if (view !== 'theme') return;
    track.current?.scrollTo({ left: 0 });
    updateRail();
  }, [themeId, view]);

  const scrollRail = (direction: 1 | -1) => track.current?.scrollBy({ left: direction * track.current.clientWidth * 0.8, behavior: 'smooth' });
  const inList = Boolean(space?.list.includes(content.id));

  return <section ref={section} id="thematiques" className={`theme-explorer im-section ${view === 'all' ? 'is-all' : ''}`} aria-labelledby="themes-title"
    style={compact && tint ? { '--hg-c1': tint.c1, '--hg-c2': tint.c2, '--hg-c3': tint.c3 } as CSSProperties : undefined}>
    <div className="tx-backdrop" aria-hidden="true">
      {shown.map(id => {
        const item = catalogContents.find(entry => entry.id === id);
        return item && <div key={id} className={`tx-layer ${id === content.id ? 'is-on' : ''}`}><img className="tx-fill" src={item.image} alt="" /><img className="tx-hero" src={item.image} alt="" style={item.focus ? { objectPosition: item.focus } : undefined} /></div>;
      })}
    </div>
    <span className="im-spot" aria-hidden="true" />

    <div className="tx-inner">
      <header className="tx-head">
        <h2 id="themes-title" className="im-words"><RevealWords text="Explorer par thématique" /></h2>
        <p className="tx-lede" data-reveal style={{ '--d': '.25s' } as CSSProperties}>Des films, séries et témoignages pour avancer selon ce que vous traversez.</p>
      </header>

      <div ref={tabRow} className="tx-chips" role="group" aria-label="Thématiques" data-reveal style={{ '--d': '.4s' } as CSSProperties}>
        {(compact ? tabs : rail).map(id => <button key={id} type="button" className={`tx-chip im-tilt im-neon ${view === 'theme' && id === themeId ? 'is-lit' : ''}`} data-tilt="10" aria-pressed={view === 'theme' && id === themeId} onClick={() => pickTheme(id)}>
          <span className="tx-chip-clip"><img src={themeSelection(id).featured.image} alt="" loading="lazy" /></span>
          <span className="im-glare" aria-hidden="true" />
          <span className="tx-chip-label">{themeTitle(id)}</span>
        </button>)}
        {!compact && <button type="button" className={`tx-chip tx-chip-all im-tilt im-neon ${view === 'all' ? 'is-lit' : ''}`} data-tilt="10" aria-pressed={view === 'all'} onClick={() => setView('all')}>
          <span className="tx-chip-label">Toutes les<br />thématiques</span><ArrowUpRight aria-hidden="true" />
        </button>}
      </div>

      {view === 'theme' ? <div className="tx-view">
        <div className="tx-feature-wrap" data-reveal style={{ '--d': '.5s' } as CSSProperties} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div key={content.id} className="tx-feature" aria-live="polite">
            <h3>{content.title}</h3>
            <p className="tx-meta">{content.category}<i aria-hidden="true" />{themeShowcase[themeId]?.subtitle}</p>
            <p className="tx-synopsis">{content.synopsis ?? fallbackSynopsis}</p>
            <div className="tx-actions">
              <Link to="/production/$slug" params={{ slug: content.productionSlug ?? content.id }} search={{}} className="im-cta"><span className="im-cta-icon"><Play fill="currentColor" /></span>Regarder</Link>
              <button type="button" className="im-round" aria-pressed={inList} aria-label={inList ? `Retirer ${content.title} de ma liste` : `Ajouter ${content.title} à ma liste`}
                onClick={() => { if (!user) { void navigate({ to: '/connexion' }); return; } update(current => ({ ...current, list: inList ? current.list.filter(id => id !== content.id) : [...current.list, content.id] })); }}>{inList ? <Check /> : <Plus />}</button>
            </div>
          </div>
        </div>

        {selection.contents.length > 1 && <div className="tx-dots" role="group" aria-label="Autres propositions de cette thématique">
          {selection.contents.map((item, index) => <button key={item.id} type="button" className={index === position ? 'is-on' : ''} aria-label={item.title} aria-current={index === position} onClick={() => setContentId(item.id)}><span /></button>)}
        </div>}

        {!compact && <div data-reveal style={{ '--d': '.6s' } as CSSProperties}>
          <div className="tx-rail-head">
            <p><strong>Quelques contenus de cette thématique</strong><span>{selection.contents.length} vidéos dans cette sélection</span></p>
            <div className="tx-arrows">
              <button type="button" className="im-round" aria-label="Contenus précédents" disabled={edges.start} onClick={() => scrollRail(-1)}><ChevronLeft /></button>
              <button type="button" className="im-round" aria-label="Contenus suivants" disabled={edges.end} onClick={() => scrollRail(1)}><ChevronRight /></button>
            </div>
          </div>
          <div ref={track} className="tx-track" role="list" onScroll={updateRail}>
            {selection.contents.map(item => <ThemeContent key={item.id} content={item} current={item.id === content.id} onSelect={() => { setContentId(item.id); bringToTop(); }} />)}
          </div>
          <div className="tx-progress" aria-hidden="true"><span style={{ width: `${edges.ratio * 100}%`, transform: `translateX(${edges.progress * (1 / edges.ratio - 1) * 100}%)` }} /></div>
        </div>}
      </div> : <div className="tx-view">
        <header className="tx-all-head">
          <h3>Toutes les thématiques</h3>
          <p>Choisissez une thématique pour découvrir sa sélection.</p>
          <small>{themesOf().length} thématiques disponibles</small>
        </header>
        <div className="tx-grid">
          {themesOf().map((theme, index) => <button key={theme.id} type="button" className={`tx-tile im-tilt im-neon ${theme.id === themeId ? 'is-lit' : ''}`} data-tilt="8" style={{ '--i': index } as CSSProperties} onClick={() => { pickTheme(theme.id); section.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
            <span className="tx-tile-clip"><img src={theme.image} alt="" loading="lazy" /></span>
            <span className="im-glare" aria-hidden="true" />
            <span className="tx-tile-label"><strong>{theme.title}</strong><span>{themeShowcase[theme.id]?.subtitle}</span></span>
          </button>)}
        </div>
      </div>}
    </div>
  </section>;
}

function ThemeContent({ content, current, onSelect }: { content: CatalogContent; current: boolean; onSelect: () => void }) {
  return <button type="button" role="listitem" className={`tx-content ${current ? 'is-current' : ''}`} aria-current={current} aria-label={`${content.title}, ${content.category}`} onClick={onSelect}>
    <span className={`tx-content-pic im-tilt im-neon ${current ? 'is-lit' : ''}`} data-tilt="8">
      <span className="tx-content-clip"><img src={content.image} alt={content.imageAlt} loading="lazy" /></span>
      <span className="im-glare" aria-hidden="true" />
      {current ? <span className="tx-content-now">Sélectionné</span> : <span className="tx-content-play" aria-hidden="true"><Play fill="currentColor" /></span>}
    </span>
    <strong>{content.title}</strong>
    <span>{content.category}</span>
  </button>;
}
