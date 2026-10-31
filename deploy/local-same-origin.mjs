#!/usr/bin/env node
/**
 * Simulation LOCALE de Caddy : une seule origine (http://localhost:8080) qui sert
 *   - l'API et les médias (/api, /media, /images, /files, /avatars, /subtitles, /uploads, /health, /ready) → API
 *   - tout le reste (pages, scripts, styles) → serveur du front (SSR)
 * Mêmes règles que deploy/Caddyfile : ce script ne sert qu'à valider l'architecture sans Docker ni Caddy.
 *   node deploy/local-same-origin.mjs [portProxy=8080] [portApi=4020] [portWeb=3500]
 * Jamais utilisé en production (pas de HTTPS ici).
 */
import http from 'node:http';

const [proxyPort = 8080, apiPort = 4020, webPort = 3500] = process.argv.slice(2).map(Number);
const API_PATHS = /^\/(api|media|images|files|avatars|subtitles|uploads|health|ready)(\/|\?|$)/;

http.createServer((request, response) => {
  const target = API_PATHS.test(request.url ?? '') ? apiPort : webPort;
  const upstream = http.request(
    { host: '127.0.0.1', port: target, path: request.url, method: request.method, headers: { ...request.headers, 'x-forwarded-for': request.socket.remoteAddress ?? '' } },
    answer => { response.writeHead(answer.statusCode ?? 502, answer.headers); answer.pipe(response); },
  );
  upstream.on('error', () => { if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain' }); response.end('Service indisponible'); });
  request.pipe(upstream);
}).listen(proxyPort, '127.0.0.1', () => console.log(`Origine unique : http://localhost:${proxyPort}  (API :${apiPort}, front :${webPort})`));
