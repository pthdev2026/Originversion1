import { useEffect, useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SuggestedProgram } from '@/lib/origin-suggestions';
import { useRestoreFocus } from '@/lib/use-restore-focus';
import { useImageTint } from '@/lib/adaptive';

const COMPACT_QUERY = '(max-width: 767px), (max-width: 1100px) and (orientation: portrait)';
const SWIPE_MIN = 40;

function useCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY);
    const update = () => setCompact(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return compact;
}

export function OriginUniverses({ programs }: { programs: SuggestedProgram[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [exploring, setExploring] = useState(false);
  const restoreFocus = useRestoreFocus(exploring);
  const panels = useRef<HTMLDivElement>(null);
  const compact = useCompact();
  const touch = useRef<{ x: number; y: number } | null>(null);
  const current = Math.min(programs.length - 1, active ?? 2);
  const selected = programs[current] ?? programs[0];
  // On phones the section takes the colour of the selected story, like the Hero.
  const tint = useImageTint(selected?.poster, compact);
  if (!selected) return null;

  function move(index: number) {
    const next = (index + programs.length) % programs.length;
    setActive(next);
    panels.current?.querySelectorAll<HTMLButtonElement>('.universe-panel')[next]?.focus({ preventScroll: true });
  }

  const onTouchStart = (event: TouchEvent) => { const point = event.touches[0]; touch.current = point ? { x: point.clientX, y: point.clientY } : null; };
  const onTouchEnd = (event: TouchEvent) => {
    const start = touch.current; const point = event.changedTouches[0];
    touch.current = null;
    if (!compact || !start || !point) return;
    const dx = point.clientX - start.x, dy = point.clientY - start.y;
    // A mostly vertical gesture is the page scrolling, not a swipe between stories.
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) setActive(Math.max(0, Math.min(programs.length - 1, current + (dx < 0 ? 1 : -1))));
  };

  return <section className="origin-universes" aria-labelledby="universes-title"
    style={compact && tint ? { '--hg-c1': tint.c1, '--hg-c2': tint.c2, '--hg-c3': tint.c3 } as CSSProperties : undefined}>
    <div className="universes-panorama" ref={panels} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onMouseLeave={() => {
      if (compact) return;
      if (!panels.current?.contains(document.activeElement)) setActive(null);
    }} onBlur={event => { if (!compact && !event.currentTarget.contains(event.relatedTarget)) setActive(null); }}>
      {programs.map((program, index) => <Button key={program.id} variant="ghost"
        className={`universe-panel ${active === index ? 'is-active' : ''} ${index === current ? 'is-current' : ''}`}
        style={{ '--o': index - current, '--oa': Math.abs(index - current) } as CSSProperties}
        aria-label={`Explorer ${program.title}, ${index + 1} sur ${programs.length}`}
        aria-pressed={active === index} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)}
        onClick={() => setActive(index)} onKeyDown={event => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault(); move(index + (event.key === 'ArrowRight' ? 1 : -1));
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault(); move(event.key === 'Home' ? 0 : programs.length - 1);
          }
        }}>
        <img src={program.poster} alt={program.imageAlt} width={768} height={1152} loading="lazy" />
        <span className="universe-panel-shade" aria-hidden="true" />
        <span className="universe-caption"><span className="universe-category">{program.category}</span><span className="universe-title">{program.title}</span></span>
      </Button>)}
    </div>
    <div className="universes-invitation">
      <p className="universes-signature">ILS ONT OSÉ PRENDRE LA PAROLE.</p>
      <p className="universes-wordmark" aria-hidden="true">MILLENIUM</p>
      <h2 id="universes-title" className="universes-heading">Ils ont osé raconter leur histoire</h2>
      <p className="universes-editorial">Des témoignages intimes, des paroles sincères. Écoutez celles et ceux qui ont choisi de partager leur histoire.</p>
      <Button variant="outline" className="universes-explore" onClick={() => setExploring(true)}>Découvrir les témoignages<ArrowRight aria-hidden="true" /></Button>
    </div>
    <Dialog.Root open={exploring} onOpenChange={setExploring}><Dialog.Portal>
      <Dialog.Overlay className="origin-dialog-overlay" />
      <Dialog.Content className="origin-dialog universes-dialog" onCloseAutoFocus={restoreFocus}>
        <Dialog.Title className="dialog-title">Ils ont osé raconter leur histoire</Dialog.Title>
        <Dialog.Close asChild><Button variant="ghost" size="icon" className="dialog-close" aria-label="Fermer"><X /></Button></Dialog.Close>
        <Dialog.Description className="dialog-description">{selected.title} · {selected.category} · {selected.duration}</Dialog.Description>
        <div className="universe-choices" aria-label="Choisir une histoire">{programs.map((program, index) => <Button key={program.id} variant="ghost" className={`universe-choice ${active === index || (active === null && program.id === selected.id) ? 'is-active' : ''}`} aria-label={program.title} aria-pressed={program.id === selected.id} onClick={() => setActive(index)}><img src={program.poster} alt={program.imageAlt} width={768} height={1152} /><span>{program.title}</span></Button>)}</div>
        <p className="ranked-unavailable">Ce programme n’est pas encore disponible à la lecture.</p>
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </section>;
}