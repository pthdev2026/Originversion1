# 06 — Pipeline vidéo et diffusion

Vérifié le : 30/10/2026 · Sources : `docs/ARCHITECTURE-BACKEND.md` §7 ter–sexies, `docs/GUIDE-BUNNY.md`, `docs/DECISIONS.md` (Lecture vidéo, B4, B5, volume), `api/src/modules/ingest/`, `api/src/modules/playback/`, `api/src/modules/media/`

## 1. Décisions techniques
| Sujet | Choix |
|---|---|
| Format | **HLS**, segments **fMP4 de 4 s**, H.264 + AAC stéréo |
| Qualités | 1080p (5 000 kb/s) · 720p (2 800) · 480p (1 400) · 360p (800) ; **jamais de sur-échantillonnage** (une source 720p ne produit pas de 1080p) |
| Encodage | FFmpeg, préréglage `medium` (production) ou `slow` ; mesuré ≈ 2,1× la durée du film (2 h ≈ 4–5 h de calcul) |
| Lecteur | `hls.js` (natif sous Safari) avec contrôles ORIGIN |
| Protection | URLs **signées** (HMAC, 4 h, liées au média) ; pas de DRM (décision v1) |
| Volume | Normalisation **EBU R128** en 2 passes → **−16 LUFS**, crête −1,5 dBTP (`LOUDNESS_TARGET_LUFS`, `off` pour désactiver) ; piste muette = pas de correction |
| 4K | Non produite (réservée à un futur « droit de qualité ») |

## 2. Le parcours d'une vidéo (de l'envoi à la lecture)
1. **Envoi** : `POST /uploads` (protocole **tus**, reprenable) par un administrateur. Garde-fou : espace disque libre ≥ `MIN_FREE_GB`.
2. **Mise en file** : `media_jobs` (statut `queued`) — une seule tâche active par média ; commande CLI `npm run media:enqueue`.
3. **Travailleur** (`scripts/worker.ts`, processus séparé) : prend la tâche avec un **bail** (`FOR UPDATE SKIP LOCKED`) ; un travailleur disparu perd son bail et la tâche est reprise.
4. **Analyse** (ffprobe) → plan de qualités → **mesure du volume** (une fois, conservée dans `state`).
5. **Encodage qualité par qualité** avec **points de reprise** (`state.completedRungs`) : une interruption ne refait pas les qualités validées.
6. **Contrôle qualité** (`pipeline/qc.ts`) de chaque qualité (segments, durée) ; point de reprise invalide → refait.
7. **Finalisation** : affiche (`poster.jpg`), playlist maître (`master.m3u8` avec CODECS), `meta.json`.
8. **Publication atomique** : déplacement du dossier de travail vers `hls/<id>/` (ou envoi versionné vers Bunny), puis inscription en base (`media_assets.status = 'ready'`). **Rien n'est visible avant** : un échec ne publie jamais une vidéo incomplète.
9. Échecs : erreurs « permanentes » (fichier illisible) ne se rejouent pas ; 3 tentatives sinon (`run_after` différé). Suivi : `GET /api/admin/jobs`.

## 3. Diffusion : origine ou CDN
| Mode (`DELIVERY_MODE`) | Fonctionnement | Capacité mesurée |
|---|---|---|
| `origin` (défaut) | L'API sert elle-même `/media/:token/:id/*` (Range pris en charge), jeton HMAC revérifié à chaque fichier | **Sature à ~100–160 spectateurs simultanés (~400 Mb/s)** → développement uniquement |
| `bunny` | Les fichiers sont publiés dans **Bunny Storage** (Falkenstein, versionnés `hls/<id>/<version>/`, intégrité vérifiée), servis par la **Pull Zone** avec **jeton de répertoire** dans le chemin | **Obligatoire pour 1 000 spectateurs** ; non validé sur une vraie zone (juge : `npm run cdn:check`) |

Abstractions : `DeliverySigner` (signe l'URL), `MediaStore` (local ou Bunny). Changer de CDN = écrire une autre implémentation, sans toucher aux routes.
Le jeton Bunny suit la documentation du fournisseur et **n'a pas été testé sur un compte réel** : à valider dès la création de la zone (`docs/GUIDE-BUNNY.md`).

## 3 bis. Voie Mux (depuis le 30/10/2026)
Un média peut être préparé, stocké et diffusé par **Mux** au lieu de notre chaîne (`media_assets.provider = 'mux'`) ; les deux voies **cohabitent**, média par média.
Parcours : le back-office demande `POST /api/admin/mux/uploads` → notre serveur obtient de Mux une **adresse d'envoi à usage limité** (la clé Mux reste sur le serveur) → le **navigateur envoie le fichier directement à Mux** → un **poller** (toutes les 10 s) et la consultation de l'envoi interrogent Mux ; à `ready`, la vidéo est **inscrite en base** (durée lue chez Mux) et devient lisible. Pas de webhook ni d'adresse publique nécessaires pour démarrer.
Lecture : `https://stream.mux.com/<id>.m3u8` ; politique `public` (test) ou `signed` (jeton JWT RS256 fabriqué par notre serveur, durée > durée du film). `media/routes.ts` refuse de « servir » un média Mux.
Perdu avec Mux : notre QC, notre échelle de qualités (Mux « basic » : 360p + 270p observés pour une source 640×360), notre volume −16 LUFS (Mux : −24, désactivé par défaut). Conservé : ident, sous-titres (les nôtres), reprise, recommandations, catalogue.
**Validé en réel le 30/10/2026** (`npm run mux:check -- --video`) : accès accepté, adresse d'envoi, envoi du fichier (HTTP 200), vidéo prête en ~2 s, durée lue, lien HLS valide, annulation et suppression acceptées. Reste à valider : lecture signée (clé de signature à créer), conditions d'utilisation et résidence des données de Mux.

## 4. Ident de marque
Média `origin-ident` (`kind = brand`) publié par ce même pipeline ; politique `IDENT_POLICY` ; la réponse de lecture contient `ident {show, reason, manifestUrl, durationSeconds, skippableAfterSeconds}`. Règles détaillées : `02-charte-editoriale-et-marque.md` §5, `docs/API-CONTRACT.md` « Ident de marque ».
`ident-policy.ts` est une fonction pure testée (`ident.test.ts`) : jamais de règle d'ident dans le front.

## 5. Sous-titres
Une piste **WebVTT** par (média, langue) : dépôt administrateur `PUT /files/subtitles/:playbackId/:lang?label=…&default=true` (corps = fichier brut, ≤ 1 Mo, doit commencer par `WEBVTT`, pas de `<script>`), distribution publique `/subtitles/…` (cache 1 h), exposition dans `playback.subtitles`. Pas de conversion SRT→VTT côté serveur.

## 6. Mesure de la qualité de lecture
Le lecteur envoie un rapport **cumulatif et anonyme** toutes les ~15 s (`POST /api/playback-sessions`) : démarrage, coupures, qualité, erreurs, appareil. On garde le **maximum** de chaque compteur (envois dans le désordre). Objectifs : p75 de démarrage < 2 s, coupures < 1 %, erreurs < 1 % (`TARGETS`).
Conservation : 180 jours (`RETENTION_TELEMETRY_DAYS`).

## 7. Pièges connus
- Les médias encodés **avant** l'ajout de la normalisation ne sont pas normalisés (à ré-encoder si besoin).
- L'encodage n'écrase **jamais** la fiche éditoriale d'un programme existant (`registerAsset` ne touche que `updated_at`).
- Le préfixe `/uploads/*` est **réservé au protocole tus** : tout autre dépôt de fichier passe par `/files/*`.
- Un film de 2 h occupe le travailleur plusieurs heures : prévoir la file en conséquence (option : encoder sur un poste fort, publier vers Bunny).
- Les sources (`videos/sources/`) ne se régénèrent pas : elles sont dans les sauvegardes.
