import { useCallback, useEffect, useRef, useState, type CSSProperties, type ImgHTMLAttributes } from 'react';

type Fit = 'cover' | 'poster';

/** Un visuel est « portrait » s'il est nettement plus haut que large ; un cadre est « paysage » s'il est plus large que haut. */
const PORTRAIT_BELOW = 0.9;
const LANDSCAPE_ABOVE = 1.15;

/**
 * Choisit comment un visuel remplit son cadre. `cover` (par défaut) convient à un paysage. Une affiche verticale étirée
 * en plein écran serait rognée à plus de 60 % et agrandie 4 à 8 fois (floue) : on passe alors en `poster`, c'est-à-dire un fond
 * flou et sombre tiré du visuel, avec l'affiche nette, entière, à droite. Recalculé au chargement et au redimensionnement.
 */
export function useBackdropFit() {
  const ref = useRef<HTMLImageElement>(null);
  const [fit, setFit] = useState<Fit>('cover');

  const measure = useCallback(() => {
    const image = ref.current;
    const frame = image?.parentElement;
    if (!image || !frame || !image.naturalWidth) return;
    const box = frame.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const natural = image.naturalWidth / image.naturalHeight;
    setFit(natural < PORTRAIT_BELOW && box.width / box.height > LANDSCAPE_ABOVE ? 'poster' : 'cover');
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return { ref, fit, measure };
}

interface BackdropImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'className' | 'style' | 'onLoad'> {
  src: string;
  /** Classes du fond (couche de base, plein cadre). */
  className: string;
  /** Classes de l'affiche nette affichée à la place du plein cadre quand le visuel est vertical. */
  posterClassName: string;
  style?: CSSProperties | undefined;
}

/** Fond d'écran adaptatif : plein cadre pour un paysage, fond flou + affiche nette pour un visuel vertical. */
export function BackdropImage({ src, className, posterClassName, style, ...rest }: BackdropImageProps) {
  const { ref, fit, measure } = useBackdropFit();
  return (
    <>
      <img ref={ref} src={src} alt="" className={className} data-fit={fit} style={style} onLoad={measure} {...rest} />
      {fit === 'poster' && <img src={src} alt="" aria-hidden="true" className={posterClassName} style={style} />}
    </>
  );
}
