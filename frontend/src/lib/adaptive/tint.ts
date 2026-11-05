/**
 * Fond adaptatif — cœur pur (sans React ni DOM) : calcule la teinte d'un visuel et la transforme en variables CSS.
 * Utilisé par la Hero, les sections d'accueil et le lecteur ; voir docs/FOND-ADAPTATIF.md.
 */

/** Trois teintes d'un visuel : lumineuse (c1), sombre (c2, pour le fond du verre) et claire (c3, accent). */
export interface Tint { c1: string; c2: string; c3: string }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const rn = r / 255, gn = g / 255, bn = b / 255;
  let hue = max === rn ? ((gn - bn) / delta) % 6 : max === gn ? (bn - rn) / delta + 2 : (rn - gn) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  return [hue, saturation, lightness];
}

const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

/**
 * Teintes dominantes de la moitié basse d'une image (celle qui passe derrière le verre).
 * Les pixels colorés pèsent plus que les gris : un visuel sombre mais bleuté donne du bleu, pas du noir.
 * Fonction pure (RGBA, 4 octets par pixel) : testée sans navigateur.
 */
export function deriveTint(data: Uint8ClampedArray, width: number, height: number): Tint {
  let sumR = 0, sumG = 0, sumB = 0, total = 0;
  for (let y = Math.floor(height * 0.45); y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if ((data[i + 3] ?? 255) < 128) continue;
      const r = data[i] ?? 0, g = data[i + 1] ?? 0, b = data[i + 2] ?? 0;
      const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      const weight = 0.04 + chroma * chroma;
      sumR += r * weight; sumG += g * weight; sumB += b * weight; total += weight;
    }
  }
  if (total === 0) return { c1: hsl(220, 0.2, 0.4), c2: hsl(220, 0.2, 0.1), c3: hsl(220, 0.2, 0.7) };
  const [hue, saturation] = rgbToHsl(sumR / total, sumG / total, sumB / total);
  // Image presque sans couleur : un gris froid neutre, jamais une teinte au hasard.
  if (saturation < 0.08) return { c1: hsl(220, 0.12, 0.42), c2: hsl(220, 0.1, 0.1), c3: hsl(220, 0.12, 0.74) };
  return {
    c1: hsl(hue, clamp(saturation * 1.9, 0.32, 0.8), 0.46),
    c2: hsl(hue, clamp(saturation * 1.5, 0.28, 0.66), 0.12),
    c3: hsl(hue, clamp(saturation * 1.6, 0.4, 0.9), 0.76),
  };
}


/** Teinte neutre (gris froid) : valeur de repli tant qu'aucune teinte n'est connue. */
export const NEUTRAL_TINT: Tint = { c1: hsl(220, 0.12, 0.42), c2: hsl(220, 0.1, 0.1), c3: hsl(220, 0.12, 0.74) };

/**
 * Variables CSS d'une teinte, pour un style en ligne : `style={tintVars(tint, 'hg')}` pose --hg-c1, --hg-c2, --hg-c3.
 * Le préfixe `ad` est celui du module (voir `.adaptive-surface` dans styles.css).
 */
export function tintVars(tint: Tint | null | undefined, prefix = 'ad'): Record<string, string> | undefined {
  if (!tint) return undefined;
  return { [`--${prefix}-c1`]: tint.c1, [`--${prefix}-c2`]: tint.c2, [`--${prefix}-c3`]: tint.c3 };
}
