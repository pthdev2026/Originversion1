# ORIGIN — Contrat d'API (v1.17, 31/10/2026)

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

### `GET /metrics`
Exposition Prometheus (texte) pour la supervision. Exige `Authorization: Bearer <METRICS_TOKEN>` ; `404` si `METRICS_TOKEN` n'est pas configuré. Pas pour l'interface.

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

#### Contexte de lecture (v1.8, ajouté dans la réponse de lecture)

```json
"content": { "programSlug": "ma-serie", "title": "Ma série", "kind": "serie", "episode": { "season": 1, "number": 2, "title": "Deux" } },
"resume": { "positionSeconds": 200 },
"markers": { "introStart": 5, "introEnd": 40, "creditsStart": 560 },
"next": { "playbackId": "ma-serie-s1-e3", "season": 1, "number": 3, "title": "Trois" }
```
- `content` : de quoi remplir la barre du lecteur sans second appel (`episode` = `null` pour un film).
- `resume` : `null` pour un visiteur, un contenu non commencé ou terminé, ou si l'**historique est désactivé**. Sinon démarrer à `positionSeconds` (plus besoin d'un appel à `/api/me/progress`).
- `markers` (secondes, `null` = non renseigné) : afficher « Passer l'intro » entre `introStart` et `introEnd` (le bouton amène à `introEnd`) ; proposer « Épisode suivant » dès `creditsStart` (sinon dans les dernières secondes).
- `next` : épisode suivant **lisible** (a un média prêt) ; `null` pour un film ou le dernier épisode. Pour l'enchaîner, appeler `/playback` avec `autoplay=1`.

#### `GET /api/programs/:slug/play-target` (v1.8, public)
Le bouton principal d'une fiche programme, en un appel : `200 {state, playbackId, episode, resumeSeconds}` ; `episode` = `null` (film) ou `{key, season, seasonNumber, number, title}` (**v1.12** : `key` = identifiant d'épisode de la fiche, ex. `s2-e8` ; `seasonNumber` = `season`, deux noms pour la même valeur).
`state` ∈ `start` (début) · `resume` (reprise en cours, `resumeSeconds` > 0) · `next` (suite du dernier épisode terminé) · `rewatch` (tout vu : recommence au début). Visiteur anonyme ou historique désactivé : toujours `start`. `404` : programme inconnu ou **rien de lisible**.

#### `PUT /api/admin/media/:playbackId/markers` (v1.8, administrateur)
`{introStart, introEnd, creditsStart}` (secondes ou `null`, tous les trois requis dans le corps) → `204`. `introStart` et `introEnd` vont ensemble, `introStart < introEnd ≤ creditsStart` ; `400` sinon, `404` si le média est inconnu. Tout à `null` efface. La fiche admin d'un programme (`GET /api/admin/programs/:slug`) renvoie `markers` pour chaque média.

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
| `GET /api/me/progress?program=<slug>` | `program` **obligatoire** | `200 {items:[{playbackId, positionSeconds, durationSeconds, completed, updatedAt}]}` (v1.2) : progression de **chaque** contenu du programme (tous les épisodes d'une série), terminés **inclus** — c'est ce qui permet l'état « Vu » ; récents d'abord. Programme sans progression : `items: []`. `400` si `program` absent ou invalide. |
| `GET /api/me/continue-watching?limit=20` | — | `200 {items:[{playbackId, programSlug, title, kind, episode, positionSeconds, durationSeconds, progressRatio, completed, updatedAt, program}]}` — **`program`** (v1.11) = fiche résumée `ProgramCard` du programme (visuels, catégorie…) ou `null` s'il n'est plus publié : l'écran n'a pas besoin d'un autre appel pour afficher la ligne |
| `GET /api/me/list` | — | `200 {items:[{slug, addedAt, program}]}` (récents d'abord). **`program`** (v1.2) = fiche résumée `ProgramCard` du catalogue, ou **`null`** si le contenu n'est pas publié ou n'existe pas (l'élément reste dans la liste : à l'utilisateur de le retirer). Les champs `slug` et `addedAt` sont inchangés. |
| `PUT /api/me/list/:slug` | — | `204` (idempotent : l'ajouter deux fois ne crée pas de doublon, même simultanément ; 500 contenus au plus, `400` au-delà) · **`404` si le contenu est inconnu ou non publié (v1.10)** — un contenu retiré APRÈS son ajout reste dans la liste avec `program: null` |
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
| `POST /api/playback-sessions` | Public (anonyme) **+ jeton de session** (`analytics.token` de la lecture, dans le corps) | `204` · `400` · `403` (jeton absent, falsifié, expiré, autre session/média) |
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

Visuels (`GET /images/:slug/:file`, public, cache 24 h ; jpg, jpeg, png, webp, avif et mp4 avec requêtes partielles) : `images.*`, `heroVideoUrl`, `image` valent soit `https://…`, soit un chemin **à préfixer par l'adresse de l'API**
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
| `GET /api/home` | `{collections: Collection[], themes: Theme[], creators: Creator[]}` — **v1.13 : chaque `Theme` porte aussi `programs: ProgramCard[]` (ses 10 premiers programmes par ordre alphabétique, y compris ceux qui ne sont dans aucune collection de l'accueil)** — **toute la page d'accueil en un appel**, collections dans l'ordre d'affichage |
| `GET /api/programs/:slug` | Fiche complète (voir ci-dessous) · `404` si inconnu ou brouillon |
| `GET /api/collections/:slug` | `Collection` · `404` |
| `GET /api/themes` | `{themes: [{slug, title, image, programCount, subtitle, featuredSlug, fallbackFeaturedSlug}]}` — `subtitle` : promesse en une ligne (ou `null`) ; `featuredSlug` : phare configuré, publié (sinon `null`, jamais de référence cassée) ; `fallbackFeaturedSlug` (v1.17) : programme le mieux classé de la thématique, à utiliser quand `featuredSlug` est `null` |
| `GET /api/themes/:slug` | `{programs: ProgramCard[]}` (le phare configuré d'abord, puis l'ordre du classement global) · `404` |
| `GET /api/creators` | `{creators: [{slug, name, showTitle, intro, themes, ambience, image, imageAlt, imageFocus, isProvisional}]}` |
| `GET /api/creators/:slug` | Univers d'un créateur : `{slug, name, alias, domain, tagline, accent, chapters, contents: {message[], conference[], serie[], live[]}, featured}` · `404` si inconnu. `accent` = « R G B ». Le **live est une annonce** (date `liveAt`), pas de diffusion en direct |
| `GET /api/search/suggestions?q=&limit=8` | Complétion à la frappe (dès 1 caractère) : `{query, suggestions: [{type: program\|creator\|theme, slug, label}]}` |
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
| `GET /api/ranking?limit=50&offset=0` | public | **Classement complet (v1.16)** : `{total, items: [{rank, program: ProgramCard}]}`. Ordre total et stable : Top 10 éditorial (collection `top-10`) d'abord, puis le reste du catalogue publié par audience (14 jours, sessions ≥ 10 s), puis titre, puis identifiant. `limit` ≤ 200 ; au-delà de la fin : `items: []` et `total` exact. Voir `docs/CLASSEMENTS-ET-TENDANCES.md` |
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
| `PUT /api/admin/themes/:slug` | `{title, imageUrl?, position?, subtitle?, featuredSlug?}` — `subtitle`/`featuredSlug` absents = conservés, `null` = effacés (v1.16) | `204` · `400` (phare inconnu) |
| `PUT /api/admin/creators/:slug` | `{name, showTitle?, intro?, themes?, ambience?, imageUrl?, imageAlt?, imageFocus?, isProvisional?, published?, position?}` | `204` |
| `PUT /api/admin/collections/:slug` | `{title, layout, badge?, viewAllUrl?, homePosition?, published?, items: [slug,…]}` (l'ordre = l'affichage) | `204` · `400` (programme inconnu) |
| `DELETE /api/admin/themes/:slug` | — | `204` · `404` |
| `DELETE /api/admin/creators/:slug` | — | `204` · `404` |
| `DELETE /api/admin/collections/:slug` | — | `204` · `404` |

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
- Une seule piste `default: true` au plus. Le fichier est du WebVTT UTF-8, servi par `GET /subtitles/:playbackId/:file` où `:file` vaut `<lang>.vtt` (public, cache 1 h).
- Dépôt (administrateur) : `PUT /files/subtitles/:playbackId/:lang?label=Français&default=true` avec le fichier WebVTT brut comme corps
  (1 Mo au plus, doit commencer par `WEBVTT`) → `204` · `400` fichier invalide · `404` média inconnu · `413` trop gros.
  Suppression : `DELETE /files/subtitles/:playbackId/:lang` → `204` · `404`.
- `lang` : `fr`, `en`, `es`, `pt-BR`…

## Vos données (RGPD) (disponible — v1.1)

| Route | Réponse |
|---|---|
| `GET /api/me/export` | Fichier JSON téléchargeable (`Content-Disposition: attachment`) : compte, progression de lecture, « Ma liste », nombre de sessions actives, événements de sécurité. **Jamais** de secret (mot de passe, jeton, double authentification). `401` sans compte. |
| `POST /api/me/delete` | Droit à l'effacement (déjà disponible) : supprime le compte et toutes ses données. |

Le front doit proposer ces deux actions dans « Mon compte » (« Télécharger mes données », « Supprimer mon compte »).
Conservation : mesures de lecture anonymes 180 jours, journal de sécurité 365 jours, sessions et jetons expirés supprimés automatiquement.

## Espace compte (disponible — v1.5, compte connecté)

Pour l'écran « Votre espace » du front. `credentials: 'include'` partout ; les codes de valeur (`quality: 'eco'`…) sont stables, **l'écran les traduit** (« Éco »).

**Profil.** `GET /api/me` renvoie désormais aussi `createdAt` (« membre depuis »), `locale` (`fr`|`en`) et `avatar` (`null`, `{kind:"preset", preset: 0..7}` ou `{kind:"photo", url:"/avatars/<clé>.<ext>", zoom: 1..4}` — **préfixer `url` par l'adresse de l'API**).
| Route | Description |
|---|---|
| `PATCH /api/me` | `{displayName?: string(1..60) \| null, locale?: "fr"\|"en"}` (au moins un champ, rien d'autre) → `200 {user}` |
| `GET /api/me/preferences` | `200 {preferences}` — `previews`, `nextEpisode`, `quality` (`auto`\|`eco`\|`high`), `subtitles` (`none`\|`fr`\|`en`), `subtitleSize` (`small`\|`medium`\|`large`), `newEpisodes`, `news`, `emails`, `reduceMotion`, `history` (booléens) |
| `PUT /api/me/preferences` | Modification **partielle** (seuls les champs fournis changent) → `200 {preferences}` complet. Champ inconnu ou valeur invalide → `400`. *Les notifications (`newEpisodes`, `news`, `emails`) enregistrent le CHOIX ; l'envoi des messages n'existe pas encore.* |

**Appareils connectés.** Nom approximatif (« Chrome · macOS »), jamais d'adresse IP. `lastSeenAt` est rafraîchi au plus une fois par jour.
| Route | Description |
|---|---|
| `GET /api/me/sessions` | `200 {sessions:[{id, device, current, createdAt, lastSeenAt}]}` (le plus récent d'abord) |
| `DELETE /api/me/sessions/:id` | `204` déconnecte cet appareil · `404` inconnu ou d'un autre compte · `409` c'est l'appareil en cours (utiliser `POST /api/auth/logout`) |
| `POST /api/me/sessions/revoke-others` | `200 {revoked: n}` — « Déconnecter tous les autres » ; la session en cours reste ouverte |

**Thématiques préférées** (choix à « Bienvenue » ; alimentent « Pour vous » **dès l'inscription**, avec la raison « Parce que vous aimez « Foi » »).
| Route | Description |
|---|---|
| `GET /api/me/themes` | `200 {themes: [slug]}` |
| `PUT /api/me/themes` | `{themes: [slug]}` (12 au plus, doublons retirés, remplace la liste) → `200 {themes}` · `400` si un identifiant est inconnu (la liste n'est alors pas modifiée). Les identifiants viennent de `GET /api/themes`. |

**Photo de profil.**
| Route | Description |
|---|---|
| `PUT /files/me/avatar` | Corps = **image brute** (JPG, PNG ou WebP ; 5 Mo au plus ; AVIF et SVG refusés ; le contenu réel est vérifié) → `201 {avatar}` ; remplace et supprime l'ancienne photo. `413` trop lourde, `400` format invalide. *Les dimensions minimales (400×400) se vérifient côté écran.* |
| `PUT /api/me/avatar` | `{kind:"preset", preset: 0..7}` (avatar prédéfini — supprime la photo) · `{kind:"photo", zoom: 1..4}` (recadrage de la photo existante ; `400` s'il n'y en a pas) · `{kind: null}` (retire) → `200 {avatar}` |
| `GET /avatars/:fichier` | Public (balise `<img>`) ; clé aléatoire, cache d'un an. |
La photo est supprimée avec le compte.

**Changement d'adresse e-mail** (code à 6 chiffres envoyé à la **nouvelle** adresse ; l'ancienne est prévenue).
| Route | Description |
|---|---|
| `POST /api/me/email/change` | `{newEmail, password}` → `202` **dans tous les cas valides** (adresse déjà prise comprise : on ne révèle pas qui est inscrit, aucun code n'est alors envoyé) · `401` mot de passe incorrect · `400` adresse invalide ou identique à l'actuelle |
| `POST /api/me/email/change/confirm` | `{code}` → `200 {user}` : adresse changée et **vérifiée**, autres appareils déconnectés · `400` code faux/expiré (15 min) · `429` après 5 essais (la demande est annulée) |

**Historique de visionnage.** `preferences.history = false` : les positions **ne sont plus enregistrées** (`PUT /api/me/progress/:id` répond normalement, sans rien écrire), `GET /api/me/continue-watching` renvoie `[]`, `GET /api/me/progress…` ne renvoie rien, et l'historique n'alimente plus « Pour vous » (la liste « Ma liste » et les thématiques restent prises en compte). Les anciennes données sont conservées (réapparaissent si on réactive).
| Route | Description |
|---|---|
| `DELETE /api/me/history` | `200 {cleared: n}` — efface tout l'historique du compte |
| `GET /api/me/continue-watching` | **Nouveau champ `episode`** par élément : `{key, number, seasonNumber, title}` (séries) ou `null` (films) — de quoi afficher « Épisode 6 · Saison 2 » |

**Rappels utiles au front** : `POST /api/me/delete` exige **le mot de passe** (pas seulement « SUPPRIMER ») ; `GET /api/me/export` inclut désormais les préférences et thématiques.

## Voie vidéo Mux (disponible — v1.4, administrateur uniquement)

Mux prépare, stocke et diffuse la vidéo à notre place. **Le navigateur envoie le fichier directement à Mux** ; notre serveur ne garde que l'état et inscrit la vidéo quand elle est prête. La clé Mux reste sur le serveur : le back-office ne la connaît jamais.

| Route | Description |
|---|---|
| `GET /api/admin/video-providers` | Voies disponibles : `{default, providers:[{id:"self", configured:true}, {id:"mux", configured, playbackPolicy?}]}`. `self` = notre pipeline (envoi tus + FFmpeg + Bunny/serveur), `mux` = voie Mux. `default` = voie à proposer d'abord. |
| `POST /api/admin/mux/uploads` | Corps `{playbackId, programSlug?, kind: "film"\|"serie"\|"documentaire", title, demo?}` (champs inconnus refusés). `201 {id, playbackId, programSlug, kind, title, status:"waiting", error, createdAt, updatedAt, finishedAt, uploadUrl}`. **`uploadUrl` n'est renvoyée qu'ici** (jamais conservée). `409` : une préparation est déjà en cours pour ce contenu ; `503` : Mux non configuré ou indisponible. L'en-tête `Origin` de la requête est déclaré à Mux : l'envoi n'est autorisé que depuis cette origine. |
| `GET /api/admin/mux/uploads?playbackId=&program=&limit=` | Liste `{uploads:[…]}` (mêmes champs, sans `uploadUrl`). |
| `GET /api/admin/mux/uploads/:id` | État d'un envoi. **L'interroger fait avancer l'état** (le serveur demande à Mux au passage) : c'est la route à consulter toutes les 3 à 5 s pour la barre de suivi. `404` inconnu. |
| `POST /api/admin/mux/uploads/:id/cancel` | Annule (`204`) ; `409` si déjà terminé. |

**Parcours du back-office** : (1) `GET /api/admin/video-providers` ; (2) `POST /api/admin/mux/uploads` → `uploadUrl` ; (3) `PUT` du **fichier brut** sur `uploadUrl`, **sans cookie** (`credentials: 'omit'` : c'est l'adresse de Mux, pas la nôtre) — réponse `200` ou `201` à la fin ; Mux accepte aussi l'envoi par morceaux (multiples de 256 Ko, en-tête `Content-Range`, réponse `308` tant qu'il en reste) ; (4) consulter `GET /api/admin/mux/uploads/:id` jusqu'à `ready` ou `failed`.

**Valeurs de `status`** : `waiting` (en attente du fichier) · `processing` (Mux prépare la vidéo) · `ready` (lisible) · `failed` (voir `error`, message en français) · `canceled`. Un statut inconnu de Mux n'est **jamais** pris pour un succès. Une panne passagère de Mux laisse l'état inchangé (pas de faux échec).

**Effet sur la lecture** : quand l'envoi est `ready`, le contenu devient lisible (`playable: true`) ; `GET /api/programs/:id/playback` renvoie un `manifestUrl` `https://stream.mux.com/<id>.m3u8` (avec `?token=` si la politique est `signed`). Un même contenu peut être sur Mux et un autre sur notre pipeline. L'ident, les sous-titres, la reprise, les recommandations sont **inchangés**. Les sous-titres restent à déposer chez nous (`/files/subtitles/…`).

## Ajouts pour le back-office (disponible — v1.3, administrateur uniquement)

| Route | Description |
|---|---|
| `GET /api/admin/programs/:slug` | **Fiche admin** d'un programme, brouillon inclus : `{slug, createdAt, updatedAt, document, media, jobs}`. `document` a **exactement la forme** du corps de `PUT /api/admin/programs/:slug` : on peut le modifier puis le renvoyer tel quel. `media` = tous les médias du programme quel que soit leur statut `[{playbackId, status, durationSeconds, createdAt}]`. `jobs` = les 10 dernières tâches de préparation `[{id, playbackId, status, step, progress, attempts, maxAttempts, lastError, createdAt, startedAt, finishedAt}]`. `404` si inconnu (les contenus de marque ne sont jamais exposés). |
| `PUT /files/images/:slug/:file` | **Envoi d'une image** (corps = image brute). Formats `jpg`/`jpeg`/`png`/`webp`/`avif` ; ≤ 10 Mo (`413` sinon) ; le type est vérifié sur le **contenu réel** (extension qui ment ou fichier non-image → `400`) ; SVG refusé ; nom de fichier `[A-Za-z0-9][A-Za-z0-9._-]*`, sans `..`. Remplace un fichier de même nom (écriture atomique). Réponse `201 {url: "/images/<slug>/<file>", bytes}` : placer `url` dans `posterUrl`/`heroUrl`/`logoUrl`/`imageUrl` de la fiche. |
| `GET /api/admin/jobs?playbackId=&program=&limit=` | Filtres **facultatifs et combinables** : `playbackId` (un contenu), `program` (tous les contenus d'un programme). Identifiant invalide → `400`. Chaque tâche contient maintenant `programSlug`. |

## Vérification d'adresse e-mail (disponible — v1.0)

À l'inscription, un e-mail contient `{PUBLIC_APP_URL}/verifier-email?token=<jeton>` (valable 24 h, usage unique). **Le front doit fournir cette page**,
qui appelle l'API. L'utilisateur n'est **pas bloqué** tant que l'adresse n'est pas confirmée : afficher un bandeau « Confirmez votre adresse ».
Un compte qui réinitialise son mot de passe est automatiquement considéré comme vérifié.

| Route | Corps | Réponses |
|---|---|---|
| `POST /api/auth/email/verify` | `{token}` | `200` · `400` (lien invalide, expiré ou déjà utilisé) — sans compte requis |
| `POST /api/me/email/verification` | — | `202` (renvoie un lien ; sans effet si déjà vérifiée) · `429` (un seul par minute) · `401` |

Le champ `user.emailVerified` (booléen) est présent dans toutes les réponses contenant un utilisateur.

## Double authentification TOTP (disponible — v1.0)

Application d'authentification standard (Google Authenticator, Microsoft Authenticator, 1Password, Authy). `user.twoFactorEnabled` indique l'état.

| Route | Corps | Réponses |
|---|---|---|
| `POST /api/me/2fa/setup` | — | `200 {secret, otpauthUrl}` (afficher en QR code ; **secret non encore actif**) · `409` (déjà activée) · `503` (clé serveur absente) |
| `POST /api/me/2fa/enable` | `{code}` (6 chiffres) | `200 {recoveryCodes: string[8]}` — **à afficher UNE seule fois**, à faire noter · `400` (code incorrect) |
| `POST /api/me/2fa/disable` | `{password, code}` (code TOTP ou de secours) | `204` · `401` |
| `POST /api/auth/login` | `{email, password, code?}` | si 2FA active et `code` absent : `401 {"error":"two_factor_required"}` → afficher le champ code puis renvoyer avec `code` |

- Un code TOTP ne sert qu'une fois ; ±30 s de tolérance d'horloge. Un **code de secours** (`xxxxx-xxxxx`) remplace le code TOTP, à usage unique.
- Des codes faux comptent comme des échecs de connexion (verrouillage de 15 min après 5).
- Si l'administration exige la double authentification (`REQUIRE_ADMIN_2FA=true`), un administrateur qui ne l'a pas activée reçoit
  `403 {"error":"two_factor_required"}` sur `/api/admin/*`, `/uploads/*`, `/files/*` : le rediriger vers la configuration (`/api/me/2fa/*` reste accessible).

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

## Programmation des sorties (disponible — v1.9)

Le document d'un programme (`PUT /api/admin/programs/:slug`, relu par `GET /api/admin/programs/:slug`) gagne trois champs :
`publishAt` (ISO 8601 avec fuseau, ex. `2026-12-01T18:00:00+01:00`) · `unpublishAt` · `announced`. Règles : `publishAt` seulement pour un **brouillon** (`published: false`) ; `announced: true` exige `publishAt` ; `unpublishAt` doit suivre `publishAt` ; `400` sinon.
**Porte de publication (v1.14, règle validée le 30/10/2026)** : à l'échéance, un brouillon n'est publié automatiquement **que si tous ses médias obligatoires sont prêts** (film/documentaire : un média prêt ; série : chaque épisode déclaré a son média prêt). Sinon la sortie est **bloquée** : trace `catalog.program.release_blocked` dans le journal, e-mail aux administrateurs, `blocked: {since, missing[]}` dans `GET /api/admin/schedule`, et **aucune publication tardive automatique** même quand les médias deviennent prêts ensuite. Elle repart par `POST …/release` ou par une **nouvelle `publishAt`** (qui lève le blocage). Une publication explicite par l'éditeur (`published: true`) reste libre. Une tâche du serveur (toutes les 30 s) publie les brouillons dont `publishAt` est passé (le champ est alors vidé) et repasse en brouillon les programmes dont `unpublishAt` est passé. Chaque bascule est tracée dans `GET /api/admin/audit` (`catalog.program.release` / `catalog.program.expire`). Délai de visibilité côté public : jusqu'à ~1 minute (tâche + cache de 30 s).

| Route | Description |
|---|---|
| `GET /api/coming-soon?limit=20` | Public : `{programs: [{slug, title, kind, tagline, image, imageAlt, releaseAt}]}` — programmes **annoncés**, du plus proche au plus lointain. Fiche résumée seulement : `GET /api/programs/:slug` et la lecture restent en `404` jusqu'à la sortie |
| `POST /api/admin/programs/:slug/release` | **Validation éditoriale (v1.14)** : publie maintenant si tous les médias obligatoires sont prêts → `204` ; sinon `409` avec la liste de ce qui manque ; `404` inconnu, `403` non administrateur. Réservée aux sorties bloquées ou anticipées |
| `GET /api/admin/schedule` | Administrateur : calendrier `{entries: [{slug, title, kind, event: "release"\|"expiry", at, announced}]}` en ordre chronologique |

## Recherche intelligente et sécurité de connexion (disponible — v1.7)

- `GET /api/search` renvoie aussi `correctedQuery` : `null` si la recherche a abouti telle quelle ; sinon, quand rien n'a été trouvé et qu'une faute de frappe est probable, la recherche corrigée (« thriler » → « thriller »), dont les résultats sont renvoyés. Le front peut afficher « Résultats pour … ». Les **mots-clés** (`keywords` d'un programme, saisis au back-office) se cherchent comme le titre.
- Recherches récentes (compte connecté, désactivées avec « historique » ; 20 conservées au plus ; incluses dans l'export RGPD) :

| Route | Description |
|---|---|
| `GET /api/me/searches` | `200 {searches: string[]}` — les 10 dernières |
| `POST /api/me/searches` | `{q}` (2..80) → `204` ; à appeler quand la personne **valide** une recherche |
| `DELETE /api/me/searches` | `204` — tout effacer |
| `DELETE /api/me/searches/item` | `{q}` → `204` — oublier une recherche |

- Connexion depuis un **appareil inconnu** d'un compte qui en avait déjà : e-mail d'alerte (lien vers `/reinitialiser`). Aucune réponse d'API ne change.

## Univers de créateur et contact (disponible — v1.6)

| Route | Description |
|---|---|
| `GET /api/admin/creators` | Administrateur : créateurs avec leurs champs d'univers (alias, domaine, accroche, accent, chapitres) |
| `GET /api/admin/creators/:slug` | Administrateur : un créateur + ses contenus rattachés |
| `PUT /api/admin/creators/:slug/contents` | Administrateur : remplace les contenus rattachés (rubrique message/conférence/série/direct, 1 seul « à la une », `liveAt` réservé au direct) |
| `GET /api/admin/audit?limit=&before=` | Administrateur : journal des modifications du catalogue (`catalog.<programme\|thème\|créateur\|collection>.<save\|delete\|contents>`, auteur, slug, date) ; `next` = page suivante |
| `POST /api/contact` | Public, 5 par heure et par IP : `{name, email, topic?, message(10..4000), website?}` → `202`. `website` est un champ caché anti-robot : rempli, réponse identique mais rien n'est conservé |
| `GET /api/admin/contact?status=new\|handled&limit=` | Administrateur : messages reçus |
| `POST /api/admin/contact/:id/handled` | Administrateur : marque traité (`204`, `404` si déjà traité) |

Les messages de contact sont purgés avec le journal d'audit (`RETENTION_AUDIT_DAYS`). Variable : `SUPPORT_EMAIL` (signalement par e-mail, facultative).

## Erreurs de disponibilité (v0.9)
Une panne ou une saturation de la base répond **`503 {"error":"unavailable"}` avec `Retry-After: 5`** (jamais une 500) :
le front doit afficher « Service momentanément indisponible » et proposer de réessayer. Un doublon répond `409 conflict`.

## Prévu (pas encore disponible — ne pas le simuler)

| Domaine | Routes prévues | État |
|---|---|---|
| Langues audio multiples | pistes audio dans le manifeste | Après les premiers contenus réels |
| Paiement / abonnement | — | Si le modèle devient payant |


**Autorisation des rapports de lecture (v1.15, 31/10/2026) — changement pour le front.** `GET /api/programs/:id/playback` renvoie désormais `analytics: { sessionId, token }` (anonyme ou connecté, média signé ou non). Le lecteur doit :
1. utiliser `analytics.sessionId` comme `id` de ses rapports `POST /api/playback-sessions` (ne plus générer son propre UUID) ;
2. ajouter `token: analytics.token` **dans le corps JSON** de chaque rapport (donc compatible `sendBeacon` / `fetch keepalive` en `text/plain`, sans en-tête ni cookie) ;
3. redemander une lecture (nouveau `sessionId`) pour chaque nouvelle lecture ; le jeton vaut 24 h et une seule session.

Le serveur répond `403` si le jeton est absent, falsifié, expiré ou lié à une autre session/un autre média, et plafonne `watchSeconds` au temps réellement écoulé depuis l'émission (+ 2 s). Sans cela, un rapport ne peut plus alimenter le Top 10 ni les statistiques. Les renvois du même rapport restent idempotents (maximum de chaque compteur).

**Thématiques éditoriales et classement (v1.16, 31/10/2026).** Les thématiques portent désormais côté serveur ce que le front codait en dur (`themeShowcase`) : `subtitle` et `featuredSlug` (migration 021), et `/api/home` (`themes[]`) ainsi que `/api/themes` les exposent ; le contenu d'une thématique place le phare en premier. `GET /api/ranking` fournit le classement complet de `/classement`. La recherche tolère maintenant une faute dans un mot incomplet (« passagr » → « passagers »).

**v1.17 (31/10/2026)** : `fallbackFeaturedSlug` sur les thématiques ; ordre d'une thématique = phare puis classement global (et non plus alphabétique) ; définition d'audience unique pour `/api/trending`, `/api/ranking` et le repli de phare ; égalités d'audience de `/api/trending` départagées par titre puis identifiant. Distinction Top 10 éditorial / classement global / tendances : `docs/CLASSEMENTS-ET-TENDANCES.md`.
