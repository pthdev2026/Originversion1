// Vérifie la connexion à Mux avec VOS clés (api/.env) : crée une adresse d'envoi de test, lit sa réponse, puis l'annule.
// Sans option : ne dépose aucune vidéo et ne coûte rien.
// Avec `--video` : génère une vidéo de test de 4 s (ffmpeg), l'envoie à Mux, attend qu'elle soit prête, vérifie le lien de lecture
//                  puis SUPPRIME la vidéo chez Mux (essai complet de bout en bout ; encodage « basic » gratuit).
// Usage : npm run mux:check   ou   npm run mux:check -- --video
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config/env.ts';
import { createMuxClient, MuxError } from '../src/modules/mux/client.ts';
import { loadPrivateKey, signMuxToken } from '../src/modules/mux/jwt.ts';

const config = loadConfig();
if (!config.mux) {
  console.error('❌ Mux n’est pas configuré : renseignez MUX_TOKEN_ID et MUX_TOKEN_SECRET dans api/.env.');
  process.exit(1);
}
const client = createMuxClient({ tokenId: config.mux.tokenId, tokenSecret: config.mux.tokenSecret });
let failed = false;

try {
  const upload = await client.createDirectUpload({
    corsOrigin: '*', passthrough: 'origin-mux-check', playbackPolicy: config.mux.playbackPolicy,
    videoQuality: config.mux.videoQuality, normalizeAudio: config.mux.normalizeAudio, timeoutSeconds: 60,
  });
  console.log(`✅ Identifiants acceptés : Mux a créé une adresse d’envoi (statut « ${upload.status} », identifiant ${upload.id.slice(0, 6)}…).`);
  console.log(`   Adresse d’envoi reçue : ${upload.url ? 'oui' : 'NON (réponse inattendue)'} (non affichée : elle permet de déposer un fichier).`);
  if (!upload.url) failed = true;

  const read = await client.getUpload(upload.id);
  console.log(`✅ Relecture de l’envoi : statut « ${read.status} ».`);

  await client.cancelUpload(upload.id)
    .then(async () => console.log(`✅ Annulation acceptée (statut « ${(await client.getUpload(upload.id)).status} »).`))
    .catch(error => console.log(`ℹ️  Annulation non confirmée (${error instanceof MuxError ? error.message : String(error)}). L’adresse expirera d’elle-même en 60 s.`));
} catch (error) {
  failed = true;
  console.error(`❌ ${error instanceof MuxError ? error.message : String(error)}`);
}

if (process.argv.includes('--video') && !failed) {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const directory = await mkdtemp(path.join(tmpdir(), 'origin-mux-check-'));
  let assetId: string | null = null;
  try {
    const file = path.join(directory, 'test.mp4');
    const made = spawnSync(config.media.ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=4:size=640x360:rate=24',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file,
    ]);
    if (made.status !== 0) throw new Error(`ffmpeg introuvable ou en échec (${config.media.ffmpegPath}) : renseignez FFMPEG_PATH`);
    const bytes = await readFile(file);
    console.log(`\n▶ Essai complet : vidéo de test de ${(bytes.byteLength / 1024).toFixed(0)} Ko.`);

    const upload = await client.createDirectUpload({
      corsOrigin: '*', passthrough: 'origin-mux-check-video', playbackPolicy: config.mux.playbackPolicy, videoQuality: config.mux.videoQuality, normalizeAudio: false, timeoutSeconds: 600,
    });
    const sent = await fetch(upload.url as string, { method: 'PUT', body: new Uint8Array(bytes) });
    console.log(`  Envoi du fichier à Mux : HTTP ${sent.status} ${sent.ok ? '✅' : '❌'}`);
    if (!sent.ok) throw new Error('Mux a refusé le fichier envoyé.');

    const started = Date.now();
    let waited = 0;
    while (!assetId && waited < 90_000) {
      await sleep(2000);
      waited = Date.now() - started;
      const current = await client.getUpload(upload.id);
      assetId = current.assetId;
      if (['errored', 'cancelled', 'timed_out'].includes(current.status)) throw new Error(`Envoi terminé en « ${current.status} » : ${current.error ?? 'sans détail'}`);
    }
    if (!assetId) throw new Error('Mux n’a pas créé la vidéo dans les 90 s.');
    console.log(`  ✅ Vidéo créée chez Mux après ${(waited / 1000).toFixed(0)} s.`);

    let asset = await client.getAsset(assetId);
    while (asset.status !== 'ready' && asset.status !== 'errored' && Date.now() - started < 240_000) {
      await sleep(2000);
      asset = await client.getAsset(assetId);
    }
    console.log(`  Statut de la vidéo : « ${asset.status} » · durée lue par Mux : ${asset.durationSeconds ?? '?'} s · lecture : ${asset.playbackIds.map(p => p.policy).join(', ') || 'aucune'}`);
    console.log(`  ⏱  Prête ${((Date.now() - started) / 1000).toFixed(0)} s après l’envoi.`);
    if (asset.status !== 'ready') throw new Error(`La vidéo n’est pas prête : ${asset.errorMessage ?? asset.status}`);

    const playback = asset.playbackIds[0];
    if (playback?.policy === 'public') {
      const manifest = await fetch(`https://stream.mux.com/${playback.id}.m3u8`);
      const text = await manifest.text();
      console.log(`  Lien de lecture HLS : HTTP ${manifest.status} · ${text.startsWith('#EXTM3U') ? 'manifeste HLS valide ✅' : 'contenu inattendu ❌'}`);
      if (!manifest.ok || !text.startsWith('#EXTM3U')) failed = true;
      console.log(`  Qualités proposées : ${(text.match(/RESOLUTION=\d+x\d+/g) ?? []).join(', ') || 'non lisibles'}`);
    } else if (playback?.policy === 'signed') {
      // Lecture SIGNÉE : sans jeton → refus ; avec un jeton valide → manifeste ; avec le jeton d'une autre vidéo → refus.
      if (!config.mux.signing) throw new Error('Politique « signed » sans clé de signature (MUX_SIGNING_KEY_ID / MUX_SIGNING_PRIVATE_KEY).');
      const key = loadPrivateKey(config.mux.signing.privateKey);
      const tokenFor = (playbackId: string, seconds = 300) => signMuxToken({ key, keyId: config.mux!.signing!.keyId, playbackId, audience: 'v', expiresAtSeconds: Math.floor(Date.now() / 1000) + seconds });
      const url = `https://stream.mux.com/${playback.id}.m3u8`;
      const without = await fetch(url);
      const valid = await fetch(`${url}?token=${tokenFor(playback.id)}`);
      const text = await valid.text();
      const foreign = await fetch(`${url}?token=${tokenFor('autre-video-inconnue')}`);
      const expired = await fetch(`${url}?token=${tokenFor(playback.id, -60)}`);
      const checks: [string, boolean][] = [
        [`sans jeton → refusé (HTTP ${without.status})`, without.status === 403 || without.status === 401],
        [`jeton valide → manifeste HLS (HTTP ${valid.status})`, valid.ok && text.startsWith('#EXTM3U')],
        [`jeton d'une autre vidéo → refusé (HTTP ${foreign.status})`, foreign.status === 403 || foreign.status === 401],
        [`jeton expiré → refusé (HTTP ${expired.status})`, expired.status === 403 || expired.status === 401],
      ];
      for (const [label, ok] of checks) { console.log(`  Lecture signée : ${label} ${ok ? '✅' : '❌'}`); if (!ok) failed = true; }
    }
  } catch (error) {
    failed = true;
    console.error(`  ❌ ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (assetId) await client.deleteAsset(assetId).then(() => console.log('  🧹 Vidéo de test supprimée chez Mux.')).catch(error => console.log(`  ⚠️  Suppression à faire à la main dans Mux : ${error instanceof Error ? error.message : String(error)}`));
    await rm(directory, { recursive: true, force: true });
  }
}

console.log(`\nPolitique de lecture : ${config.mux.playbackPolicy} · qualité : ${config.mux.videoQuality} · voie par défaut du back-office : ${config.videoProvider}`);
if (config.mux.playbackPolicy === 'signed') {
  try {
    if (!config.mux.signing) throw new Error('MUX_SIGNING_KEY_ID / MUX_SIGNING_PRIVATE_KEY absents');
    const token = signMuxToken({ key: loadPrivateKey(config.mux.signing.privateKey), keyId: config.mux.signing.keyId, playbackId: 'test', audience: 'v', expiresAtSeconds: Math.floor(Date.now() / 1000) + 60 });
    console.log(`✅ Clé de signature lisible : jeton de lecture fabriqué (${token.split('.').length} parties).`);
  } catch (error) {
    failed = true;
    console.error(`❌ Clé de signature inutilisable : ${error instanceof Error ? error.message : String(error)}`);
  }
} else {
  console.log('ℹ️  Liens de lecture PUBLICS (pratique pour tester). Avant l’ouverture au public : MUX_PLAYBACK_POLICY=signed + une clé de signature.');
}
process.exit(failed ? 1 : 0);
