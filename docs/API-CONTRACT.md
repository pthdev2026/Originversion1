# ORIGIN — Contrat d'API (v0.2, 13/10/2026)

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

## Prévu (pas encore disponible — ne pas le simuler)

| Domaine | Routes prévues | État |
|---|---|---|
| Reprise | `PUT /api/me/progress/:playbackId`, `GET /api/me/continue-watching` | Étape B3 |
| Ma liste | `GET/PUT/DELETE /api/me/list/:slug` | Étape B3 |
| Mesure | `POST /api/playback-sessions` (rapport cumulatif toutes les 15 s) | Étape B3 (branche `wip/playback-metrics`) |
| Catalogue | `GET /api/catalog/*` | Plus tard (hors périmètre actuel) |
