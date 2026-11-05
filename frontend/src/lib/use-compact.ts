import { useEffect, useState } from 'react';

/** Phones and portrait tablets: the layouts that follow the app-first (touch) design. */
export const COMPACT_QUERY = '(max-width: 767px), (max-width: 1100px) and (orientation: portrait)';

export function useCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY);
    const update = () => setCompact(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return compact;
}
