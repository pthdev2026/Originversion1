#!/usr/bin/env node
// ORIGIN — encodage d'une vidéo source en HLS multi-débits (segments fMP4).
//
// Usage :
//   node encode-hls.mjs <source> <id-programme> [--out <dossier>] [--max-seconds <n>] [--preset <x264>]
//
// Variables d'environnement :
//   FFMPEG_PATH / FFPROBE_PATH   chemins des binaires (défaut : "ffmpeg" / "ffprobe" du PATH)
//
// Sortie : <out>/<id>/master.m3u8, v0/, v1/, ... + poster.jpg + meta.json
// Aucune dépendance npm : Node 18+ suffit.

import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

// Échelle de qualité. Débits vidéo en kb/s ; hauteur en pixels.
// Un palier n'est produit que si la source est au moins aussi haute (pas de sur-échantillonnage).
const LADDER = [
  { name: '1080p', height: 1080, videoKbps: 5000, audioKbps: 128 },
  { name: '720p', height: 720, videoKbps: 2800, audioKbps: 128 },
  { name: '480p', height: 480, videoKbps: 1400, audioKbps: 96 },
  { name: '360p', height: 360, videoKbps: 800, audioKbps: 96 },
];
const SEGMENT_SECONDS = 4;
const DEFAULT_PRESET = 'slow'; // hors ligne : on privilégie la qualité par Mo

function run(cmd, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'] });
    let out = '';
    let err = '';
    if (capture) {
      child.stdout.on('data', d => (out += d));
      child.stderr.on('data', d => (err += d));
    }
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve(out) : reject(new Error(`${cmd} a échoué (code ${code})\n${err}`))));
  });
}

async function probe(source) {
  const raw = await run(
    FFPROBE,
    ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', source],
    { capture: true },
  );
  const info = JSON.parse(raw);
  const video = info.streams.find(s => s.codec_type === 'video');
  if (!video) throw new Error('Aucune piste vidéo dans la source.');
  const hasAudio = info.streams.some(s => s.codec_type === 'audio');
  const [num, den] = String(video.r_frame_rate).split('/').map(Number);
  const fps = den ? num / den : num;
  return {
    width: video.width,
    height: video.height,
    fps: Number.isFinite(fps) && fps > 0 ? fps : 25,
    duration: Number(info.format.duration),
    hasAudio,
  };
}

function parseArgs(argv) {
  const positional = [];
  const opts = { out: path.resolve('output'), maxSeconds: null, preset: DEFAULT_PRESET };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') opts.out = path.resolve(argv[++i]);
    else if (argv[i] === '--max-seconds') opts.maxSeconds = Number(argv[++i]);
    else if (argv[i] === '--preset') opts.preset = argv[++i];
    else positional.push(argv[i]);
  }
  return { source: positional[0], id: positional[1], ...opts };
}

async function main() {
  const { source, id, out, maxSeconds, preset } = parseArgs(process.argv.slice(2));
  if (!source || !id) {
    console.error('Usage : node encode-hls.mjs <source> <id-programme> [--out <dossier>] [--max-seconds <n>] [--preset <x264>]');
    process.exit(1);
  }
  if (!existsSync(source)) throw new Error(`Source introuvable : ${source}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('id-programme : minuscules, chiffres et tirets uniquement.');

  const info = await probe(source);
  const rungs = LADDER.filter(r => r.height <= info.height);
  if (rungs.length === 0) {
    // Source plus petite que le plus bas palier : on garde sa hauteur d'origine.
    rungs.push({ name: `${info.height}p`, height: info.height - (info.height % 2), videoKbps: 600, audioKbps: 96 });
  }

  const gop = Math.round(info.fps * SEGMENT_SECONDS);
  const dir = path.join(out, id);
  await rm(dir, { recursive: true, force: true });
  for (let i = 0; i < rungs.length; i++) await mkdir(path.join(dir, `v${i}`), { recursive: true });

  const args = ['-hide_banner', '-y'];
  if (maxSeconds) args.push('-t', String(maxSeconds));
  args.push('-i', source);

  // Découpe du flux vidéo en N copies redimensionnées.
  const labels = rungs.map((_, i) => `[s${i}]`).join('');
  const chains = rungs.map((r, i) => `[s${i}]scale=-2:${r.height}:flags=lanczos,format=yuv420p[o${i}]`);
  args.push('-filter_complex', `[0:v]split=${rungs.length}${labels};${chains.join(';')}`);

  rungs.forEach((r, i) => {
    args.push('-map', `[o${i}]`);
    args.push(`-c:v:${i}`, 'libx264', `-preset:v:${i}`, preset, `-profile:v:${i}`, 'high');
    args.push(`-b:v:${i}`, `${r.videoKbps}k`, `-maxrate:v:${i}`, `${Math.round(r.videoKbps * 1.07)}k`, `-bufsize:v:${i}`, `${Math.round(r.videoKbps * 1.5)}k`);
    args.push(`-g:v:${i}`, String(gop), `-keyint_min:v:${i}`, String(gop), `-sc_threshold:v:${i}`, '0');
    if (info.hasAudio) {
      args.push('-map', '0:a:0', `-c:a:${i}`, 'aac', `-b:a:${i}`, `${r.audioKbps}k`, '-ac', '2');
    }
  });

  const streamMap = rungs.map((_, i) => (info.hasAudio ? `v:${i},a:${i}` : `v:${i}`)).join(' ');
  args.push(
    '-f', 'hls',
    '-hls_time', String(SEGMENT_SECONDS),
    '-hls_playlist_type', 'vod',
    '-hls_segment_type', 'fmp4',
    '-hls_flags', 'independent_segments',
    '-master_pl_name', 'master.m3u8',
    '-hls_segment_filename', path.join(dir, 'v%v', 'seg_%05d.m4s'),
    '-var_stream_map', streamMap,
    path.join(dir, 'v%v', 'index.m3u8'),
  );

  console.log(`Source : ${info.width}x${info.height} @ ${info.fps.toFixed(2)} i/s, ${info.duration.toFixed(1)} s`);
  console.log(`Paliers : ${rungs.map(r => r.name).join(', ')}`);
  const started = Date.now();
  await run(FFMPEG, args);
  const seconds = (Date.now() - started) / 1000;

  // Affiche de contrôle : image à 10 % de la durée.
  await run(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', String(Math.max(0, Math.min(info.duration, maxSeconds || info.duration) * 0.1)),
    '-i', source, '-frames:v', '1', '-vf', 'scale=-2:720', '-q:v', '3',
    path.join(dir, 'poster.jpg'),
  ]);

  const meta = {
    id,
    source: { width: info.width, height: info.height, fps: info.fps, durationSeconds: info.duration },
    encodedAt: new Date().toISOString(),
    encodeSeconds: seconds,
    segmentSeconds: SEGMENT_SECONDS,
    preset,
    renditions: rungs.map((r, i) => ({ index: i, name: r.name, height: r.height, videoKbps: r.videoKbps, audioKbps: r.audioKbps })),
  };
  await writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(`Terminé en ${seconds.toFixed(1)} s → ${path.join(dir, 'master.m3u8')}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
