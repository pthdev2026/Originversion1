import { describe, expect, it } from 'vitest';
import { detectTv, pickNext, type Box } from '@/lib/tv-mode';

const box = (x: number, y: number, size = 100): Box => ({ left: x, top: y, right: x + size, bottom: y + size });

describe('detectTv', () => {
  it('reconnaît les navigateurs de télévision', () => {
    expect(detectTv('Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0)', '', null)).toBe(true);
    expect(detectTv('Mozilla/5.0 (Web0S; Linux/SmartTV)', '', null)).toBe(true);
    expect(detectTv('Mozilla/5.0 (Macintosh) Chrome/120', '', null)).toBe(false);
  });
  it('obéit à ?tv=1 / ?tv=0 puis à la mémoire', () => {
    expect(detectTv('Chrome', '?tv=1', null)).toBe(true);
    expect(detectTv('Tizen', '?tv=0', null)).toBe(false);
    expect(detectTv('Chrome', '', '1')).toBe(true);
  });
});

describe('pickNext', () => {
  const from = box(500, 500);
  it('choisit le voisin dans la direction, en restant sur la même ligne', () => {
    const items = [box(700, 500), box(700, 900), box(100, 500), box(500, 100), box(500, 700)];
    expect(pickNext(from, items, 'right')).toBe(0);
    expect(pickNext(from, items, 'left')).toBe(2);
    expect(pickNext(from, items, 'up')).toBe(3);
    expect(pickNext(from, items, 'down')).toBe(4);
  });
  it('ne renvoie rien quand il n\'y a personne dans la direction', () => {
    expect(pickNext(from, [box(100, 500)], 'right')).toBe(-1);
  });
});
