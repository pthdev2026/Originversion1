import { useEffect, useState } from 'react';
import { deriveTint, type Tint } from './tint';

const SAMPLE = 24;
const cache = new Map<string, Tint | null>();
const pending = new Map<string, Promise<Tint | null>>();

function sample(src: string): Promise<Tint | null> {
  const known = pending.get(src);
  if (known) return known;
  const task = new Promise<Tint | null>(resolve => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE; canvas.height = SAMPLE;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) { resolve(null); return; }
        context.drawImage(image, 0, 0, SAMPLE, SAMPLE);
        resolve(deriveTint(context.getImageData(0, 0, SAMPLE, SAMPLE).data, SAMPLE, SAMPLE));
      } catch {
        resolve(null); // image non lisible (origine étrangère) : l'appelant garde sa teinte de repli
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
  pending.set(src, task);
  return task;
}

/** Teinte d'un visuel, calculée une fois puis gardée. `null` tant qu'elle n'est pas prête ou si l'image est illisible. */
export function useImageTint(src: string | undefined, enabled = true): Tint | null {
  const [tint, setTint] = useState<Tint | null>(() => (src ? cache.get(src) ?? null : null));
  useEffect(() => {
    if (!enabled || !src) return undefined;
    const cached = cache.get(src);
    if (cached !== undefined) { setTint(cached); return undefined; }
    let cancelled = false;
    void sample(src).then(result => {
      cache.set(src, result);
      if (!cancelled) setTint(result);
    });
    return () => { cancelled = true; };
  }, [src, enabled]);
  return tint;
}
