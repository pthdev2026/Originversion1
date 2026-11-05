import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, ImageUp, Trash2, X } from 'lucide-react';
import type { Avatar } from '@/features/account/session/demo-space';
import { avatarArt } from './avatar-art';
import { useRestoreFocus } from '@/lib/use-restore-focus';

const MAX_BYTES = 5 * 1024 * 1024;
const MIN_SIDE = 400;
/** Margin of the round frame inside the square preview (fraction of its side), shared by the preview ring and the export. */
const RING = .12;

/** Reads an image file, checks its size and dimensions, and returns it reduced to 512 px (kept light for browser storage). */
function prepare(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { reject(new Error('Choisissez une image JPG, PNG ou WebP.')); return; }
    if (file.size > MAX_BYTES) { reject(new Error('Cette image dépasse 5 Mo. Choisissez une image plus légère.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (Math.min(img.width, img.height) < MIN_SIDE) { reject(new Error(`Cette image est trop petite : ${MIN_SIDE} × ${MIN_SIDE} px minimum.`)); return; }
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      canvas.getContext('2d')?.drawImage(img, (img.width - side) / 2, (img.height - side) / 4, side, side, 0, 0, 512, 512);
      resolve(canvas.toDataURL('image/jpeg', .86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Cette image n’a pas pu être lue.')); };
    img.src = url;
  });
}

/** Changing the profile picture: import a photo (round crop + zoom) or choose a MILLENIUM avatar. */
export function PhotoDialog({ open, onOpenChange, current, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; current: Avatar; onSave: (avatar: Avatar) => void }) {
  const restoreFocus = useRestoreFocus(open);
  const [tab, setTab] = useState<'import' | 'avatar'>('import');
  const [photo, setPhoto] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  // Position of the photo inside the frame, as a fraction of the frame size (dragged, or moved with the arrow keys).
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; from: { x: number; y: number } } | null>(null);
  const [preset, setPreset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setTab(current?.kind === 'preset' ? 'avatar' : 'import');
    setPhoto(current?.kind === 'photo' ? current.src : null);
    setZoom(current?.kind === 'photo' ? current.zoom : 100);
    setOffset({ x: 0, y: 0 });
    setPreset(current?.kind === 'preset' ? current.index : 0);
  }, [open, current]);

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try { setPhoto(await prepare(file)); setZoom(100); setOffset({ x: 0, y: 0 }); setError(null); } catch (problem) { setError((problem as Error).message); }
  };
  // The photo may move only as far as it still covers the round frame.
  const limit = (z: number) => (z / 100 - 1) / 2 + RING;
  const clamp = (value: { x: number; y: number }, z = zoom) => {
    const max = limit(z);
    return { x: Math.max(-max, Math.min(max, value.x)), y: Math.max(-max, Math.min(max, value.y)) };
  };
  useEffect(() => { setOffset(value => clamp(value)); }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!photo) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, from: offset };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current, size = frame.current?.clientWidth;
    if (!start || !size) return;
    setOffset(clamp({ x: start.from.x + (event.clientX - start.x) / size, y: start.from.y + (event.clientY - start.y) / size }));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: [-.02, 0], ArrowRight: [.02, 0], ArrowUp: [0, -.02], ArrowDown: [0, .02] }[event.key];
    if (!step || !photo) return;
    event.preventDefault();
    setOffset(value => clamp({ x: value.x + step[0]!, y: value.y + step[1]! }));
  };

  /** Cuts exactly what the round frame shows into a 512 px square, so the saved picture matches the preview. */
  const exportCrop = (src: string) => new Promise<string>(resolve => {
    const img = new Image();
    img.onload = () => {
      const z = zoom / 100, side = img.width;
      const size = (1 - RING * 2) * side / z;
      const left = ((RING - .5 - offset.x) / z + .5) * side, top = ((RING - .5 - offset.y) / z + .5) * side;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      canvas.getContext('2d')?.drawImage(img, left, top, size, size, 0, 0, 512, 512);
      resolve(canvas.toDataURL('image/jpeg', .88));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });

  const save = async () => {
    if (tab === 'import' && photo) onSave({ kind: 'photo', src: await exportCrop(photo), zoom: 100 });
    else if (tab === 'avatar') onSave({ kind: 'preset', index: preset });
    onOpenChange(false);
  };
  const canSave = tab === 'avatar' || Boolean(photo);

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="tv-overlay" />
      <Dialog.Content className="pd-dialog" aria-describedby={undefined} onCloseAutoFocus={restoreFocus}>
        <div className="pd-head"><Dialog.Title className="pd-title">Photo de profil</Dialog.Title><Dialog.Close className="tv-close pd-close" aria-label="Fermer"><X /></Dialog.Close></div>
        <div className="pd-tabs" role="tablist" aria-label="Source de la photo">
          <button type="button" role="tab" aria-selected={tab === 'import'} className={tab === 'import' ? 'is-on' : ''} onClick={() => setTab('import')}>Importer une photo</button>
          <button type="button" role="tab" aria-selected={tab === 'avatar'} className={tab === 'avatar' ? 'is-on' : ''} onClick={() => setTab('avatar')}>Choisir un avatar</button>
        </div>

        {tab === 'import'
          ? <div className="pd-import">
              {photo
                ? <div ref={frame} className="pd-crop is-draggable" tabIndex={0} role="group" aria-label="Recadrage : faites glisser la photo ou utilisez les flèches du clavier"
                    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onKeyDown={onKeyDown}>
                    <img src={photo} alt="Aperçu de votre photo" draggable={false} style={{ transform: `translate(${offset.x * 100}%, ${offset.y * 100}%) scale(${zoom / 100})` }} />
                    <span className="pd-ring" aria-hidden="true" />
                    <span className="pd-hint" aria-hidden="true">Faites glisser pour ajuster</span>
                  </div>
                : <label className="pd-crop" htmlFor="pd-file">
                <span className="pd-drop"><strong>Choisir une image</strong><small>JPG, PNG ou WebP · 5 Mo maximum · 400 × 400 px minimum</small></span>
                <span className="pd-ring" aria-hidden="true" />
              </label>}
              <input id="pd-file" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void pick(event)} />
              {photo && <label className="pd-zoom" htmlFor="pd-zoom">Zoom<input id="pd-zoom" type="range" min={100} max={200} value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label>}
              {photo && <label htmlFor="pd-file" className="sp-btn is-text pd-replace"><ImageUp aria-hidden="true" />Choisir une autre image</label>}
              {error && <p className="pd-error" role="alert">{error}</p>}
            </div>
          : <div className="pd-presets" role="radiogroup" aria-label="Avatars MILLENIUM">
              {avatarArt.map((src, index) => <button key={src} type="button" role="radio" aria-checked={preset === index} aria-label={`Avatar ${index + 1}`} className={preset === index ? 'is-on' : ''} onClick={() => setPreset(index)}><img src={src} alt="" /></button>)}
            </div>}

        <div className="pd-foot">
          <button type="button" className="sp-btn is-text pd-remove" disabled={!current} onClick={() => { onSave(null); onOpenChange(false); }}><Trash2 aria-hidden="true" />Retirer la photo</button>
          <div className="sp-actions">
            <Dialog.Close className="sp-btn is-ghost">Annuler</Dialog.Close>
            <button type="button" className="sp-btn" disabled={!canSave} onClick={() => void save()}><Check aria-hidden="true" />Enregistrer</button>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
