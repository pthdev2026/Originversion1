import { useEffect, useState, type RefObject } from 'react';
import { deriveTint, type Tint } from './tint';
import { useImageTint } from './use-image-tint';

const SAMPLE_W = 48;
const SAMPLE_H = 27;
/** Pause entre deux mesures de l'image de la vidéo : le fond suit les scènes sans scintiller. */
const SAMPLE_EVERY_MS = 2500;

/**
 * Teinte d'une vidéo en cours de lecture. Elle mesure une image réduite toutes les 2,5 s ; si le navigateur
 * refuse de la lire (flux d'une autre origine sans CORS), elle garde la teinte de l'affiche (`fallbackSrc`).
 * Le fondu entre deux teintes est fait en CSS (propriétés enregistrées `--ad-c*`), pas ici.
 */
export function useVideoTint(videoRef: RefObject<HTMLVideoElement | null>, fallbackSrc: string | undefined, enabled = true): Tint | null {
  const poster = useImageTint(fallbackSrc, enabled);
  const [frame, setFrame] = useState<Tint | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!enabled || !video) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_W; canvas.height = SAMPLE_H;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return undefined;
    let readable = true;
    const measure = () => {
      if (!readable || video.paused || video.readyState < 2 || document.hidden) return;
      try {
        context.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
        const next = deriveTint(context.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data, SAMPLE_W, SAMPLE_H);
        setFrame(previous => (previous && previous.c1 === next.c1 && previous.c2 === next.c2 ? previous : next));
      } catch {
        readable = false; // image non lisible : on s'en tient à l'affiche
        setFrame(null);
      }
    };
    const timer = window.setInterval(measure, SAMPLE_EVERY_MS);
    video.addEventListener('playing', measure);
    return () => { window.clearInterval(timer); video.removeEventListener('playing', measure); };
  }, [videoRef, enabled]);

  return frame ?? poster;
}
