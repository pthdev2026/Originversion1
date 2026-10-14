/**
 * Module « catalog » — accès aux données des programmes.
 *
 * Un « repository » est la SEULE couche qui écrit du SQL. Les routes et les services ne voient
 * que des objets TypeScript. Si demain la base change, seul ce fichier change.
 *
 * NB : le catalogue éditorial (visuels, synopsis, thèmes) viendra plus tard. Pour l'instant
 * ce module ne répond qu'à : « quels programmes ont au moins un média lisible ? ».
 */
import type { Sql } from '../../platform/database/client.ts';

export type ProgramKind = 'film' | 'serie' | 'documentaire';

export interface PlayableProgram {
  slug: string;
  kind: ProgramKind;
  title: string;
  isDemo: boolean;
  playableCount: number;
}

interface PlayableProgramRow {
  slug: string;
  kind: ProgramKind;
  title: string;
  is_demo: boolean;
  playable: string;
}

export async function listPlayablePrograms(sql: Sql): Promise<PlayableProgram[]> {
  const rows = await sql<PlayableProgramRow[]>`
    SELECT p.slug, p.kind, p.title, p.is_demo, count(m.playback_id)::text AS playable
    FROM programs p
    JOIN media_assets m ON m.program_slug = p.slug AND m.status = 'ready'
    WHERE p.kind <> 'brand'
    GROUP BY p.slug
    ORDER BY p.title`;
  return rows.map(row => ({
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    isDemo: row.is_demo,
    playableCount: Number(row.playable),
  }));
}
