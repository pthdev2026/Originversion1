/**
 * Appels à ffprobe et ffmpeg.
 *
 * On lance les outils comme des processus séparés, avec une liste d'arguments (jamais une chaîne passée
 * à un shell : aucune injection de commande possible).
 */
import { spawn } from 'node:child_process';
import { JobAbortedError, PermanentJobError } from './errors.ts';

export interface Tools {
  ffmpeg: string;
  ffprobe: string;
}

export interface ProbeResult {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  hasAudio: boolean;
}

/** Lance un processus et retourne sa sortie standard. Rejette si le code de sortie n'est pas 0. */
function run(command: string, args: string[], signal?: AbortSignal): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...(signal ? { signal } : {}) });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk).slice(-8000); // on ne garde que la fin : c'est là que ffmpeg écrit l'erreur
    });
    child.on('error', error => reject(error.name === 'AbortError' ? new JobAbortedError() : error));
    child.on('close', code => (code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} a échoué (code ${code}) : ${stderr.trim().split('\n').slice(-3).join(' | ')}`))));
  });
}

export async function checkTools(tools: Tools): Promise<void> {
  await run(tools.ffmpeg, ['-version']);
  await run(tools.ffprobe, ['-version']);
}

interface ProbeJson {
  streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string }[];
  format?: { duration?: string };
}

/** Lit les propriétés d'un fichier vidéo. Échoue de façon DÉFINITIVE si le fichier n'est pas exploitable. */
export async function probe(tools: Tools, file: string, signal?: AbortSignal): Promise<ProbeResult> {
  let output: string;
  try {
    ({ stdout: output } = await run(tools.ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], signal));
  } catch (error) {
    if (error instanceof JobAbortedError) throw error;
    throw new PermanentJobError(`Fichier illisible : ${error instanceof Error ? error.message : String(error)}`);
  }
  const info = JSON.parse(output) as ProbeJson;
  const video = info.streams?.find(stream => stream.codec_type === 'video');
  if (!video || !video.width || !video.height) throw new PermanentJobError('Le fichier ne contient aucune piste vidéo.');
  const duration = Number(info.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new PermanentJobError('Durée du fichier introuvable.');
  const [num, den] = String(video.r_frame_rate ?? '25/1').split('/').map(Number);
  const fps = den ? (num ?? 25) / den : (num ?? 25);
  return {
    durationSeconds: duration,
    width: video.width,
    height: video.height,
    fps: Number.isFinite(fps) && fps > 0 ? fps : 25,
    videoCodec: video.codec_name ?? 'inconnu',
    hasAudio: Boolean(info.streams?.some(stream => stream.codec_type === 'audio')),
  };
}

/** Profil et niveau H.264 d'un rendu, pour construire la chaîne CODECS de la playlist maître. */
export async function probeCodecString(tools: Tools, playlist: string): Promise<string> {
  const { stdout } = await run(tools.ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=profile,level', '-of', 'json', playlist]);
  const stream = (JSON.parse(stdout) as { streams?: { profile?: string; level?: number }[] }).streams?.[0];
  const profiles: Record<string, string> = { Baseline: '42', 'Constrained Baseline': '42', Main: '4d', High: '64' };
  const profileHex = profiles[stream?.profile ?? 'High'] ?? '64';
  const levelHex = Math.max(10, Math.min(stream?.level ?? 40, 62)).toString(16).padStart(2, '0');
  return `avc1.${profileHex}00${levelHex}`;
}

// ---- Normalisation du volume (EBU R128) ------------------------------------------------------------------------------
// Pourquoi : sans elle, un film mixé fort et une interview mixée bas obligent le spectateur à toucher au volume, et
// l'ident ORIGIN pourrait « crier » avant un programme discret. On amène tous les contenus à un même volume perçu
// (LUFS) en DEUX passes : mesure de la source, puis correction linéaire (pas de « pompage » de la dynamique).

export interface LoudnessMeasure {
  inputI: number;
  inputTP: number;
  inputLRA: number;
  inputThresh: number;
  targetOffset: number;
}

export interface LoudnessTarget {
  /** Volume cible en LUFS (streaming web : -16 ; plus fort que le cinéma, adapté aux téléphones). */
  lufs: number;
  /** Crête maximale autorisée, en dBTP (évite la saturation après compression AAC). */
  truePeak: number;
}

export const DEFAULT_LOUDNESS: LoudnessTarget = { lufs: -16, truePeak: -1.5 };

const finite = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/** Mesure le volume de la piste audio d'une source. Retourne null si la piste est muette ou illisible. */
export async function measureLoudness(tools: Tools, source: string, target: LoudnessTarget, signal?: AbortSignal): Promise<LoudnessMeasure | null> {
  const { stderr } = await run(tools.ffmpeg, [
    '-hide_banner', '-nostats', '-i', source, '-map', '0:a:0',
    '-af', `loudnorm=I=${target.lufs}:TP=${target.truePeak}:LRA=11:print_format=json`, '-f', 'null', '-',
  ], signal);
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stderr.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const inputI = finite(parsed['input_i']);
  const inputTP = finite(parsed['input_tp']);
  const inputLRA = finite(parsed['input_lra']);
  const inputThresh = finite(parsed['input_thresh']);
  const targetOffset = finite(parsed['target_offset']);
  // Silence complet : la mesure vaut « -inf », on ne corrige pas (corriger du silence n'a pas de sens).
  if (inputI === null || inputTP === null || inputLRA === null || inputThresh === null || targetOffset === null || inputI < -70) return null;
  return { inputI, inputTP, inputLRA, inputThresh, targetOffset };
}

/** Filtre audio de la deuxième passe : correction linéaire avec les valeurs mesurées. */
export function loudnormFilter(target: LoudnessTarget, measured: LoudnessMeasure): string {
  return [
    `loudnorm=I=${target.lufs}:TP=${target.truePeak}:LRA=11`,
    `measured_I=${measured.inputI}:measured_TP=${measured.inputTP}:measured_LRA=${measured.inputLRA}`,
    `measured_thresh=${measured.inputThresh}:offset=${measured.targetOffset}:linear=true`,
  ].join(':') + ',aresample=48000'; // loudnorm travaille en 192 kHz : on revient à 48 kHz
}

export interface RungOptions {
  source: string;
  outDir: string;
  height: number;
  videoKbps: number;
  audioKbps: number;
  preset: string;
  hasAudio: boolean;
  /** Filtre audio facultatif (normalisation du volume). */
  audioFilter?: string;
  segmentSeconds: number;
  durationSeconds: number;
  onProgress: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Encode UNE qualité en HLS (segments fMP4).
 * Une qualité à la fois : si le travailleur disparaît, seules les qualités terminées sont conservées
 * et on reprend à la suivante (point de reprise), au lieu de tout refaire.
 */
export async function encodeRung(tools: Tools, options: RungOptions): Promise<void> {
  const { videoKbps, audioKbps, segmentSeconds } = options;
  const args = [
    '-hide_banner', '-y', '-nostats', '-loglevel', 'error', '-progress', 'pipe:1',
    '-i', options.source,
    '-map', '0:v:0', ...(options.hasAudio ? ['-map', '0:a:0'] : []),
    '-vf', `scale=-2:${options.height}:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264', '-preset', options.preset, '-profile:v', 'high',
    '-b:v', `${videoKbps}k`, '-maxrate', `${Math.round(videoKbps * 1.07)}k`, '-bufsize', `${Math.round(videoKbps * 1.5)}k`,
    '-force_key_frames', `expr:gte(t,n_forced*${segmentSeconds})`, '-sc_threshold', '0',
    ...(options.hasAudio ? [...(options.audioFilter ? ['-af', options.audioFilter] : []), '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ac', '2'] : []),
    '-f', 'hls', '-hls_time', String(segmentSeconds), '-hls_playlist_type', 'vod', '-hls_segment_type', 'fmp4',
    '-hls_flags', 'independent_segments', '-hls_fmp4_init_filename', 'init.mp4',
    '-hls_segment_filename', `${options.outDir}/seg_%05d.m4s`, `${options.outDir}/index.m3u8`,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(tools.ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'], ...(options.signal ? { signal: options.signal } : {}) });
    let stderr = '';
    let buffer = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.startsWith('out_time_us=')) {
          const seconds = Number(line.slice('out_time_us='.length)) / 1e6;
          if (Number.isFinite(seconds) && seconds >= 0) options.onProgress(Math.min(1, seconds / options.durationSeconds));
        }
        newline = buffer.indexOf('\n');
      }
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    child.on('error', error => reject(error.name === 'AbortError' ? new JobAbortedError() : error));
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg a échoué (code ${code}) : ${stderr.trim().split('\n').slice(-3).join(' | ')}`))));
  });
}

/** Extrait une image fixe (affiche). */
export async function extractPoster(tools: Tools, source: string, outFile: string, atSeconds: number, signal?: AbortSignal): Promise<void> {
  await run(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(atSeconds), '-i', source, '-frames:v', '1', '-vf', 'scale=-2:720', '-q:v', '3', outFile], signal);
}
