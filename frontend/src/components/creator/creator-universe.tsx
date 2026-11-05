import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, MessageCircle, Mic, MonitorPlay, Play, Plus, Radio } from 'lucide-react';
import { creatorKindLabel, creatorUniverses, getCreatorUniverse, type CreatorContent, type CreatorContentKind, type CreatorUniverse } from '@/lib/creator-universes';

type Section = 'all' | CreatorContentKind | 'lore';
const KIND_ORDER: CreatorContentKind[] = ['message', 'conference', 'serie', 'live'];
const KIND_PLURAL: Record<CreatorContentKind, string> = { message: 'Messages', conference: 'Conférences', serie: 'Séries', live: 'En direct' };
const KIND_ICON = { message: MessageCircle, conference: Mic, serie: MonitorPlay, live: Radio } satisfies Record<CreatorContentKind, unknown>;
const SWAP_MS = 380;
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const kindsOf = (universe: CreatorUniverse) => KIND_ORDER.filter(kind => universe.contents.some(item => item.kind === kind));
/** « Univers » shows one highlight per category: the featured content first, then the first of each other category. */
function highlightsOf(universe: CreatorUniverse) {
  const featured = universe.contents.find(item => item.highlight === 'À la une') ?? universe.contents[0];
  return [featured, ...kindsOf(universe).filter(kind => kind !== featured?.kind).map(kind => universe.contents.find(item => item.kind === kind))]
    .filter((item): item is CreatorContent => Boolean(item));
}

/**
 * Creator universe, built like a game character screen. Each content category exists once: as a portal around the
 * podium (desktop) and as a tab. Opening a category anchors the page on the detail card, which becomes a carousel of
 * that category, so every content appears a single time and the next one is a swipe, trackpad gesture or arrow away.
 */
export function CreatorUniverseScreen({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const root = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(slug);
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle');
  const [section, setSection] = useState<Section>('all');
  const [position, setPosition] = useState(0);
  const [stuck, setStuck] = useState(false);
  const [followed, setFollowed] = useState<Set<string>>(() => new Set());
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const universe = getCreatorUniverse(shown) ?? creatorUniverses[0]!;
  const index = creatorUniverses.indexOf(universe);
  const kinds = kindsOf(universe);
  const items = section === 'all' ? highlightsOf(universe) : section === 'lore' ? [] : universe.contents.filter(item => item.kind === section);
  const current = items[position];
  const litKind = section === 'all' ? current?.kind : section;
  const sections: { id: Section; label: string }[] = [{ id: 'all', label: 'Univers' }, ...kinds.map(kind => ({ id: kind, label: KIND_PLURAL[kind] })), { id: 'lore', label: 'Histoire' }];

  // Route change → light beam, swap, materialize.
  useEffect(() => {
    if (slug === shown) return;
    if (reduced()) { setShown(slug); setSection('all'); setPosition(0); return; }
    setPhase('out');
    const swap = window.setTimeout(() => { setShown(slug); setSection('all'); setPosition(0); setPhase('in'); }, SWAP_MS);
    return () => window.clearTimeout(swap);
  }, [slug, shown]);
  useEffect(() => {
    if (phase !== 'in') return;
    const settle = window.setTimeout(() => setPhase('idle'), 1100);
    return () => window.clearTimeout(settle);
  }, [phase]);

  const goCreator = (step: number) => void navigate({ to: '/createur/$slug', params: { slug: creatorUniverses[(index + step + creatorUniverses.length) % creatorUniverses.length]!.creator.id } });
  const watch = (content: CreatorContent | undefined) => { if (content) void navigate({ to: '/production/$slug', params: { slug: content.id }, search: {} }); };
  /** Anchor effect: a section opens on the content card, scrolling to it when needed and lighting it up. */
  const open = (next: Section) => {
    setSection(next); setPosition(0);
    const strip = tabsRef.current, active = strip?.querySelector<HTMLElement>(`[data-section="${next}"]`);
    if (strip && active && strip.scrollWidth > strip.clientWidth) strip.scrollTo({ left: active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2, behavior: reduced() ? 'auto' : 'smooth' });
    const target = card.current;
    if (!target) return;
    const box = target.getBoundingClientRect(), header = root.current?.querySelector('.cu-top')?.getBoundingClientRect().height ?? 0;
    const offset = box.top - header - 16;
    if (Math.abs(offset) > 8) window.scrollTo({ top: Math.max(0, window.scrollY + offset), behavior: reduced() ? 'auto' : 'smooth' });
    target.classList.remove('is-targeted'); void target.offsetWidth; target.classList.add('is-targeted');
  };

  // Gamepad-like keyboard: ← → creator, ↑ ↓ content, Q / E sections, Entrée watch, Échap back.
  const keys = useRef({ goCreator, watch, open, items, position, section, current, sections });
  keys.current = { goCreator, watch, open, items, position, section, current, sections };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const k = keys.current;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select')) return;
      const key = event.key.toLowerCase();
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { if (target?.closest('.cu-track')) return; event.preventDefault(); k.goCreator(event.key === 'ArrowRight' ? 1 : -1); }
      else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && k.items.length > 1) { event.preventDefault(); setPosition(Math.max(0, Math.min(k.items.length - 1, k.position + (event.key === 'ArrowDown' ? 1 : -1)))); }
      else if (event.key === 'Enter' && !target?.closest('a, button')) { event.preventDefault(); k.watch(k.current); }
      else if (event.key === 'Escape') void navigate({ to: '/', hash: 'createurs' });
      else if (key === 'q' || key === 'e') {
        const at = k.sections.findIndex(s => s.id === k.section);
        k.open(k.sections[(at + (key === 'e' ? 1 : -1) + k.sections.length) % k.sections.length]!.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
  // Sticky HUD, pointer depth and drifting light motes.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const onScroll = () => setStuck(window.scrollY > 8);
    // At most once per frame: these variables restyle the whole page.
    let last: PointerEvent | null = null, moveFrame = 0;
    const onMove = (event: PointerEvent) => {
      last = event;
      if (moveFrame) return;
      moveFrame = requestAnimationFrame(() => {
        moveFrame = 0;
        if (!last) return;
        element.style.setProperty('--mx', String((last.clientX / window.innerWidth - 0.5) * 2));
        element.style.setProperty('--my', String((last.clientY / window.innerHeight - 0.5) * 2));
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    if (!reduced()) element.addEventListener('pointermove', onMove);
    const canvas = element.querySelector<HTMLCanvasElement>('.cu-dust');
    const context = canvas?.getContext('2d');
    let frame = 0, width = 0, height = 0;
    let motes: { x: number; y: number; r: number; v: number; o: number }[] = [];
    const size = () => {
      if (!canvas || !context) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth; height = canvas.clientHeight;
      canvas.width = width * ratio; canvas.height = height * ratio; context.setTransform(ratio, 0, 0, ratio, 0, 0);
      motes = Array.from({ length: Math.round((width * height) / 16000) }, () => ({ x: Math.random() * width, y: Math.random() * height, r: Math.random() * 1.4 + 0.3, v: Math.random() * 0.25 + 0.05, o: Math.random() * 0.5 + 0.15 }));
    };
    const tick = () => {
      if (!context) return;
      context.clearRect(0, 0, width, height);
      const accent = getComputedStyle(element).getPropertyValue('--cu-acc').trim().replace(/ /g, ', ') || '196, 222, 255';
      for (const mote of motes) {
        mote.y -= mote.v; mote.x += Math.sin((mote.y + mote.r * 100) / 60) * 0.15;
        if (mote.y < -5) { mote.y = height + 5; mote.x = Math.random() * width; }
        context.beginPath(); context.arc(mote.x, mote.y, mote.r, 0, 7); context.fillStyle = `rgba(${accent}, ${mote.o})`; context.fill();
      }
      frame = requestAnimationFrame(tick);
    };
    if (!reduced()) { size(); window.addEventListener('resize', size); tick(); }
    return () => { window.removeEventListener('scroll', onScroll); element.removeEventListener('pointermove', onMove); window.removeEventListener('resize', size); cancelAnimationFrame(frame); cancelAnimationFrame(moveFrame); };
  }, []);

  const isFollowed = followed.has(universe.creator.id);
  const maxCount = Math.max(1, ...kinds.map(kind => universe.contents.filter(item => item.kind === kind).length));
  const sibling = (step: number) => creatorUniverses[(index + step + creatorUniverses.length) % creatorUniverses.length]!;
  const shortName = (u: CreatorUniverse) => u.creator.name.replace(/^(Apôtre|Pasteur)\s+/, '');
  const portal = (kind: CreatorContentKind) => {
    const list = universe.contents.filter(item => item.kind === kind);
    return <button key={kind} type="button" className={`cu-portal ${litKind === kind ? 'is-on' : ''}`} aria-pressed={section === kind} onClick={() => open(kind)}>
      <span className={`cu-portal-pic im-neon ${litKind === kind ? 'is-lit' : ''}`}><img src={list[0]!.image} alt="" loading="lazy" />{kind === 'live' && <span className="cu-live" aria-hidden="true" />}</span>
      <span className="cu-portal-label"><strong>{KIND_PLURAL[kind]}</strong></span>
    </button>;
  };
  const half = Math.ceil(kinds.length / 2);

  return <main ref={root} className={`creator-universe im-section ${phase !== 'idle' ? `is-${phase}` : ''}`}>
    <div className="cu-world" aria-hidden="true">
      <div className="cu-world-beam" /><div className="cu-world-floor" />
      <canvas className="cu-dust" /><div className="cu-world-vignette" />
    </div>

    <header className={`cu-top ${stuck ? 'is-stuck' : ''}`}>
      <nav ref={tabsRef} className="cu-tabs" aria-label="Dans cet univers">
        {sections.map(s => <button key={s.id} type="button" data-section={s.id} className={`cu-tab ${section === s.id ? 'is-on' : ''}`} aria-pressed={section === s.id} onClick={() => open(s.id)}>{s.label}</button>)}
      </nav>
    </header>

    <aside className="cu-roster" aria-label="Choisir un créateur">
      {creatorUniverses.map(u => <Link key={u.creator.id} to="/createur/$slug" params={{ slug: u.creator.id }} aria-current={u === universe ? 'page' : undefined}
        className={`cu-rost ${u === universe ? 'is-on' : ''}`} title={u.creator.name}>
        <span className={`cu-rost-pic im-neon ${u === universe ? 'is-lit' : ''}`}><img src={u.creator.image} alt="" style={{ objectPosition: u.creator.focus }} /></span>
        <span className="cu-rost-name">{(([first, ...rest]) => <>{first}<br />{rest.join(' ')}</>)(u.creator.name.replace(/^(Apôtre|Pasteur)\s+/, '').split(' '))}</span>
      </Link>)}
    </aside>

    <section className="cu-profile">
      <div className="cu-profile-head">
        <span className="cu-crumb">{universe.alias} · {universe.domain}</span>
        <ScrambleTitle text={universe.creator.name.replace(/^(Apôtre|Pasteur)\s+/, '')} />
      </div>
      <div className="cu-profile-body">
        <p className="cu-desc">{universe.tagline}</p>
        <ul className="cu-attrs" aria-label="Contenus par rubrique">
          {kinds.map(kind => { const Icon = KIND_ICON[kind]; const n = universe.contents.filter(item => item.kind === kind).length; return <li key={kind}>
            <button type="button" className={section === kind ? 'is-on' : ''} onClick={() => open(kind)} aria-label={`${KIND_PLURAL[kind]} : ${n}`}>
              <Icon aria-hidden="true" /><span>{KIND_PLURAL[kind]}</span><b>{n}</b>
              <span className="cu-bar" aria-hidden="true"><i style={{ width: `${(n / maxCount) * 100}%` }} /></span>
            </button>
          </li>; })}
        </ul>
        <div className="cu-actions">
          <button type="button" className="im-cta" onClick={() => watch(highlightsOf(universe)[0])}><span className="im-cta-icon"><Play fill="currentColor" /></span>Regarder la une</button>
          <button type="button" className={`im-cta cu-follow ${isFollowed ? 'is-on' : ''}`} aria-pressed={isFollowed}
            onClick={() => setFollowed(set => { const next = new Set(set); if (next.has(universe.creator.id)) next.delete(universe.creator.id); else next.add(universe.creator.id); return next; })}>
            {isFollowed ? <Check /> : <Plus />}{isFollowed ? 'Suivi' : 'Suivre'}
          </button>
        </div>
      </div>
    </section>

    <section className="cu-stage" aria-label={`Univers de ${universe.creator.name}`}>
      <div className="cu-portals is-left">{kinds.slice(0, half).map(portal)}</div>
      <div className="cu-hero">
        <div className="cu-stand" aria-hidden="true"><span className="cu-tier is-low" /><span className="cu-tier is-high" /><span className="cu-wave" /><span className="cu-wave" /><span className="cu-beam" /></div>
        <div className="cu-character"><img src={universe.creator.image} alt={universe.creator.imageAlt} style={{ objectPosition: universe.creator.focus }} /><span className="cu-scan" aria-hidden="true" /></div>
      </div>
      <div className="cu-portals is-right">{kinds.slice(half).map(portal)}</div>
    </section>

    <aside className="cu-detail" aria-live="polite">
      <div ref={card} className="cu-card im-neon is-lit" onAnimationEnd={event => { if (event.animationName === 'cu-target') event.currentTarget.classList.remove('is-targeted'); }}>
        {section === 'lore'
          ? <div key={`lore-${universe.creator.id}`} className="cu-card-inner">
              <header className="cu-card-head"><span className="cu-card-title">Son histoire</span></header>
              <div className="cu-lore">{universe.chapters.map(c => <article key={c.mark}><span>{c.mark}</span><strong>{c.title}</strong><p>{c.text}</p></article>)}</div>
              {universe.isProvisional && <p className="cu-provisional">Présentation provisoire, en attente des textes officiels.</p>}
            </div>
          : <ContentCarousel key={`${universe.creator.id}-${section}`} title={section === 'all' ? 'À la une' : KIND_PLURAL[section]} items={items} position={position} onPosition={setPosition}
              saved={saved} onSave={id => setSaved(set => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next; })} />}
      </div>
    </aside>

    <footer className="cu-bottom">
      <Link to="/" hash="createurs" className="cu-hint">Retour aux créateurs</Link>
      <nav className="cu-sibs" aria-label="Autres créateurs">
        {[-1, 1].map(step => { const u = sibling(step); return <Link key={step} to="/createur/$slug" params={{ slug: u.creator.id }} className={`cu-sib ${step > 0 ? 'is-next' : 'is-prev'}`}>
          <img src={u.creator.image} alt="" style={{ objectPosition: u.creator.focus }} />
          <span><small>{step < 0 ? 'Précédent' : 'Suivant'}</small>{shortName(u)}</span>
        </Link>; })}
      </nav>
    </footer>
  </main>;
}

/** One category, one carousel: each content appears once, the next one is a swipe, trackpad gesture or arrow away. */
function ContentCarousel({ title, items, position, onPosition, saved, onSave }: {
  title: string; items: CreatorContent[]; position: number; onPosition: (index: number) => void; saved: Set<string>; onSave: (id: string) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const fromScroll = useRef(false);
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    if (fromScroll.current) { fromScroll.current = false; return; }
    element.scrollTo({ left: position * element.clientWidth, behavior: reduced() ? 'auto' : 'smooth' });
  }, [position]);
  const onScroll = () => {
    const element = track.current;
    if (!element) return;
    const next = Math.round(element.scrollLeft / element.clientWidth);
    if (next !== position) { fromScroll.current = true; onPosition(next); }
  };
  if (!items.length) return <div className="cu-card-inner"><header className="cu-card-head"><span className="cu-card-title">{title}</span></header><p className="cu-syn">Rien ici pour l’instant.</p></div>;
  return <div className="cu-card-inner">
    <header className="cu-card-head">
      <span className="cu-card-title">{title}</span>
      {items.length > 1 && <div className="cu-pager">
        <span className="cu-count">{String(position + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</span>
        <button type="button" className="im-round" aria-label="Contenu précédent" disabled={position === 0} onClick={() => onPosition(position - 1)}><ChevronLeft /></button>
        <button type="button" className="im-round" aria-label="Contenu suivant" disabled={position === items.length - 1} onClick={() => onPosition(position + 1)}><ChevronRight /></button>
      </div>}
    </header>
    <div ref={track} className="cu-track" onScroll={onScroll} role="group" aria-roledescription="carrousel" aria-label={title} tabIndex={0}>
      {items.map((item, i) => <article key={item.id} className="cu-slide" aria-roledescription="diapositive" aria-label={`${i + 1} sur ${items.length} : ${item.title}`} aria-hidden={i !== position}>
        <Link to="/production/$slug" params={{ slug: item.id }} search={{}} className="cu-thumb" tabIndex={i === position ? 0 : -1} aria-label={`Regarder ${item.title}`}>
          <img src={item.image} alt={item.imageAlt} loading="lazy" draggable={false} />
          {item.kind === 'live' && <span className="cu-badge">En direct</span>}
          <span className="cu-play"><Play fill="currentColor" /></span><span className="cu-dur">{item.duration}</span>
        </Link>
        <div className="cu-slide-copy">
          <span className="cu-meta">{creatorKindLabel[item.kind]}{item.episode && <><i />{item.episode}</>}</span>
          <h3>{item.title}</h3>
          <p className="cu-syn">{item.synopsis}</p>
          <div className="cu-card-actions">
            <Link to="/production/$slug" params={{ slug: item.id }} search={{}} className="im-cta" tabIndex={i === position ? 0 : -1}><span className="im-cta-icon"><Play fill="currentColor" /></span>{item.kind === 'live' ? 'Rejoindre le direct' : 'Regarder'}</Link>
            <button type="button" className="im-round" tabIndex={i === position ? 0 : -1} aria-pressed={saved.has(item.id)} aria-label={saved.has(item.id) ? `Retirer ${item.title} de ma liste` : `Ajouter ${item.title} à ma liste`} onClick={() => onSave(item.id)}>{saved.has(item.id) ? <Check /> : <Plus />}</button>
          </div>
        </div>
      </article>)}
    </div>
    {items.length > 1 && <div className="cu-progress" aria-hidden="true"><span style={{ width: `${100 / items.length}%`, transform: `translateX(${position * 100}%)` }} /></div>}
  </div>;
}

/** Name decoded letter by letter, like a game title card. */
function ScrambleTitle({ text }: { text: string }) {
  const [shown, setShown] = useState(text.toUpperCase());
  useEffect(() => {
    const target = text.toUpperCase();
    if (reduced()) { setShown(target); return; }
    const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let frame = 0;
    const timer = window.setInterval(() => {
      frame += 1;
      setShown(target.split('').map((ch, i) => ch === ' ' || i < (frame / 18) * target.length ? ch : glyphs[Math.floor(Math.random() * glyphs.length)]).join(''));
      if (frame >= 18) { window.clearInterval(timer); setShown(target); }
    }, 30);
    return () => window.clearInterval(timer);
  }, [text]);
  return <h1 className="cu-name" aria-label={text}>{shown}</h1>;
}
