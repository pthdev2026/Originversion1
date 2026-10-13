/**
 * Lecture et écriture de playlists HLS (.m3u8), sans dépendance.
 * Une playlist « média » liste les segments d'UNE qualité ; la playlist « maître » liste les qualités.
 */

export interface MediaPlaylist {
  mapUri: string | null;
  ended: boolean;
  targetDuration: number;
  segments: { uri: string; duration: number }[];
}

export function parseMediaPlaylist(text: string): MediaPlaylist {
  const lines = text.split(/\r?\n/).map(line => line.trim());
  if (lines[0] !== '#EXTM3U') throw new Error('Playlist invalide : #EXTM3U manquant.');
  const result: MediaPlaylist = { mapUri: null, ended: false, targetDuration: 0, segments: [] };
  let pendingDuration: number | null = null;
  for (const line of lines) {
    if (line.startsWith('#EXT-X-MAP:')) {
      result.mapUri = /URI="([^"]+)"/.exec(line)?.[1] ?? null;
    } else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      result.targetDuration = Number(line.split(':')[1]);
    } else if (line === '#EXT-X-ENDLIST') {
      result.ended = true;
    } else if (line.startsWith('#EXTINF:')) {
      pendingDuration = Number(line.slice('#EXTINF:'.length).split(',')[0]);
    } else if (line && !line.startsWith('#') && pendingDuration !== null) {
      result.segments.push({ uri: line, duration: pendingDuration });
      pendingDuration = null;
    }
  }
  return result;
}

export interface RenditionEntry {
  uri: string;
  bandwidth: number;
  averageBandwidth: number;
  width: number;
  height: number;
  codecs: string;
}

export function buildMasterPlaylist(entries: RenditionEntry[], hasAudio: boolean): string {
  // Les qualités sont listées de la plus haute à la plus basse.
  const sorted = [...entries].sort((a, b) => b.bandwidth - a.bandwidth);
  const lines = ['#EXTM3U', '#EXT-X-VERSION:7', '#EXT-X-INDEPENDENT-SEGMENTS'];
  for (const entry of sorted) {
    const codecs = hasAudio ? `${entry.codecs},mp4a.40.2` : entry.codecs;
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${entry.bandwidth},AVERAGE-BANDWIDTH=${entry.averageBandwidth},RESOLUTION=${entry.width}x${entry.height},CODECS="${codecs}"`,
      entry.uri,
    );
  }
  return `${lines.join('\n')}\n`;
}
