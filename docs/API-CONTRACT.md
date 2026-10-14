# ORIGIN — Contrat d'API (v0.9, 15/10/2026)

Propriétaire : l'agent back-end. Toute modification est annoncée ici avant d'être déployée.
Limites : 120 requêtes par minute et par adresse IP sur `/api/*` ; en-têtes `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`.
Les réponses de `/api/*` ne doivent pas être mises en cache (`Cache-Control: no-store`), **sauf** le catalogue public (voir plus bas : `public, max-age=30`).
Base : variable `VITE_API_URL` côté front (défaut local : `http://127.0.0.1:4000`). Réponses en JSON UTF-8.

## Convention d'identifiant de lecture (`playbackId`)

| Contenu | `playbackId` |
|---|---|
| Film, documentaire | `<slug>` |
| Épisode de série | `<slug>-<episodeId>` (ex. `deux-fois-oui-s1-e1`) |

Expression régulière : `^[a-z0-9][a-z0-9-]*$`.

## Routes disponibles

### `GET /ready`
`200 {"status":"ready","checks":{database,storage,disk}}` · `503 {"status":"not_ready",...}` — le service peut-il travailler (base, stockage, espace disque) ? Pour la supervision, pas pour l'interface.

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
- En production (mode CDN), ces URLs pointent vers le domaine du CDN (`*.b-cdn.net`) : **ne jamais supposer le domaine ni le format**. Le lecteur n'a besoin que de l'URL.
- `manifestUrl` et `posterUrl` sont **opaques** : ne jamais les construire ni les analyser, ne pas les mettre en cache au-delà de `expiresAt`.
- Redemander `/playback` si `expiresAt` est dépassé (ou erreur 403 sur un segment).
- Lecture : hls.js (`Hls.isSupported()`), sinon lecture native HLS (Safari / iOS).

#### Ident de marque (`ident`, ajouté dans la réponse de lecture)

`GET /api/programs/:id/playback` renvoie aussi un objet `ident` : la séquence « ORIGIN » à jouer **avant** le programme.

```json
"ident": {
  "show": true,
  "reason": "first_view",
  "manifestUrl": "https://…/origin-ident/master.m3u8",
  "durationSeconds": 6.0,
  "skippableAfterSeconds": 2
}
```

| Paramètre de requête | Quand l'envoyer |
|---|---|
| `identSeen=1` | Le navigateur a déjà joué l'ident pour ce titre (visiteur **anonyme** : mémoire locale du navigateur) |
| `autoplay=1` | L'épisode est enchaîné automatiquement après le précédent |

`reason` ∈ `first_view` (à jouer) · `always` · `already_seen` · `resume` · `autoplay_next` · `unavailable` · `policy_off` · `is_brand_asset`.
**Le front suit `ident.show` sans réinterpréter** : toute la règle est côté serveur (une fois par titre par défaut, jamais à la reprise
ni à l'enchaînement automatique). Quand `show` est `false`, `manifestUrl`, `durationSeconds` et `skippableAfterSeconds` valent `null`.
`skippableAfterSeconds` : secondes avant lesquelles le bouton « Passer » n'est pas proposé.

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
`503` à la création si l'espace disque est insuffisant (message explicite à afficher). Au dernier octet, le serveur range la source et crée **automatiquement** la tâche d'encodage.

| Route | Réponse |
|---|---|
| `GET /api/admin/jobs?limit=30` | `{jobs:[{id, playbackId, title, status, step, progress, attempts, maxAttempts, lastError, createdAt, startedAt, finishedAt}]}` |
| `GET /api/admin/jobs/:id` | une tâche (même forme) |
| `POST /api/admin/jobs/:id/cancel` | `204` · `409` |
| `POST /api/admin/jobs/:id/retry` | `204` (tâche échouée ou annulée) · `409` |

`GET /api/admin/system` (administrateur) : `{ready, checks, uptimeSeconds, jobs, runningJobs, users, migrationsApplied, lastBackup}` — pour un tableau de bord d'exploitation.

`status` ∈ `queued | running | succeeded | failed | canceled`. `progress` : 0 à 100. Interroger toutes les 5 à 10 s.
Le contenu devient lisible (`GET /api/programs/:id/playback` ≠ 404) **uniquement** quand `status` vaut `succeeded`.

## Catalogue éditorial (disponible — v0.7)

Remplace les fichiers `src/lib/origin-*.ts`, `productions.ts`, `pth-originals.ts` du front. Lecture publique, sans compte,
`Cache-Control: public, max-age=30` (une modification éditoriale est visible en 30 s au plus). Les brouillons
(`published: false`) et les contenus de marque n'apparaissent jamais.

Visuels : `images.*`, `heroVideoUrl`, `image` valent soit `https://…`, soit un chemin **à préfixer par l'adresse de l'API**
(`/images/<slug>/<fichier>`). Le front ne construit jamais d'adresse : il utilise la valeur reçue. `null` = pas de visuel.

### Fiche résumée d'un programme (`ProgramCard`)
```json
{
  "slug": "derniere-sortie", "kind": "film", "title": "Dernière sortie", "titleLines": ["DERNIÈRE", "SORTIE"],
  "tagline": "La nuit ne pardonne pas…", "synopsis": "…", "category": "Film original", "durationLabel": "48 min",
  "badges": ["Nouveau"], "themes": ["foi", "famille"],
  "images": { "poster": "/images/derniere-sortie/poster.jpg", "hero": "…", "logo": null, "alt": "…", "focus": "50% 30%" },
  "heroVideoUrl": "/images/derniere-sortie/teaser.mp4", "titleStyle": "condensed", "isDemo": true,
  "playable": false
}
```
- **`playable`** est la seule vérité sur la lecture : le bouton « Regarder » n'apparaît que s'il vaut `true`. `isDemo: true` = contenu de démonstration.
- `titleStyle` ∈ `condensed | serif | bebas | italic-serif | null` (personnalité typographique des cartes de suggestion).
- `durationLabel` est un libellé éditorial (« 52 min », « 6 épisodes »), pas la durée réelle du média.

### Routes
| Route | Réponse |
|---|---|
| `GET /api/home` | `{collections: Collection[], themes: Theme[], creators: Creator[]}` — **toute la page d'accueil en un appel**, collections dans l'ordre d'affichage |
| `GET /api/programs/:slug` | Fiche complète (voir ci-dessous) · `404` si inconnu ou brouillon |
| `GET /api/collections/:slug` | `Collection` · `404` |
| `GET /api/themes` | `{themes: [{slug, title, image, programCount}]}` |
| `GET /api/themes/:slug` | `{programs: ProgramCard[]}` · `404` |
| `GET /api/creators` | `{creators: [{slug, name, showTitle, intro, themes, ambience, image, imageAlt, imageFocus, isProvisional}]}` |
| `GET /api/search?q=…&limit=20` | `{query, programs: ProgramCard[], creators: Creator[]}` — 2 à 80 caractères ; sans accents ni casse ; plusieurs mots = tous requis ; titres d'abord |

`Collection` : `{slug, title, layout, badge, viewAllUrl, items: (ProgramCard & {rank})[]}`.
`layout` ∈ `hero | ranked | rail | portrait | panels | universes` — dit **comment** l'afficher ; `rank` (1, 2, 3…) sert au Top 10.
Slugs actuellement importés : `hero`, `top-10`, `suggestions`, `universes`, `pth-originals`, `nouveautes`, `suspense`, `drama`, `couple`, `science-fiction`.

Fiche complète = `ProgramCard` + :
```json
{
  "trailerUrl": null, "presenter": "Chantal",
  "meta": { "year": 2026, "language": "Français", "rating": null, "genres": ["Podcast", "Interview"] },
  "seasons": [ { "number": 1, "title": null, "episodes": [
    { "id": "s1-e1", "number": 1, "title": "Le premier appel", "synopsis": "…", "durationLabel": "47 min",
      "image": "/images/…", "imageAlt": "…", "playbackId": "les-secrets-du-ministere-s1-e1", "playable": true } ] } ]
}
```
- Film / documentaire sans épisodes déclarés : une saison avec une seule entrée `id: "feature"`, `playbackId` = slug.
- **Utiliser `playbackId` tel quel** pour `GET /api/programs/:playbackId/playback` (plus de reconstruction côté front).
- Série sans épisode déclaré mais avec des médias prêts : ils sont exposés automatiquement (`Épisode N`).

### Correspondance avec les fichiers du front
| Fichier du front | Source API |
|---|---|
| `origin-programs.ts` (Hero) | `collections[slug=hero].items` |
| `origin-top-ten.ts` | `collections[slug=top-10].items` (`rank`) |
| `origin-suggestions.ts` | `collections[slug=suggestions].items` (`durationLabel`, `titleStyle`) |
| `origin-testimonials.ts` | `collections[slug=universes].items` |
| `origin-catalogs.ts` (rails, thématiques) | `collections[…]` et `themes` ; contenu d'une thématique : `GET /api/themes/:slug` |
| `origin-creators.ts` | `creators` |
| `productions.ts`, `pth-originals.ts` | `GET /api/programs/:slug` (saisons, épisodes, méta) |
| `watch-catalog.ts` (`searchCatalog`, `similarTo`) | `GET /api/search`, `GET /api/programs/:slug/similar` |
| `nav` / `navSections` | reste dans le front |

## Recommandations (disponible — v0.7)

Chaque élément porte **sa raison**, à afficher telle quelle (« Parce que vous avez regardé « X » »). Pas de boîte noire.
`items: [{ program: ProgramCard, reason: string }]` · `limit` : 1 à 30 (défaut 10).

| Route | Accès | Description |
|---|---|---|
| `GET /api/programs/:slug/similar` | public | « Dans le même esprit » : thématiques, genres, type, catégorie communs |
| `GET /api/trending` | public | Ce qui est réellement regardé (14 jours) ; complété par la sélection éditoriale tant que les données manquent |
| `GET /api/recommendations` | public / compte | Anonyme : tendances (`personalized: false`). Connecté avec historique : personnalisé (`personalized: true`), contenus déjà vus ou en liste exclus |

Règle d'affichage : afficher « Pour vous » **seulement si `personalized` vaut `true`** ; sinon « Populaire en ce moment ».

## Administration éditoriale (disponible — v0.7, administrateur uniquement)

Tout est un document **complet** (remplace l'existant) validé strictement : un champ inconnu ou une adresse d'image invalide → `400`.
Par défaut un élément est un **brouillon** (`published: false`) : rien n'est public tant que l'administrateur ne le décide pas.

| Route | Corps | Réponses |
|---|---|---|
| `GET /api/admin/catalog` | — | `{programs, collections}` brouillons inclus |
| `PUT /api/admin/programs/:slug` | programme + `themes[]` + `seasons[{number,title,episodes[{key,number,title,…}]}]` | `201 {slug,result:"created"}` · `200 {…"updated"}` · `400` |
| `DELETE /api/admin/programs/:slug` | — | `204` · `404` |
| `PUT /api/admin/themes/:slug` | `{title, imageUrl?, position?}` | `204` |
| `PUT /api/admin/creators/:slug` | `{name, showTitle?, intro?, themes?, ambience?, imageUrl?, imageAlt?, imageFocus?, isProvisional?, published?, position?}` | `204` |
| `PUT /api/admin/collections/:slug` | `{title, layout, badge?, viewAllUrl?, homePosition?, published?, items: [slug,…]}` (l'ordre = l'affichage) | `204` · `400` (programme inconnu) |
| `DELETE …/themes|creators|collections/:slug` | — | `204` · `404` |

`homePosition` : place sur l'accueil (`null` = hors accueil). L'identifiant de lecture d'un épisode est toujours `<slug>-<key>`.
Import en masse : `npm run catalog:import -- fichier.json` ; export du catalogue de démo du front : `npm run catalog:export-front`.

## Recherche, e-mails
- La réinitialisation de mot de passe envoie un **vrai e-mail** quand `MAIL_PROVIDER=resend` (sinon : journal). Le lien pointe vers
  `{PUBLIC_APP_URL}/reinitialiser?token=…` : **le front doit fournir cette page** (appelle `POST /api/auth/password/reset`).

## Sous-titres (disponible — v0.8)

La réponse de `GET /api/programs/:id/playback` contient désormais **`subtitles`** (tableau, vide s'il n'y en a pas) :
```json
"subtitles": [ { "lang": "fr", "label": "Français", "default": true, "url": "https://api…/subtitles/<playbackId>/fr.vtt" } ]
```
- `url` est absolue, à donner telle quelle à `<track kind="subtitles" srclang={lang} label={label} src={url} default={default}>`
  (ajouter `crossOrigin="anonymous"` sur `<video>` : l'API envoie les en-têtes CORS).
- Une seule piste `default: true` au plus. Le fichier est du WebVTT UTF-8 ; `GET` public, cache 1 h.
- Dépôt (administrateur) : `PUT /files/subtitles/:playbackId/:lang?label=Français&default=true` avec le fichier WebVTT brut comme corps
  (1 Mo au plus, doit commencer par `WEBVTT`) → `204` · `400` fichier invalide · `404` média inconnu · `413` trop gros.
  Suppression : `DELETE /files/subtitles/:playbackId/:lang` → `204` · `404`.
- `lang` : `fr`, `en`, `es`, `pt-BR`…

## Tableau de bord éditorial (disponible — v0.9, administrateur uniquement)

`GET /api/admin/metrics/programs?days=30&limit=50` →
```json
{ "periodDays": 30,
  "totals": { "accounts": 120, "newAccounts": 14, "activeViewers": 38, "views": 210, "watchHours": 96.4 },
  "programs": [ { "slug": "…", "title": "…", "kind": "film", "views": 80, "watchHours": 41.2, "avgWatchMinutes": 31.0,
                  "viewers": 30, "completionRate": 0.43, "startupP75Ms": 910, "errorRate": 0.0, "rebufferRatio": 0.001 } ],
  "catalogHealth": { "published": 36, "playable": 2, "publishedWithoutMedia": ["…"] } }
```
Une « lecture » = session d'au moins 10 s. Agrégats uniquement : aucun identifiant de compte ni e-mail.

## Erreurs de disponibilité (v0.9)
Une panne ou une saturation de la base répond **`503 {"error":"unavailable"}` avec `Retry-After: 5`** (jamais une 500) :
le front doit afficher « Service momentanément indisponible » et proposer de réessayer. Un doublon répond `409 conflict`.

## Prévu (pas encore disponible — ne pas le simuler)

| Domaine | Routes prévues | État |
|---|---|---|
| Langues audio multiples | pistes audio dans le manifeste | Après les premiers contenus réels |
| Paiement / abonnement | — | Si le modèle devient payant |
