// Test de charge. Usage :
//   npm run load:run -- --scenario api     --users 1000 --compress 60 --ramp 20
//   npm run load:run -- --scenario startup --users 1000 --ramp 30
//   npm run load:run -- --scenario origin  --users 100  --seconds 40
// L'API testée doit tourner (voir docs/TEST-DE-CHARGE.md) ; --base donne son adresse (défaut http://127.0.0.1:4100).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Agent, setGlobalDispatcher } from 'undici';
import { loadConfig } from '../../src/config/env.ts';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string): string => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
};
const scenario = opt('scenario', 'api');
const base = opt('base', 'http://127.0.0.1:4100');
const userCount = Number(opt('users', '1000'));
const compress = Number(opt('compress', '60'));
const rampSeconds = Number(opt('ramp', '20'));
const seconds = Number(opt('seconds', '40'));
const FILM_SECONDS = 7200;

setGlobalDispatcher(new Agent({ connections: 1500, pipelining: 1, keepAliveTimeout: 30_000, connect: { timeout: 10_000 } }));

const config = loadConfig();
const file = JSON.parse(await readFile(path.join(config.storageRoot, 'load', 'users.json'), 'utf8')) as {
  password: string; users: { id: string; email: string; token: string }[];
};
const viewers = file.users.slice(0, userCount);

// ── Mesures ───────────────────────────────────────────────────────────────
const samples = new Map<string, number[]>();
const errors = new Map<string, number>();
const statuses = new Map<string, number>();
let bytes = 0;
// Chaque spectateur a SA propre adresse IP (en-tête X-Forwarded-For, l'API de test est derrière un « proxy de confiance ») :
// la limitation de débit par IP se comporte comme en vrai, au lieu de voir 1 000 spectateurs comme une seule personne.
const ipStore = new AsyncLocalStorage<string>();
const ipOf = (index: number): string => `10.${(index >> 16) & 255}.${(index >> 8) & 255}.${index & 255}`;
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

interface Reply { text(): Promise<string>; json(): Promise<unknown>; headers: Headers }

async function timed(name: string, url: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; response?: Reply; ms: number }> {
  const begin = performance.now();
  try {
    const ip = ipStore.getStore();
    const headers = { ...(init.headers as Record<string, string> | undefined), ...(ip ? { 'x-forwarded-for': ip } : {}) };
    const response = await fetch(url, { ...init, headers });
    const body = await response.arrayBuffer();
    bytes += body.byteLength;
    const ms = performance.now() - begin;
    const ok = response.status < 400;
    (samples.get(name) ?? samples.set(name, []).get(name))?.push(ms);
    statuses.set(`${name} ${response.status}`, (statuses.get(`${name} ${response.status}`) ?? 0) + 1);
    if (!ok) errors.set(name, (errors.get(name) ?? 0) + 1);
    const decoded = Buffer.from(body).toString('utf8'); // le corps est lu une fois ; 204 : chaîne vide (pas de « new Response », interdit avec un 204)
    return { ok, status: response.status, response: { text: async () => decoded, json: async () => JSON.parse(decoded) as unknown, headers: response.headers }, ms };
  } catch {
    const ms = performance.now() - begin;
    errors.set(name, (errors.get(name) ?? 0) + 1);
    statuses.set(`${name} réseau`, (statuses.get(`${name} réseau`) ?? 0) + 1);
    return { ok: false, status: 0, ms };
  }
}

const pct = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};

function report(title: string, wallSeconds: number): void {
  console.log(`\n=== ${title} ===`);
  console.log('requête            nb      erreurs   p50 ms   p95 ms   p99 ms   max ms');
  let totalErrors = 0;
  let total = 0;
  for (const [name, values] of samples) {
    const failed = errors.get(name) ?? 0;
    totalErrors += failed;
    total += values.length;
    console.log(`${name.padEnd(18)} ${String(values.length).padStart(7)} ${String(failed).padStart(8)} ${pct(values, 50).toFixed(0).padStart(8)} ${pct(values, 95).toFixed(0).padStart(8)} ${pct(values, 99).toFixed(0).padStart(8)} ${Math.max(...values).toFixed(0).padStart(8)}`);
  }
  for (const [name, count] of errors) if (!samples.has(name)) { totalErrors += count; total += count; console.log(`${name.padEnd(18)} ${String(count).padStart(7)} ${String(count).padStart(8)}`); }
  console.log(`total : ${total} requêtes, ${totalErrors} erreurs (${total ? ((totalErrors / total) * 100).toFixed(2) : '0'} %), ${(total / wallSeconds).toFixed(0)} req/s, ${(bytes / wallSeconds / 125_000).toFixed(0)} Mb/s en moyenne`);
  const odd = [...statuses].filter(([key]) => !/ (200|201|204|206)$/.test(key));
  if (odd.length > 0) console.log('statuts inhabituels :', Object.fromEntries(odd));
}

// En production le cookie s'appelle __Host-origin_session (voir session-cookie.ts).
const cookieName = opt('cookie', '__Host-origin_session');
const cookieOf = (user: { token: string }): string => `${cookieName}=${user.token}`;
const deadlineMs = Date.now() + Number(opt('wall', '100000')) * 1000;
const get = (name: string, url: string, cookie?: string) => timed(name, url, cookie ? { headers: { cookie } } : {});

/** Lit la playlist maître puis la 1re qualité ; retourne les URLs de segments. */
async function readManifest(manifestUrl: string): Promise<string[]> {
  const master = await get('manifeste', manifestUrl);
  if (!master.ok || !master.response) return [];
  const text = await master.response.text();
  const variant = text.split('\n').find(line => line.endsWith('index.m3u8'));
  if (!variant) return [];
  const variantUrl = new URL(variant, manifestUrl).toString();
  const playlist = await get('playlist', variantUrl);
  if (!playlist.ok || !playlist.response) return [];
  return (await playlist.response.text()).split('\n').filter(line => line.endsWith('.m4s')).map(line => new URL(line, variantUrl).toString());
}

// --wall <s> : durée maximale de l'essai en secondes réelles (les spectateurs s'arrêtent à l'échéance).
// ── Scénario « browse » : parcourir le catalogue (accueil, fiches, recherche, similaires, « pour vous ») ──────────
// Chaque spectateur enchaîne des pages avec une pause de réflexion de 2 à 6 s, pendant `--seconds` secondes.
// Aucun cache HTTP côté client : c'est le pire cas (un navigateur réel réutiliserait les réponses de 30 s).
const SEARCH_WORDS = ['lumière', 'chemin', 'silence', 'retour', 'espérance', 'nuit', 'racines', 'pardon', 'voix', 'horizon', 'drame', 'foi'];
const randomItem = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)] as T;
async function browseViewer(index: number, deadline: number, slugs: string[]): Promise<void> {
  const user = viewers[index];
  if (!user) return;
  await sleep((index / viewers.length) * rampSeconds * 1000);
  const cookie = cookieOf(user);
  while (Date.now() < deadline) {
    await get('accueil', `${base}/api/home`, cookie);
    await sleep(2000 + Math.random() * 4000);
    const slug = randomItem(slugs);
    await get('fiche', `${base}/api/programs/${slug}`, cookie);
    await get('similaires', `${base}/api/programs/${slug}/similar`, cookie);
    await sleep(2000 + Math.random() * 4000);
    await get('recherche', `${base}/api/search?q=${encodeURIComponent(randomItem(SEARCH_WORDS))}`, cookie);
    await sleep(2000 + Math.random() * 4000);
    await get('pour vous', `${base}/api/recommendations`, cookie);
    await sleep(2000 + Math.random() * 4000);
  }
}

// ── Scénario « api » : 2 h de lecture accélérées, avec reprise et mesure ─────────────
async function apiViewer(index: number): Promise<void> {
  const user = viewers[index];
  if (!user) return;
  await sleep((index / viewers.length) * rampSeconds * 1000);
  const cookie = cookieOf(user);
  const playback = await get('lecture', `${base}/api/programs/load-film/playback`, cookie);
  if (!playback.ok || !playback.response) return;
  const info = (await playback.response.json()) as { manifestUrl: string };
  await readManifest(info.manifestUrl);

  const sessionId = randomUUID();
  let position = 0;
  let watched = 0;
  const stepMedia = 12;                       // une position envoyée toutes les 12 s de film (temps réel)
  const tick = (stepMedia * 1000) / compress; // … soit tous les (12 s / compress) ici
  while (position < FILM_SECONDS && Date.now() < deadlineMs) {
    await sleep(tick);
    position = Math.min(FILM_SECONDS, position + stepMedia);
    watched += stepMedia;
    await timed('progression', `${base}/api/me/progress/load-film`, {
      method: 'PUT', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ positionSeconds: position, sentAt: Date.now() }),
    });
    if (watched % 15 < stepMedia) { // un rapport de mesure environ toutes les 15 s de film
      await timed('mesure', `${base}/api/playback-sessions`, {
        method: 'POST', headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({
          id: sessionId, playbackId: 'load-film', startupMs: 700 + (index % 900), rebufferCount: index % 7 === 0 ? 1 : 0,
          rebufferMs: index % 7 === 0 ? 900 : 0, watchSeconds: watched, levelSeconds: { '720': watched }, maxHeight: 720,
          device: index % 3 === 0 ? 'mobile' : 'desktop', browser: 'Chrome', engine: 'hlsjs', connection: '4g',
        }),
      });
    }
  }
  if (position < FILM_SECONDS) return; // essai interrompu avant la fin : pas de contrôle d'intégrité
  const finalProgress = await get('reprise (fin)', `${base}/api/me/progress/load-film`, cookie);
  if (finalProgress.ok && finalProgress.response) {
    const body = (await finalProgress.response.json()) as { positionSeconds: number; completed: boolean };
    if (!body.completed || body.positionSeconds < FILM_SECONDS - 1) errors.set('intégrité', (errors.get('intégrité') ?? 0) + 1);
  }
}

// ── Scénario « startup » : tout le monde arrive en même temps (première) ──────────
async function startupViewer(index: number): Promise<void> {
  const user = viewers[index];
  if (!user) return;
  await sleep((index / viewers.length) * rampSeconds * 1000);
  const begin = performance.now();
  if (args.includes('--nologin')) {
    // Cas réaliste : le spectateur a déjà une session (cookie valable 30 jours), il n'y a pas de connexion à refaire.
    const cookie = cookieOf(user);
    const playback = await get('lecture', `${base}/api/programs/load-film/playback`, cookie);
    if (!playback.ok || !playback.response) return;
    const info = (await playback.response.json()) as { manifestUrl: string };
    const segments = await readManifest(info.manifestUrl);
    if (segments[0]) await get('1er segment', segments[0]);
    (samples.get('démarrage total') ?? samples.set('démarrage total', []).get('démarrage total'))?.push(performance.now() - begin);
    return;
  }
  const login = await timed('connexion', `${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, password: file.password }),
  });
  if (!login.ok || !login.response) return;
  const cookie = (login.response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const playback = await get('lecture', `${base}/api/programs/load-film/playback`, cookie);
  if (!playback.ok || !playback.response) return;
  const info = (await playback.response.json()) as { manifestUrl: string; ident: { show: boolean; manifestUrl: string | null } };
  const segments = await readManifest(info.manifestUrl);
  if (segments[0]) await get('1er segment', segments[0]);
  (samples.get('démarrage total') ?? samples.set('démarrage total', []).get('démarrage total'))?.push(performance.now() - begin);
}

// ── Scénario « origin » : N spectateurs à débit réel, 1 segment / 4 s ───────────────
async function originViewer(index: number, deadline: number): Promise<void> {
  const user = viewers[index];
  if (!user) return;
  await sleep(Math.random() * 3000);
  const playback = await get('lecture', `${base}/api/programs/load-film/playback`, cookieOf(user));
  if (!playback.ok || !playback.response) return;
  const info = (await playback.response.json()) as { manifestUrl: string };
  const segments = await readManifest(info.manifestUrl);
  if (segments.length === 0) return;
  let i = 0;
  while (Date.now() < deadline) {
    const begin = Date.now();
    const result = await get('segment', segments[i % segments.length] as string);
    if (result.ms > 4000) errors.set('segment > 4 s (coupure)', (errors.get('segment > 4 s (coupure)') ?? 0) + 1);
    i += 1;
    await sleep(Math.max(0, 4000 - (Date.now() - begin)));
  }
}

const wallStart = Date.now();
console.log(`Scénario « ${scenario} » : ${viewers.length} spectateurs → ${base}`);
if (scenario === 'api') {
  console.log(`Compression ×${compress} : 2 h de lecture en ${(FILM_SECONDS / compress / 60).toFixed(1)} min, montée en charge ${rampSeconds} s`);
  await Promise.all(viewers.map((_, index) => ipStore.run(ipOf(index), () => apiViewer(index))));
} else if (scenario === 'browse') {
  const home = await get('accueil', `${base}/api/home`, cookieOf(viewers[0] as { token: string }));
  const slugs = home.response ? ((await home.response.json()) as { collections: { items: { slug: string }[] }[] }).collections.flatMap(c => c.items.map(i => i.slug)) : [];
  if (slugs.length === 0) { console.error('Catalogue vide : lancez load:prepare avec --catalog 500.'); process.exit(1); }
  const deadline = Date.now() + seconds * 1000;
  await Promise.all(viewers.map((_, index) => ipStore.run(ipOf(index), () => browseViewer(index, deadline, slugs))));
} else if (scenario === 'startup') {
  await Promise.all(viewers.map((_, index) => ipStore.run(ipOf(index), () => startupViewer(index))));
} else if (scenario === 'origin') {
  const deadline = Date.now() + seconds * 1000;
  await Promise.all(viewers.map((_, index) => ipStore.run(ipOf(index), () => originViewer(index, deadline))));
} else {
  console.error('Scénario inconnu.');
  process.exit(1);
}
report(`Résultats : ${scenario}`, (Date.now() - wallStart) / 1000);
const failed = [...errors.values()].reduce((a, b) => a + b, 0);
process.exit(failed === 0 ? 0 : 2);
