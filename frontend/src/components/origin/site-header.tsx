import { useState } from 'react';
import { MilleniumMenu } from '@/components/menu/millenium-menu';
import { OriginNavigation } from './origin-navigation';
import { SearchOverlay } from './search-overlay';

/**
 * Navigation bar of the inner pages (programme, creator…): same bar, menu and search as the homepage hero,
 * placed in the flow above the page. The homepage keeps its own bar inside the hero.
 */
export function SiteHeader() {
  const [panel, setPanel] = useState<'menu' | 'search' | null>(null);
  return <div className="site-header">
    <OriginNavigation onMenu={() => setPanel('menu')} onSearch={() => setPanel('search')} />
    <MilleniumMenu open={panel === 'menu'} onOpenChange={open => { if (!open) setPanel(null); }} onSearch={() => setPanel('search')} />
    <SearchOverlay open={panel === 'search'} onOpenChange={open => setPanel(open ? 'search' : null)} />
  </div>;
}
