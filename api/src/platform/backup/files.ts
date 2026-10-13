/**
 * Sauvegarde des FICHIERS qui ne se régénèrent pas (vidéos sources, images, sous-titres) et rotation des sauvegardes.
 *
 * Les rendus HLS (`videos/hls`) ne sont PAS sauvegardés : on peut toujours les refaire depuis les sources.
 * La copie est incrémentale : seuls les fichiers nouveaux ou modifiés (taille ou date) sont recopiés.
 * La sauvegarde de fichiers n'efface JAMAIS rien : supprimer une source par erreur ne supprime pas sa copie.
 */
import { copyFile, mkdir, readdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';

export interface CopyReport {
  copied: number;
  skipped: number;
  bytes: number;
}

export async function incrementalCopy(sourceRoot: string, destinationRoot: string): Promise<CopyReport> {
  const report: CopyReport = { copied: 0, skipped: 0, bytes: 0 };
  async function walk(relative: string): Promise<void> {
    const entries = await readdir(path.join(sourceRoot, relative), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const next = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        await walk(next);
      } else if (entry.isFile()) {
        const source = path.join(sourceRoot, next);
        const destination = path.join(destinationRoot, next);
        const [from, to] = await Promise.all([stat(source), stat(destination).catch(() => null)]);
        if (to && to.size === from.size && to.mtimeMs >= from.mtimeMs) {
          report.skipped += 1;
          continue;
        }
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(source, `${destination}.partial`);
        await rename(`${destination}.partial`, destination);
        report.copied += 1;
        report.bytes += from.size;
      }
    }
  }
  await walk('');
  return report;
}

/** Nom d'un dossier de sauvegarde : db-20261013T180000Z. */
export const backupFolderName = (date: Date): string => `db-${date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`;

export function parseBackupDate(name: string): Date | null {
  const match = /^db-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(name);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]))) : null;
}

/**
 * Rotation : on garde les `daily` plus récentes, plus la plus récente de chacune des `weekly` dernières semaines.
 * Retourne les noms à supprimer.
 */
export function selectBackupsToPrune(names: string[], options: { daily: number; weekly: number }): string[] {
  const dated = names
    .map(name => ({ name, date: parseBackupDate(name) }))
    .filter((item): item is { name: string; date: Date } => item.date !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const keep = new Set(dated.slice(0, options.daily).map(item => item.name));
  const weeks = new Set<string>();
  for (const item of dated) {
    const monday = new Date(item.date);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    if (!weeks.has(key) && weeks.size < options.weekly) {
      weeks.add(key);
      keep.add(item.name);
    }
  }
  return dated.filter(item => !keep.has(item.name)).map(item => item.name);
}
