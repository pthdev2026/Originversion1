import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { watchLabel, type CatalogContent } from '@/lib/origin-catalogs';

/** Seconds a card stays hovered or selected before inviting the viewer to watch. */
const INVITE_AFTER_MS = 3000;

export function CatalogCard({ content, badge, active = false, engaged = false, previewVideo, onSelect }: {
  content: CatalogContent; badge?: string | undefined; active?: boolean; engaged?: boolean; previewVideo?: string | undefined; onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [invite, setInvite] = useState(false);
  const live = hovered || (active && engaged);
  useEffect(() => {
    // Only a teaser that is actually playing earns the invitation.
    if (!live || !previewVideo) { setInvite(false); return; }
    const timer = window.setTimeout(() => setInvite(true), INVITE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [live, previewVideo]);
  return <Button variant="ghost" className={`catalog-card ${active ? 'is-active' : ''} ${invite ? 'is-inviting' : ''}`} onClick={onSelect} aria-label={`Découvrir ${content.title}`}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setHovered(true)} onBlur={() => setHovered(false)}>
    <span className="catalog-poster">
      <img src={content.image} alt={content.imageAlt} width={640} height={360} loading="lazy" />
      {live && previewVideo && <video className="catalog-preview" src={previewVideo} muted loop playsInline autoPlay preload="metadata" aria-hidden="true" />}
      {(content.badge ?? badge) && <span className="catalog-badge">{content.badge ?? badge}</span>}
      <span className="catalog-play" aria-hidden="true"><Play fill="currentColor" /></span>
      {invite && <span className="catalog-invite"><small>Envie de voir la suite ?</small><span className="catalog-invite-cta">{watchLabel(content.category)}<ArrowUpRight aria-hidden="true" /></span></span>}
    </span>
    <span className="catalog-title">{content.title}</span>
    <span className="catalog-category">{content.category}</span>
  </Button>;
}

export function CatalogDetails({ content }: { content: CatalogContent }) {
  return <div className="catalog-details">
    <img src={content.image} alt={content.imageAlt} width={960} height={540} />
    {content.synopsis && <p className="dialog-description">{content.synopsis}</p>}
    {content.isDemo && <p className="catalog-demo">Sélection de démonstration · Informations non définitives</p>}
    {content.productionSlug
      ? <Button asChild className="catalog-discover"><Link to="/production/$slug" params={{ slug: content.productionSlug }} search={{}}>Découvrir le programme<ArrowRight aria-hidden="true" /></Link></Button>
      : <p className="ranked-unavailable">Ce programme n’est pas encore disponible à la lecture.</p>}
  </div>;
}