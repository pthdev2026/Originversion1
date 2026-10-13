// « Chien de garde » : vérifie que tout va bien et envoie une alerte quand un problème APPARAÎT ou DISPARAÎT.
// À lancer toutes les 5 minutes (cron / launchd : voir docs/EXPLOITATION.md). Une seule exécution par appel.
// Variables : WATCHDOG_API_URL (défaut http://127.0.0.1:4000), METRICS_TOKEN, ALERT_WEBHOOK_URL, BACKUP_DIR, MIN_FREE_GB.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../src/config/env.ts';
import { freeBytesOf, latestBackup } from '../src/platform/system/health.ts';

const config = loadConfig();
const api = process.env['WATCHDOG_API_URL'] ?? `http://127.0.0.1:${config.port}`;
const statePath = path.join(config.storageRoot, 'watchdog-state.json');

const problems = new Map<string, string>();

// 1. Le service répond-il, et peut-il travailler ?
try {
  const response = await fetch(`${api}/ready`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { checks?: Record<string, { ok: boolean; detail: string }> };
    const failing = Object.entries(body.checks ?? {}).filter(([, check]) => !check.ok).map(([name, check]) => `${name} : ${check.detail}`);
    problems.set('ready', `Le service n'est pas prêt (${failing.join(' ; ') || `HTTP ${response.status}`}).`);
  }
} catch {
  problems.set('ready', `L'API ne répond pas (${api}).`);
}

// 2. Tâches d'encodage en échec (si un jeton de supervision est configuré).
if (config.ops.metricsToken && !problems.has('ready')) {
  try {
    const text = await (await fetch(`${api}/metrics`, { headers: { Authorization: `Bearer ${config.ops.metricsToken}` }, signal: AbortSignal.timeout(5000) })).text();
    const failed = Number(/origin_media_jobs\{status="failed"\} (\d+)/.exec(text)?.[1] ?? 0);
    if (failed > 0) problems.set('jobs-failed', `${failed} tâche(s) d'encodage en échec : consulter /api/admin/jobs.`);
  } catch { /* le point 1 aura déjà signalé une panne */ }
}

// 3. Sauvegarde récente ?
const backup = await latestBackup(config.ops.backupDir);
if (!backup) problems.set('backup', `Aucune sauvegarde trouvée dans ${config.ops.backupDir}.`);
else if (Date.now() - backup.createdAt.getTime() > 26 * 3600 * 1000) {
  problems.set('backup', `Dernière sauvegarde trop ancienne : ${backup.name} (plus de 26 h).`);
}

// 4. Espace disque.
const free = await freeBytesOf(config.storageRoot).catch(() => null);
if (free !== null && free < config.ops.minFreeBytes) {
  problems.set('disk', `Espace disque bas : ${(free / 1024 ** 3).toFixed(1)} Go libres (minimum ${(config.ops.minFreeBytes / 1024 ** 3).toFixed(0)} Go).`);
}

// Alerte uniquement aux CHANGEMENTS d'état (pas de répétition toutes les 5 minutes).
const previous = new Set<string>(JSON.parse(await readFile(statePath, 'utf8').catch(() => '{"active":[]}')).active as string[]);
const messages: string[] = [];
for (const [key, message] of problems) if (!previous.has(key)) messages.push(`🔴 ${message}`);
for (const key of previous) if (!problems.has(key)) messages.push(`🟢 Rétabli : ${key}`);

for (const message of messages) {
  console.log(message);
  if (config.ops.alertWebhookUrl) {
    // « text » (Slack, Mattermost) et « content » (Discord) : le même corps convient aux deux.
    await fetch(config.ops.alertWebhookUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `[ORIGIN] ${message}`, content: `[ORIGIN] ${message}` }), signal: AbortSignal.timeout(8000),
    }).catch(error => console.error('Envoi de l’alerte impossible :', error instanceof Error ? error.message : error));
  }
}
if (messages.length === 0) console.log(problems.size === 0 ? '✅ Tout va bien.' : `⚠️ ${problems.size} problème(s) déjà signalé(s).`);

await mkdir(path.dirname(statePath), { recursive: true });
await writeFile(statePath, JSON.stringify({ active: [...problems.keys()], checkedAt: new Date().toISOString() }));
process.exitCode = problems.size === 0 ? 0 : 1;
