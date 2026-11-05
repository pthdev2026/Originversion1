import type { ReactElement, SVGProps } from 'react';

/**
 * MILLENIUM menu icons: one hand-drawn set on a 24px grid with a single fine stroke,
 * so every entry of the menu shares the same weight and rounded terminals.
 */
export type MenuIcon = (props: SVGProps<SVGSVGElement>) => ReactElement;

function icon(paths: ReactElement): MenuIcon {
  return props => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" {...props}>{paths}</svg>;
}

export const HomeIcon = icon(<path d="M4 10.4 12 4l8 6.4V19a1 1 0 0 1-1 1h-4.25v-4.75a2.75 2.75 0 0 0-5.5 0V20H5a1 1 0 0 1-1-1Z" />);

export const OriginalsIcon = icon(<>
  <circle cx="12" cy="12" r="8.75" />
  <path d="M10.4 8.9v6.2a.6.6 0 0 0 .9.5l4.8-3.1a.6.6 0 0 0 0-1l-4.8-3.1a.6.6 0 0 0-.9.5Z" />
</>);

export const FilmsIcon = icon(<>
  <rect x="3.25" y="4.75" width="17.5" height="11.5" rx="2.25" />
  <path d="M8.5 19.75h7" />
</>);

export const ExploreIcon = icon(<>
  <circle cx="12" cy="12" r="8.75" />
  <path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5Z" />
</>);

export const RecommendIcon = icon(<>
  <path d="M11 4.5Q11.8 11.2 18.5 12 11.8 12.8 11 19.5 10.2 12.8 3.5 12 10.2 11.2 11 4.5Z" />
  <path d="M18 3.5v3M16.5 5h3" />
</>);

export const SearchIcon = icon(<>
  <circle cx="10.75" cy="10.75" r="6.25" />
  <path d="m15.4 15.4 4.35 4.35" />
</>);

export const BookmarkIcon = icon(<path d="M7.25 4h9.5a1 1 0 0 1 1 1v15l-5.75-3.75L6.25 20V5a1 1 0 0 1 1-1Z" />);

export const ContinueIcon = icon(<>
  <path d="M12 3.25A8.75 8.75 0 1 1 3.25 12" />
  <path d="M10.6 9.4v5.2l4.1-2.6Z" />
</>);

export const AccountIcon = icon(<>
  <circle cx="12" cy="8.75" r="3.5" />
  <path d="M5.25 19.5c1.25-3 3.8-4.5 6.75-4.5s5.5 1.5 6.75 4.5" />
</>);

export const SettingsIcon = icon(<>
  <path d="M4 8h8.25M17.75 8H20M4 16h2.25M11.75 16H20" />
  <circle cx="15" cy="8" r="2.25" />
  <circle cx="9" cy="16" r="2.25" />
</>);

export const LogoutIcon = icon(<>
  <path d="M14 4h3.75A2.25 2.25 0 0 1 20 6.25v11.5A2.25 2.25 0 0 1 17.75 20H14" />
  <path d="M9.5 8 5.5 12l4 4M5.5 12H15" />
</>);

export const GridIcon = icon(<>
  <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
  <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
  <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
  <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
</>);

export const BellIcon = icon(<>
  <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.25 1.5H5.25Z" />
  <path d="M10 20.25a2.25 2.25 0 0 0 4 0" />
</>);
