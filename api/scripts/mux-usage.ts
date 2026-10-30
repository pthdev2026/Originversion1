// Suivi de la consommation Mux. Sans option : lit UNIQUEMENT notre base (aucun appel à Mux, gratuit, sûr).
// Avec `--remote` : interroge Mux en LECTURE SEULE (liste de vos vidéos et de leur durée) pour recouper avec la base.
// Aucune création ni suppression, aucune consommation. Les tarifs ne sont pas codés ici : voir la grille Mux actuelle.
// Usage : npm run mux:usage   ou   npm run mux:usage -- --remote
import { loadConfig } from '../src/config/env.ts';
import { connect } from '../src/platform/database/client.ts';

const config = loadConfig();
const sql = connect(config.databaseUrl, { max: 1 });
try {
  const [local] = await sql<{ n: string; seconds: string | null }[]>`
    SELECT count(*)::text AS n, sum(duration_seconds)::text AS seconds FROM media_assets WHERE provider = 'mux' AND status = 'ready'`;
  const uploads = await sql<{ status: string; n: string }[]>`SELECT status, count(*)::text AS n FROM mux_uploads GROUP BY status ORDER BY status`;
  const seconds = Number(local?.seconds ?? 0);
  console.log('— Base ORIGIN (vidéos Mux prêtes) —');
  console.log(`  vidéos : ${local?.n ?? 0} · durée stockée : ${(seconds / 60).toFixed(1)} min (${(seconds / 3600).toFixed(2)} h)`);
  console.log(`  envois par statut : ${uploads.length ? uploads.map(row => `${row.status}=${row.n}`).join(', ') : 'aucun'}`);
  console.log('  (le stockage Mux se facture à la minute stockée ; la diffusion, à la minute regardée — voir la grille Mux)');

  if (process.argv.includes('--remote')) {
    if (!config.mux) throw new Error('Mux n’est pas configuré (MUX_TOKEN_ID / MUX_TOKEN_SECRET).');
    const auth = `Basic ${Buffer.from(`${config.mux.tokenId}:${config.mux.tokenSecret}`).toString('base64')}`;
    let total = 0;
    let count = 0;
    for (let page = 1; page <= 50; page += 1) {
      const response = await fetch(`https://api.mux.com/video/v1/assets?limit=100&page=${page}`, { headers: { authorization: auth } });
      if (!response.ok) throw new Error(`Mux a répondu ${response.status} (lecture seule).`);
      const body = (await response.json()) as { data?: { duration?: number }[] };
      const data = body.data ?? [];
      for (const asset of data) { count += 1; total += asset.duration ?? 0; }
      if (data.length < 100) break;
    }
    console.log('— Chez Mux (lecture seule) —');
    console.log(`  vidéos : ${count} · durée stockée : ${(total / 60).toFixed(1)} min (${(total / 3600).toFixed(2)} h)`);
    if (Math.abs(total - seconds) > 1) console.log('  ⚠ écart avec la base : des vidéos existent chez Mux sans être enregistrées ici (ou l’inverse).');
  } else {
    console.log('  (ajoutez --remote pour recouper avec Mux, en lecture seule)');
  }
} finally {
  await sql.end();
}
