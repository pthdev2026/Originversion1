# ORIGIN — Contrat d'API (v0.1, 13/10/2026)

Propriétaire : l'agent back-end. Toute modification est annoncée ici avant d'être déployée.
Limites : 120 requêtes par minute et par adresse IP sur `/api/*` ; en-têtes `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`.
Les réponses de `/api/*` ne doivent pas être mises en cache (`Cache-Control: no-store`).
Base : variable `VITE_API_URL` côté front (défaut local : `http://127.0.0.1:4000`). Réponses en JSON UTF-8.

## Convention d'identifiant de lecture (`playbackId`)

| Contenu | `playbackId` |
|---|---|
| Film, documentaire | `<slug>` |
| Épisode de série | `<slug>-<episodeId>` (ex. `deux-fois-oui-s1-e1`) |

Expression régulière : `^[a-z0-9][a-z0-9-]*$`.

## Routes disponibles

### `GET /health`
`200 {"status":"ok","database":"ok"}` · `503 {"status":"degraded","database":"unreachable"}`

### `GET /api/programs`
Programmes ayant au moins un média prêt.
```json
{ "programs": [ { "slug": "tout-recommencer", "kind": "film", "title": "Tout recommencer", "isDemo": true, "playableCount": 1 } ] }
```
`kind` ∈ `film | serie | documentaire`.

### `GET /api/programs/:playbackId/playback`
`200`
```json
{
  "programId": "tout-recommencer",
  "status": "ready",
  "manifestUrl": "http://…/media/<jeton>/tout-recommencer/master.m3u8",
  "posterUrl": "http://…/media/<jeton>/tout-recommencer/poster.jpg",
  "durationSeconds": 15.083,
  "renditions": [ { "name": "1080p", "height": 1080, "videoKbps": 5000 } ],
  "expiresAt": "2026-10-13T16:00:00.000Z"
}
```
`404 {"error":"not_available","message":"…"}` : aucun média prêt. **Ce n'est pas une erreur technique** : afficher « pas encore disponible ».

Règles pour le front :
- `manifestUrl` et `posterUrl` sont **opaques** : ne jamais les construire ni les analyser, ne pas les mettre en cache au-delà de `expiresAt`.
- Redemander `/playback` si `expiresAt` est dépassé (ou erreur 403 sur un segment).
- Lecture : hls.js (`Hls.isSupported()`), sinon lecture native HLS (Safari / iOS).

### `GET /media/:jeton/:playbackId/*` (distribution HLS)
Géré par hls.js ; `Range` supporté. `403` : jeton invalide ou expiré. `404` : fichier absent.

## Erreurs

Toute réponse d'erreur a la forme `{ "error": "<code>", "message": "<texte>", "requestId": "<id>" }`.
`requestId` (aussi dans l'en-tête `X-Request-Id`) permet de retrouver la requête dans les journaux : à afficher dans les écrans d'erreur techniques.

| Statut | Corps | Attitude du front |
|---|---|---|
| 404 `not_available` | `{error,message}` | « Pas encore disponible » |
| 403 | `{error:"forbidden"}` | Redemander la lecture une fois, puis message d'erreur |
| 429 `rate_limited` | `{error,message,requestId}` + en-tête `Retry-After` (secondes) | Patienter `Retry-After` secondes puis réessayer ; ne pas boucler |
| 400 `bad_request` | `{error,message,requestId}` | Chemin ou requête invalide : ne pas réessayer |
| 5xx / réseau | — | « Service momentanément indisponible » + Réessayer |

## Prévu (pas encore disponible — ne pas le simuler)

| Domaine | Routes prévues | État |
|---|---|---|
| Comptes | `POST /api/auth/register`, `/login`, `/logout`, `GET /api/me` (cookie de session, `credentials: 'include'`) | Étape B2 |
| Reprise | `PUT /api/me/progress/:playbackId`, `GET /api/me/continue-watching` | Étape B3 |
| Ma liste | `GET/PUT/DELETE /api/me/list/:slug` | Étape B3 |
| Mesure | `POST /api/playback-sessions` (rapport cumulatif toutes les 15 s) | Branche `wip/playback-metrics` |
| Catalogue | `GET /api/catalog/*` | Plus tard (hors périmètre actuel) |
