# 03 — Architecture du back-end

Vérifié le : 30/10/2026 · Sources : `docs/ARCHITECTURE-BACKEND.md`, `docs/REVUE-ARCHITECTURE-2026-10-15.md`, `api/src/app.ts`, `api/src/main.ts`, `api/src/architecture.test.ts`

## 1. Choix d'architecture (et pourquoi)
**Monolithe modulaire** : une seule application, rangée en modules indépendants. À 1 000 utilisateurs, c'est plus simple, plus fiable et moins cher que des microservices.
Seuil de révision : plusieurs instances, ou une équipe qui grandit (voir `docs/REVUE-ARCHITECTURE-2026-10-15.md`, tableau des risques).

| Couche technique | Choix |
|---|---|
| Exécution | Node ≥ 24.7, TypeScript lancé **nativement** (pas de compilation) |
| HTTP | Hono (+ `@hono/node-server`) |
| Base | PostgreSQL 17 ; pilote `postgres` (porsager) ; migrations SQL numérotées maison |
| Validation | `zod` (config, documents d'administration, corps de requêtes) |
| Journaux | `pino` (JSON, une ligne par événement) |
| Mots de passe | argon2id (`node:crypto`) |
| Vidéo | FFmpeg/ffprobe en processus séparés (jamais via un shell) |
| Dépendances externes | Aucune obligatoire en local ; CDN Bunny et e-mails Resend en production |

## 2. Plan du dossier `api/`
```
api/
├── src/
│   ├── main.ts            Point d'entrée : config → migrations → serveur → arrêt propre. Aucune règle métier.
│   ├── app.ts             Assemblage : middlewares + modules (ajouter un module = une ligne ici)
│   ├── config/env.ts      Lit et VALIDE la configuration (seul fichier qui touche aux variables d'environnement)
│   ├── platform/          Socle technique, sans règle métier : logger, errors, mail, http/, database/, storage/, backup/, system/
│   └── modules/           Le métier, un dossier par domaine (voir 04)
├── migrations/            SQL numéroté (001, 003…012 ; la 002 n'existe pas, volontairement)
├── scripts/               Commandes d'administration (voir 11) + load/ (test de charge)
├── seed/catalog-demo.json Catalogue de démonstration importable
└── Dockerfile             Image de production (voir 09)
```

## 3. Règles de dépendance (vérifiées automatiquement par `architecture.test.ts`)
```
routes ─▶ service ─▶ repository ─▶ base de données
   └───────┴────────────┴──▶ platform/ (socle)
```
1. Une **route** lit la requête, appelle un service/repository, écrit la réponse. **Aucune règle métier.**
2. Un **service** décide (« ce média est-il lisible ? »). Il ne connaît ni HTTP ni SQL.
3. Un **repository** est le **seul** à écrire du SQL (exceptions listées dans le test : `catalog/content.ts`, `catalog/admin.ts`, `analytics/metrics.ts`, `health/routes.ts`).
4. `platform/` ne dépend d'**aucun** module.
5. **Aucun cycle** entre modules : une dépendance va toujours « vers le bas ». Carte actuelle :
   `playback → ingest, media, progress, subtitles` · `progress → identity, ingest` · `media → ingest` · `recommendation → catalog` ·
   `account → identity` · `progress → identity, ingest, account` · `recommendation → catalog, account` · `privacy → identity, account` · `mux → ingest, identity, playback (type)` · `mylist → catalog, identity` · `catalog, ingest, analytics, ops, privacy, subtitles → identity` · `identity, health → ∅` (hors socle).
6. Un module **ne lit pas à l'intérieur d'un autre** : il passe par ce que l'autre expose.

## 4. Chaîne de middlewares (ordre = `app.ts`)
`requestId → metrics → accessLog → securityHeaders → CORS` puis, par groupe de routes :
- `/api/*` : limite de débit par IP → protection d'origine (CSRF) → chargement de session → corps ≤ 64 Ko → délai 10 s → `Cache-Control: no-store` (sauf catalogue public).
- `/api/admin/*`, `/uploads/*`, `/files/*` : + obligation de double authentification pour les administrateurs si `REQUIRE_ADMIN_2FA=true`.
- `/uploads/*` (protocole tus), `/files/*` (dépôt de sous-titres) : pas de limite de 64 Ko ni de délai de 10 s, mais administrateur + origine de confiance.
- `/media/*`, `/images/*`, `/subtitles/*` : limite de débit propre.

## 5. Le trajet d'une requête « je veux regarder »
1. `GET /api/programs/:playbackId/playback` → middlewares → `playback/routes.ts`.
2. `playback/service.ts` : trouve le média **prêt** (`ingest/repository.findPlayableAsset`) ; sinon `404 not_available`.
3. Décide l'ident (`ident-policy.ts`, avec l'historique du compte via `progress`), liste les sous-titres, fabrique l'URL signée (`delivery.ts`).
4. Le lecteur télécharge manifeste puis segments : en mode `origin` via `media/routes.ts` (jeton revérifié à chaque fichier), en mode `bunny` directement sur le CDN.
5. Toute anomalie → `AppError` → `{ "error": code, "message", "requestId" }`. Panne de base → `503` + `Retry-After: 5`.

## 6. Processus en production (même image, rôles différents)
| Processus | Rôle | Commande |
|---|---|---|
| `api` | Sert l'API, applique les migrations au démarrage | `node src/main.ts` |
| `worker` | Encode les vidéos (CPU intensif, isolé de l'API) | `node scripts/worker.ts` |
| `backup` | Sauvegarde chiffrée quotidienne | boucle `scripts/backup.ts` |
| `watchdog` | Contrôle de santé toutes les 5 min + alertes | boucle `scripts/watchdog.ts` |
| `postgres` | Base de données (aucun port publié) | image officielle 17 |
| `caddy` | Reverse proxy HTTPS automatique (seul exposé) | image officielle |

## 7. Principes de robustesse appliqués (preuves dans `src/robustness.test.ts`)
Échouer vite (config invalide = démarrage refusé) · aucun secret dans le code ni les journaux · erreurs cohérentes · pannes de base → 503 (pas 500) ·
délai SQL 15 s et transactions oubliées coupées à 30 s · migrations sérialisées par verrou · éditions simultanées sérialisées par verrou ·
arrêt propre (SIGTERM) · `uncaughtException` → arrêt + relance · cache serveur borné avec regroupement des chargements simultanés.

## 8. Limites assumées (avec seuil de révision)
| Limite | Seuil de révision |
|---|---|
| Limiteur de débit en mémoire (par processus) | Dès plusieurs instances API → Redis ou limite au proxy |
| Recommandations calculées à la demande (≈ 20 ms à 5 000 titres) | > 20 000 titres ou > 50 req/s sur la route → pré-calcul |
| Sessions et file d'encodage dans PostgreSQL | Plusieurs encodeurs simultanés à forte cadence |
| Pas de `/api/v1` | Ouverture à des clients tiers (TV, mobile) |
| E-mails envoyés directement (pas de file) | Mails de masse |
| Machine unique, pas de bascule | Audience qui exige une disponibilité continue |
