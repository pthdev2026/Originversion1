// Vérifie la chaîne Bunny de bout en bout, AVEC LES VRAIS IDENTIFIANTS :
//   1. envoi d'un petit fichier dans la zone de stockage   2. lecture via le CDN avec un jeton valide (attendu : 200)
//   3. lecture SANS jeton (attendu : refus)                4. lecture avec un jeton expiré (attendu : refus)
//   5. nettoyage
// Usage : DELIVERY_MODE=bunny npm run cdn:check   (les clés viennent de .env, jamais de la ligne de commande)
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../src/config/env.ts';
import { BUNNY_HLS_PREFIX } from '../src/modules/playback/delivery.ts';
import { bunnySignedUrl } from '../src/modules/media/bunny-token.ts';

const config = loadConfig();
const { cdnUrl, tokenKey, storageZone, storageKey, storageHost } = config.delivery;
if (!cdnUrl || !tokenKey || !storageZone || !storageKey) {
  console.error('Renseignez BUNNY_CDN_URL, BUNNY_TOKEN_KEY, BUNNY_STORAGE_ZONE et BUNNY_STORAGE_KEY dans api/.env.');
  process.exit(1);
}

const id = `check-${randomBytes(4).toString('hex')}`;
const directory = `/${BUNNY_HLS_PREFIX}/${id}/`;
const storageUrl = `https://${storageHost}/${storageZone}/${BUNNY_HLS_PREFIX}/${id}/master.m3u8`;
let failures = 0;
const report = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const put = await fetch(storageUrl, { method: 'PUT', headers: { AccessKey: storageKey, 'Content-Type': 'application/octet-stream' }, body: '#EXTM3U\n#EXT-X-ENDLIST\n' });
report(put.ok, 'Envoi vers Bunny Storage', `HTTP ${put.status}`);

if (put.ok) {
  await new Promise(resolve => setTimeout(resolve, 1500)); // le temps que le CDN voie le fichier
  const expires = Math.floor(Date.now() / 1000) + 300;
  const good = await fetch(bunnySignedUrl({ cdnUrl, tokenKey }, directory, 'master.m3u8', expires));
  report(good.status === 200, 'Lecture avec jeton valide', `HTTP ${good.status} (attendu 200)`);
  const none = await fetch(`${cdnUrl}${directory}master.m3u8`);
  report([401, 403].includes(none.status), 'Lecture sans jeton refusée', `HTTP ${none.status} (attendu 401 ou 403)`);
  const stale = await fetch(bunnySignedUrl({ cdnUrl, tokenKey }, directory, 'master.m3u8', Math.floor(Date.now() / 1000) - 60));
  report([401, 403].includes(stale.status), 'Jeton expiré refusé', `HTTP ${stale.status} (attendu 401 ou 403)`);
  const otherDirectory = `/${BUNNY_HLS_PREFIX}/autre-contenu/`;
  const wrongPath = await fetch(`${cdnUrl}/bcdn_token=${bunnySignedUrl({ cdnUrl, tokenKey }, otherDirectory, 'x', expires).split('bcdn_token=')[1]?.split('&')[0]}&expires=${expires}&token_path=${encodeURIComponent(otherDirectory)}${directory}master.m3u8`);
  report([401, 403].includes(wrongPath.status), 'Jeton d’un autre répertoire refusé', `HTTP ${wrongPath.status} (attendu 401 ou 403)`);
}

const del = await fetch(`https://${storageHost}/${storageZone}/${BUNNY_HLS_PREFIX}/${id}/master.m3u8`, { method: 'DELETE', headers: { AccessKey: storageKey } });
report(del.ok || del.status === 404, 'Nettoyage', `HTTP ${del.status}`);

console.log(failures === 0 ? '\nTout est bon : la diffusion par Bunny est prête.' : `\n${failures} vérification(s) en échec : voir docs/GUIDE-BUNNY.md (section « Si ça échoue »).`);
process.exit(failures === 0 ? 0 : 1);
