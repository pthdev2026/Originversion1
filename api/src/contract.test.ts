/**
 * Garde-fou « contrat d'API » : docs/API-CONTRACT.md et le code ne doivent jamais diverger.
 *  1. Toute route documentée existe réellement (sinon le front code contre une route fantôme).
 *  2. Toute route publique/utilisateur/admin enregistrée est documentée (sinon le front ne peut pas la connaître).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { createApp } from './app.ts';
import { connect } from './platform/database/client.ts';
import { StorageLayout } from './platform/storage/layout.ts';
import type { IdentityService } from './modules/identity/service.ts';

const contract = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'API-CONTRACT.md'), 'utf8');

/** « /api/programs/:slug?x=1 » → « /api/programs/:p » : on compare la forme, pas le nom des paramètres. */
const shape = (route: string): string => route.replace(/\?.*$/, '').replace(/:[A-Za-z]+/g, ':p').replace(/\/+$/, '');

// Routes volontairement non décrites dans le contrat, avec la raison.
const UNDOCUMENTED = new Set([
  'GET /uploads/:p', 'PATCH /uploads/:p', 'DELETE /uploads/:p', // protocole tus : décrit en prose (section « Envoi de fichiers »)
]);

function registeredRoutes(): Set<string> {
  // Une connexion paresseuse suffit : aucune requête n'est envoyée, on lit seulement la table de routage.
  const sql = connect('postgres://origin:origin@127.0.0.1:1/origin', { max: 1 });
  const app = createApp({
    sql, logger: pino({ level: 'silent' }), storage: new StorageLayout('/tmp/origin-contract-unused'),
    mediaSecrets: ['secret-test-secret-test-secret-test!!'], mediaTtlSeconds: 60, corsOrigins: undefined, trustProxy: false,
    rateLimits: { apiPerMinute: 1, mediaPerMinute: 1, authPerMinute: 1, metricsPerMinute: 1 },
    identity: {} as unknown as IdentityService, cookieSecure: false, sessionTtlSeconds: 1, playbackRequiresLogin: false,
    uploadMaxBytes: 1, encodePreset: 'ultrafast',
  });
  void sql.end({ timeout: 0 });
  const routes = new Set<string>();
  for (const route of app.routes) {
    if (route.method === 'ALL' || (route.path.includes('*') && !route.path.startsWith('/media/'))) continue;
    routes.add(`${route.method} ${shape(route.path.replace(/\/\*$/, '/*'))}`);
  }
  return routes;
}

function documentedRoutes(): Set<string> {
  const routes = new Set<string>();
  for (const match of contract.matchAll(/`(GET|POST|PUT|PATCH|DELETE) (\/[^`\s…]*)`/g)) {
    routes.add(`${match[1]} ${shape((match[2] as string).replace(/\/\*$/, '/*'))}`);
  }
  return routes;
}

describe('contrat d’API', () => {
  const registered = registeredRoutes();
  const documented = documentedRoutes();

  it('toute route documentée existe dans le code', () => {
    const phantom = [...documented].filter(route => !registered.has(route)).sort();
    assert.deepEqual(phantom, [], 'routes décrites dans API-CONTRACT.md mais absentes du code');
  });

  it('toute route enregistrée est documentée', () => {
    const missing = [...registered].filter(route => !documented.has(route) && !UNDOCUMENTED.has(route)).sort();
    assert.deepEqual(missing, [], 'routes présentes dans le code mais absentes de API-CONTRACT.md');
  });

  it('l’analyse du contrat trouve bien un nombre plausible de routes', () => {
    assert.ok(documented.size >= 50, `seulement ${documented.size} routes détectées : le format du contrat a-t-il changé ?`);
  });
});
