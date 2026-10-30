/**
 * Module « identity » — libellé APPROXIMATIF de l'appareil d'une session (« Chrome · macOS »).
 *
 * Respect de la vie privée : on ne conserve ni l'agent utilisateur brut (empreinte numérique) ni l'adresse IP ;
 * seulement une famille de navigateur et de système, juste assez pour que la personne reconnaisse ses appareils.
 */
export function deviceLabel(userAgent: string | undefined | null): string | null {
  if (!userAgent) return null;
  const ua = userAgent.slice(0, 400);
  const browser =
    /Edg(e|A|iOS)?\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) && /Version\//.test(ua) ? 'Safari'
    : null;
  const system =
    /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux|X11/.test(ua) ? 'Linux'
    : null;
  if (!browser && !system) return null;
  return [browser, system].filter(Boolean).join(' · ');
}
