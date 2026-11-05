import { scrollPageTo } from '@/components/smooth-scroll';

/** Homepage anchors used by the main navigation; selectors target the approved section containers. */
export const navSections = [
  { id: 'accueil', label: 'Accueil', selector: '.origin-experience', anchor: '' },
  { id: 'originals', label: 'Originals', selector: '.pth-originals, .ph-originals', anchor: 'originals' },
  { id: 'films-series', label: 'Films & Séries', selector: '#nouveautes', anchor: 'nouveautes' },
  { id: 'explorer', label: 'Explorer', selector: '#thematiques', anchor: 'thematiques' },
] as const;
/** Anchor of each section on the homepage, used to reach it from another page (re-aimed once pinned scenes are measured). */
export const sectionAnchor = (id: (typeof navSections)[number]['id']) => navSections.find(section => section.id === id)?.anchor ?? '';
export type NavSectionId = (typeof navSections)[number]['id'];

export function scrollToSection(id: NavSectionId) {
  const target = navSections.find(s => s.id === id);
  const el = target && document.querySelector<HTMLElement>(target.selector);
  if (!el) return;
  const top = id === 'accueil' ? 0 : el.getBoundingClientRect().top + window.scrollY - 24;
  scrollPageTo(top);
}
