import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CatalogCard, CatalogDetails } from './catalog-content';
import type { CatalogCollection, CatalogContent } from '@/lib/origin-catalogs';
import { useRestoreFocus } from '@/lib/use-restore-focus';

export function ContentCarousel({ id, title, contents, badge, viewAllUrl, cardStyle = 'standard' }: CatalogCollection) {
  const [viewport, api] = useEmblaCarousel({ align: 'start', containScroll: 'keepSnaps', slidesToScroll: 1, duration: 38 });
  const [position, setPosition] = useState(0);
  // One card is always selected (neon frame); the arrows move the selection and bring it into view.
  const [active, setActive] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const go = useNavigate();
  const [selected, setSelected] = useState<CatalogContent | null>(null);
  const restoreFocus = useRestoreFocus(selected !== null);
  const sync = useCallback(() => {
    if (!api) return;
    setPosition(api.slidesInView()[0] ?? 0);
  }, [api]);
  useEffect(() => {
    if (!api) return;
    sync();
    api.on('select', sync).on('reInit', sync).on('settle', sync);
    return () => { api.off('select', sync).off('reInit', sync).off('settle', sync); };
  }, [api, sync]);
  const jump = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function step(direction: 1 | -1) {
    const next = Math.max(0, Math.min(contents.length - 1, active + direction));
    setActive(next);
    setEngaged(true);
    if (api && !api.slidesInView().includes(next)) api.scrollTo(next, jump());
  }
  if (!contents.length) return null;

  return <section id={id} className={`origin-catalog im-section catalog-style-${cardStyle}`} aria-labelledby={`${id}-title`}>
    <header className="catalog-header">
      <div className="catalog-heading"><h2 id={`${id}-title`}>{title}</h2><span className="catalog-count">{contents.length} titres</span></div>
      <div className="catalog-navigation">
        {viewAllUrl && <a href={viewAllUrl} className="catalog-all">Tout voir<ArrowRight aria-hidden="true" /></a>}
        <button type="button" className="im-round catalog-arrow" aria-label={`${title} : précédent`} title="Précédent" aria-controls={`${id}-rail`} disabled={active === 0} onClick={() => step(-1)}><ChevronLeft /></button>
        <button type="button" className="im-round catalog-arrow" aria-label={`${title} : suivant`} title="Suivant" aria-controls={`${id}-rail`} disabled={active === contents.length - 1} onClick={() => step(1)}><ChevronRight /></button>
      </div>
    </header>
    <p className="sr-only" role="status" aria-live="polite">{title} : élément {position + 1} sur {contents.length}</p>
    <div className="catalog-viewport" ref={viewport}>
      <div id={`${id}-rail`} className="catalog-track" role="group" aria-label={title} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const cards = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.catalog-card'));
        const current = cards.indexOf(event.target as HTMLButtonElement);
        if (current < 0) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : Math.max(0, Math.min(cards.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1)));
        cards[next]?.focus({ preventScroll: true });
        api?.scrollTo(next, jump());
        setPosition(next);
        setActive(next);
        setEngaged(true);
      }}>
        {contents.map((content, index) => <div className="catalog-slide" key={content.id}><CatalogCard content={content} badge={badge} active={index === active} engaged={engaged} previewVideo={content.previewVideo} onSelect={() => void go({ to: '/production/$slug', params: { slug: content.productionSlug ?? content.id }, search: {} })} /></div>)}
      </div>
    </div>
    <Dialog.Root open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}><Dialog.Portal>
      <Dialog.Overlay className="origin-dialog-overlay" />
      <Dialog.Content className="origin-dialog catalog-dialog" onCloseAutoFocus={restoreFocus}>
        <Dialog.Title className="dialog-title">{selected?.title}</Dialog.Title>
        <Dialog.Description className="dialog-description">{selected?.category}</Dialog.Description>
        <Dialog.Close asChild><Button variant="ghost" size="icon" className="dialog-close" aria-label="Fermer"><X /></Button></Dialog.Close>
        {selected && <CatalogDetails content={selected} />}
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </section>;
}