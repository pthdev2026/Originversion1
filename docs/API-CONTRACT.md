# ORIGIN — Contrat d'API (v0.4, 13/10/2026)

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

## Comptes (disponible — étape B2)

Session par **cookie httpOnly** (`origin_session`, ou `__Host-origin_session` en production). Le navigateur le gère seul :
le front ne lit ni n'écrit jamais ce cookie.

**Obligatoire côté front :** `fetch(..., { credentials: 'include' })` sur tous les appels `/api/*`, et front + API sur le **même site**
(dev : `http://localhost:3210` et `http://localhost:4000` — utiliser `localhost`, pas `127.0.0.1` ; prod : `origin.example` et `api.origin.example`).

Un utilisateur dans les réponses : `{ "id": "uuid", "email": "...", "displayName": "..." | null, "role": "viewer" | "admin" }`.

| Route | Corps | Réponses |
|---|---|---|
| `POST /api/auth/register` | `{email, password, displayName?, inviteCode?}` | `201 {user}` + cookie · `400` (e-mail ou mot de passe invalide) · `403` (invitation requise/invalide) · `409 conflict` (adresse déjà utilisée) |
| `POST /api/auth/login` | `{email, password}` | `200 {user}` + cookie · `401` (message unique) · `429` (compte verrouillé 15 min après 5 échecs) |
| `POST /api/auth/logout` | — | `204` |
| `GET /api/me` | — | `200 {user}` · `401` |
| `POST /api/auth/password/forgot` | `{email}` | `202` toujours (ne révèle pas si l'adresse existe) |
| `POST /api/auth/password/reset` | `{token, password}` | `200` · `400` (lien invalide, expiré ou déjà utilisé) |
| `POST /api/me/password` | `{currentPassword, newPassword}` | `200` (autres appareils déconnectés) · `401` |
| `POST /api/me/delete` | `{password}` | `204` (compte supprimé : droit à l'effacement) |
| `POST /api/admin/invitations` | `{note?, maxUses?, expiresInDays?}` | `201 {code}` (administrateur uniquement) |

Règles de mot de passe : 10 à 128 caractères, pas de mot de passe courant, pas l'adresse e-mail, pas trop répétitif.
Inscription : `REGISTRATION_MODE=open` (défaut) ou `invite`. Lecture : `PLAYBACK_REQUIRES_LOGIN=false` (défaut) ; si `true`,
`GET /api/programs/:id/playback` répond `401` à un visiteur anonyme (afficher l'écran de connexion).
Lien de réinitialisation : `{PUBLIC_APP_URL}/reinitialiser?token=<jeton>` → le front doit fournir cette page.
Toute écriture depuis un navigateur est refusée (`403`) si son en-tête `Origin` n'est pas dans `CORS_ORIGINS`.

## Reprise de lecture et « Ma liste » (disponible — étape B3)

Toutes ces routes exigent un compte connecté (`401` sinon) et `credentials: 'include'`.

| Route | Corps / paramètres | Réponses |
|---|---|---|
| `PUT /api/me/progress/:playbackId` | `{positionSeconds, durationSeconds?, sentAt?}` | `200 {playbackId, positionSeconds, durationSeconds, completed, updatedAt}` |
| `GET /api/me/progress/:playbackId` | — | `200` (même forme) · `404` = jamais commencé |
| `DELETE /api/me/progress/:playbackId` | — | `204` (retire de « Reprendre ») |
| `GET /api/me/continue-watching?limit=20` | — | `200 {items:[{playbackId, programSlug, title, kind, positionSeconds, durationSeconds, progressRatio, completed, updatedAt}]}` |
| `GET /api/me/list` | — | `200 {items:[{slug, addedAt}]}` (récents d'abord) |
| `PUT /api/me/list/:slug` | — | `204` (idempotent, 500 contenus au plus) |
| `DELETE /api/me/list/:slug` | — | `204` |

Règles de la reprise :
- Envoyer la position **toutes les 10 à 15 s** pendant la lecture, **à la pause**, **à la fermeture** (`fetch` avec `keepalive: true`).
- `sentAt` : horodatage du navigateur en millisecondes (`Date.now()`). Un envoi plus ancien qu'un envoi déjà reçu est ignoré.
- La durée de référence est celle du média côté serveur ; `durationSeconds` n'est utilisé que si le média est inconnu.
- `completed: true` à 95 % ou à moins de 30 s de la fin (contenus ≥ 2 min) : le contenu quitte « Reprendre ». Sous 10 s de lecture, il n'y est pas non plus.
- À l'ouverture du lecteur : `GET /api/me/progress/:playbackId`. Si `completed` est `true`, recommencer à 0. `404` : commencer à 0.
- `slug` d'une liste = identifiant du contenu côté front (`^[a-z0-9][a-z0-9-]*$`), il n'a pas besoin d'être lisible.

## Mesure de lecture (disponible — étape B3)

| Route | Accès | Réponses |
|---|---|---|
| `POST /api/playback-sessions` | Public (anonyme) | `204` · `400` |
| `GET /api/admin/metrics/playback?days=7&playbackId=` | Administrateur | `200` synthèse (démarrage p50/p75/p95, ratio de coupures, taux d'erreurs, qualités regardées, objectifs) |

Corps (JSON, peut être envoyé en `text/plain` avec `keepalive: true`) — rapport **cumulatif** de la session, toutes les ~15 s et à la fermeture :
```json
{
  "id": "uuid-v4 généré par le navigateur, un par session de lecture",
  "playbackId": "tout-recommencer",
  "startupMs": 820,
  "rebufferCount": 1, "rebufferMs": 1400,
  "watchSeconds": 312.5,
  "levelSeconds": { "480": 40, "720": 272.5 },
  "maxHeight": 720,
  "fatalError": null,
  "device": "mobile | tablet | desktop",
  "browser": "Chrome",
  "engine": "hlsjs | native",
  "connection": "4g"
}
```
Définitions : `startupMs` = de l'ouverture du lecteur à la première image jouée ; coupure = arrêt pour manque de données hors déplacement manuel.
Aucune donnée personnelle n'est conservée (ni adresse IP, ni compte, ni user-agent brut). Objectifs : démarrage < 2 s (p75), coupures < 1 %, erreurs < 1 %.
Limite : 120 rapports par minute et par adresse IP.

## Envoi de fichiers et tâches d'encodage (disponible — étape B4, **administrateur uniquement**)

Envoi **reprenable** selon le protocole tus 1.0.0 (https://tus.io). Compatible avec `tus-js-client` (`endpoint: <API>/uploads`, `chunkSize` conseillé : 50 Mio).
Toutes les requêtes portent `Tus-Resumable: 1.0.0` et le cookie de session (`credentials: 'include'`).

| Requête | En-têtes | Réponse |
|---|---|---|
| `POST /uploads` | `Upload-Length: <octets>`, `Upload-Metadata: filename <b64>, playbackId <b64>, kind <b64>, title <b64>[, programSlug <b64>, demo <b64>]` | `201` + `Location: /uploads/<id>` |
| `HEAD /uploads/:id` | — | `Upload-Offset`, `Upload-Length` |
| `PATCH /uploads/:id` | `Content-Type: application/offset+octet-stream`, `Upload-Offset: <octets>` | `204` + `Upload-Offset` · `409` (décalage incorrect : refaire un HEAD) |
| `DELETE /uploads/:id` | — | `204` |

Métadonnées : `playbackId` suit la convention d'identifiant de lecture ; `kind` ∈ `film | serie | documentaire` ; formats acceptés `.mp4 .mov .m4v .mkv .webm .avi .mxf` ; taille maximale 60 Go.
Au dernier octet, le serveur range la source et crée **automatiquement** la tâche d'encodage.

| Route | Réponse |
|---|---|
| `GET /api/admin/jobs?limit=30` | `{jobs:[{id, playbackId, title, status, step, progress, attempts, maxAttempts, lastError, createdAt, startedAt, finishedAt}]}` |
| `GET /api/admin/jobs/:id` | une tâche (même forme) |
| `POST /api/admin/jobs/:id/cancel` | `204` · `409` |
| `POST /api/admin/jobs/:id/retry` | `204` (tâche échouée ou annulée) · `409` |

`status` ∈ `queued | running | succeeded | failed | canceled`. `progress` : 0 à 100. Interroger toutes les 5 à 10 s.
Le contenu devient lisible (`GET /api/programs/:id/playback` ≠ 404) **uniquement** quand `status` vaut `succeeded`.

## Prévu (pas encore disponible — ne pas le simuler)

| Domaine | Routes prévues | État |
|---|---|---|
| Catalogue | `GET /api/catalog/*` (thèmes, collections, fiches) | Plus tard (hors périmètre actuel) |
| Recommandation | `GET /api/me/recommendations` (avec la raison de chaque proposition) | Après catalogue et données |
