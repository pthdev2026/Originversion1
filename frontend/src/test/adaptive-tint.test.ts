import { describe, expect, it } from 'vitest';
import { deriveTint } from '@/lib/adaptive';

function image(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const [r, g, b] = pixel(x, y);
    data.set([r, g, b, 255], (y * width + x) * 4);
  }
  return data;
}
const hue = (value: string) => Number(/hsl\((\d+)/.exec(value)?.[1]);
const lightness = (value: string) => Number(/(\d+)%\)$/.exec(value)?.[1]);

describe('deriveTint', () => {
  it('prend la teinte de la moitié basse, pas celle du haut', () => {
    const data = image(8, 8, (_x, y) => (y < 3 ? [255, 0, 0] : [20, 60, 200]));
    const tint = deriveTint(data, 8, 8);
    expect(hue(tint.c1)).toBeGreaterThan(210);
    expect(hue(tint.c1)).toBeLessThan(235);
  });

  it('donne une teinte sombre pour le verre et une claire pour l’accent', () => {
    const tint = deriveTint(image(8, 8, () => [200, 90, 30]), 8, 8);
    expect(lightness(tint.c2)).toBeLessThan(lightness(tint.c1));
    expect(lightness(tint.c3)).toBeGreaterThan(lightness(tint.c1));
  });

  it('une image sombre mais bleutée garde du bleu, les pixels gris pèsent peu', () => {
    const data = image(8, 8, (x) => (x % 4 === 0 ? [10, 30, 90] : [30, 30, 30]));
    expect(hue(deriveTint(data, 8, 8).c1)).toBeGreaterThan(200);
  });

  it('reste neutre pour une image sans couleur ni pixel lisible', () => {
    expect(deriveTint(new Uint8ClampedArray(8 * 8 * 4), 8, 8).c1).toMatch(/^hsl\(/);
    const grey = deriveTint(image(8, 8, () => [90, 90, 90]), 8, 8);
    expect(hue(grey.c1)).toBe(220);
  });
});

describe('tintVars', () => {
  it('pose les trois variables avec le préfixe demandé', async () => {
    const { tintVars } = await import('@/lib/adaptive');
    const tint = { c1: 'hsl(10 50% 40%)', c2: 'hsl(10 50% 10%)', c3: 'hsl(10 50% 70%)' };
    expect(tintVars(tint)).toEqual({ '--ad-c1': tint.c1, '--ad-c2': tint.c2, '--ad-c3': tint.c3 });
    expect(tintVars(tint, 'hg')).toEqual({ '--hg-c1': tint.c1, '--hg-c2': tint.c2, '--hg-c3': tint.c3 });
    expect(tintVars(null)).toBeUndefined();
  });
});
