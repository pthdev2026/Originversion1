import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { buildMasterPlaylist, parseMediaPlaylist } from './playlist.ts';
import { durationTolerance, QcError, validateRendition } from './qc.ts';

const playlist = (segments: number, options: { ended?: boolean; map?: boolean; duration?: number } = {}) =>
  [
    '#EXTM3U', '#EXT-X-VERSION:7', '#EXT-X-TARGETDURATION:4', '#EXT-X-PLAYLIST-TYPE:VOD',
    ...(options.map === false ? [] : ['#EXT-X-MAP:URI="init.mp4"']),
    ...Array.from({ length: segments }, (_, i) => `#EXTINF:${options.duration ?? 4}.000000,\nseg_${String(i).padStart(5, '0')}.m4s`),
    ...(options.ended === false ? [] : ['#EXT-X-ENDLIST']),
  ].join('\n');

let root: string;
before(async () => { root = await mkdtemp(path.join(tmpdir(), 'origin-qc-')); });
after(async () => { await rm(root, { recursive: true, force: true }); });

async function rendition(name: string, options: { segments: number; ended?: boolean; map?: boolean; missing?: number[]; empty?: number[]; init?: boolean }): Promise<string> {
  const dir = path.join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.m3u8'), playlist(options.segments, options));
  if (options.init !== false) await writeFile(path.join(dir, 'init.mp4'), Buffer.alloc(100, 1));
  for (let i = 0; i < options.segments; i += 1) {
    if (options.missing?.includes(i)) continue;
    await writeFile(path.join(dir, `seg_${String(i).padStart(5, '0')}.m4s`), options.empty?.includes(i) ? Buffer.alloc(0) : Buffer.alloc(5000, 2));
  }
  return dir;
}

describe('playlists HLS', () => {
  it('lit une playlist média', () => {
    const parsed = parseMediaPlaylist(playlist(3));
    assert.equal(parsed.segments.length, 3);
    assert.equal(parsed.ended, true);
    assert.equal(parsed.mapUri, 'init.mp4');
    assert.equal(parsed.segments[0]?.duration, 4);
  });

  it('refuse un fichier qui n’est pas une playlist', () => {
    assert.throws(() => parseMediaPlaylist('<html>pas du HLS</html>'));
  });

  it('construit la playlist maître, de la plus haute qualité à la plus basse', () => {
    const master = buildMasterPlaylist(
      [
        { uri: '360p/index.m3u8', bandwidth: 900_000, averageBandwidth: 800_000, width: 640, height: 360, codecs: 'avc1.64001e' },
        { uri: '1080p/index.m3u8', bandwidth: 5_400_000, averageBandwidth: 5_000_000, width: 1920, height: 1080, codecs: 'avc1.640028' },
      ],
      true,
    );
    assert.ok(master.indexOf('1080p') < master.indexOf('360p'));
    assert.match(master, /RESOLUTION=1920x1080,CODECS="avc1\.640028,mp4a\.40\.2"/);
  });
});

describe('contrôle qualité', () => {
  it('accepte un rendu complet et cohérent', async () => {
    const stats = await validateRendition(await rendition('ok', { segments: 5 }), 20);
    assert.equal(stats.segmentCount, 5);
    assert.equal(stats.durationSeconds, 20);
    assert.ok(stats.totalBytes >= 25_000);
  });

  it('refuse une playlist non terminée', async () => {
    await assert.rejects(validateRendition(await rendition('open', { segments: 5, ended: false }), 20), QcError);
  });

  it('refuse un segment manquant ou vide', async () => {
    await assert.rejects(validateRendition(await rendition('missing', { segments: 5, missing: [2] }), 20), /manquant ou vide/);
    await assert.rejects(validateRendition(await rendition('empty', { segments: 5, empty: [4] }), 20), /manquant ou vide/);
  });

  it('refuse un rendu trop court (encodage interrompu)', async () => {
    await assert.rejects(validateRendition(await rendition('short', { segments: 5 }), 7200), /Durée incohérente/);
  });

  it('refuse l’absence de segment d’initialisation', async () => {
    await assert.rejects(validateRendition(await rendition('noinit', { segments: 3, init: false }), 12), /initialisation/);
  });

  it('tolère 0,5 % d’écart sur un film de 2 h', () => {
    assert.equal(durationTolerance(10), 2);
    assert.equal(durationTolerance(7200), 36);
  });
});
