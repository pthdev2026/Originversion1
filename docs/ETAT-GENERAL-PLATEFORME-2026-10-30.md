# ORIGIN — ÉTAT GÉNÉRAL DE LA PLATEFORME AU 30/10/2026

Audit **en lecture seule** réalisé par l'agent back-end. Rien n'a été modifié dans le code, le front, le back-office, les secrets ou la base ; aucun achat, aucun déploiement. Les seules écritures sont ce document et des fichiers temporaires hors du projet (une base jetable, supprimée).

**Légende des statuts :** `FONCTIONNEL ET TESTÉ` (mesuré pendant cet audit) · `IMPLÉMENTÉ, NON TESTÉ EN CONDITIONS RÉELLES` · `PARTIEL` · `ABSENT` · `BLOQUÉ PAR UN SERVICE EXTERNE`.
**Règle de lecture :** « mesuré » = j'ai exécuté la commande pendant cet audit ; « lu » = constaté dans le code ou la configuration sans exécution.

---

## 1. Résumé exécutif

1. **Une vraie lecture locale de bout en bout a été mesurée aujourd'hui** : le front (page `/production/tout-recommencer`), cliqué dans un navigateur réel, appelle l'API, obtient un manifeste signé, télécharge les segments et **joue la vidéo** (1280×720, position avancée jusqu'à 10,6 s, 15,17 s mises en mémoire, aucune erreur). Contenu : un clip de démonstration de 15 s déjà encodé en 4 qualités. `FONCTIONNEL ET TESTÉ` — **en local uniquement**.
2. **Le back-end est cohérent et sain** : 264 tests passent (0 ignoré, 0 échec), typage sans erreur, 19 migrations appliquées, API joignable et base connectée. `FONCTIONNEL ET TESTÉ`.
3. **Le front n'est que très partiellement branché** : une seule route de l'API est appelée (`GET …/playback`). Catalogue, fiches, comptes, recherche, reprise, liste, recommandations, ident, sous-titres, épisode suivant : **données fictives ou ignorées**. `PARTIEL`.
4. **Rien n'a été validé « en ligne »** : pas de serveur, pas de domaine, pas de HTTPS, image Docker jamais construite, aucun e-mail réel. `IMPLÉMENTÉ, NON TESTÉ EN CONDITIONS RÉELLES`.
5. **Mux** : intégration réelle validée une fois sur 4 s de vidéo avec le vrai compte ; **lecture signée jamais validée** (clé de signature absente). Aucun long film essayé. `BLOQUÉ PAR UN SERVICE EXTERNE` (clé de signature) pour la partie signée.
6. **Risque nouveau découvert : les dépôts back-end et back-office n'ont aucun dépôt distant** (`git remote` vide). Tout le code existe sur un seul ordinateur, sans copie hors machine. Seul le front est sur GitHub.
7. **Le chemin le plus court vers « une vraie vidéo en ligne »** passe par : (a) un essai Mux avec une vidéo de test longue, réalisable **sans** le propriétaire en lecture publique ; (b) le branchement du front à `ident`/`resume`/`subtitles` ; (c) le serveur, qui nécessite le propriétaire.

---

## 2. Architecture actuelle détaillée

### 2.1 Dépôts et état Git (mesuré)
| Dépôt | Branche | Dernier commit | Modifs non commitées | Dépôt distant |
|---|---|---|---|---|
| Back-end `ORIGIN-plateforme` | `main` | `372e49d` Programmation des sorties | aucune | **aucun** |
| Front `ORIGIN-plateforme/app` (dépôt à part) | `front/hero-immersive` | `a451193` Thématiques mobile | aucune | GitHub `pthdev2026/hero-stream-magic` |
| Back-office `~/Desktop/ORIGIN-back-office` | (dépôt propre) | `e8632d5` Documentation thème clair | aucune | **aucun** |

### 2.2 Back-end (lu + mesuré)
- **Pile :** Node 24 (TypeScript exécuté directement, sans compilation), Hono, `postgres` (porsager), zod, pino — **cinq dépendances d'exécution** au total.
- **Forme :** monolithe modulaire, couches `routes → service → repository`, 15 modules : `account analytics catalog contact health identity ingest media mux mylist ops playback privacy progress recommendation subtitles`. Séparation vérifiée par un test d'architecture.
- **Taille :** ~9 100 lignes (hors tests), 39 fichiers de test.
- **API :** 108 routes documentées dans `docs/API-CONTRACT.md` (v1.9) ; un test automatique impose que toute route enregistrée soit documentée.
- **Processus annexes (compose) :** `api`, `worker` (encodage FFmpeg), `backup` (quotidien), `watchdog` (5 min), plus `caddy` (HTTPS) et `postgres`. Tâches internes à l'API : entretien horaire, programmation toutes les 30 s, interrogation Mux toutes les 10 s.
- **Environnements :** développement (instance PostgreSQL locale, port 5433, démarrée à la main), test (schémas jetables), production (Compose, `deploy/.env.production.example`).

### 2.3 En cours d'exécution sur la machine (mesuré)
API sur `:4000` (`/health` → `{"status":"ok","database":"ok"}`, `/ready` → 200), PostgreSQL 17.10 sur `:5433`, serveur de développement du front sur `:3210`.

---

## 3. Diagramme des services et de leurs connexions

```
                         ┌──────────────── NAVIGATEUR ────────────────┐
                         │  Front « Millenium » (React / hls.js)      │
                         └──────┬──────────────────────┬───────────────┘
        seule route appelée     │ GET /api/…/playback  │ GET manifeste + segments (jeton signé)
        aujourd'hui  ───────────┘                      │
                                ▼                      ▼
   ┌───────────────────── API ORIGIN (Hono, Node 24) ─────────────────────┐
   │ identity · account · catalog · playback · progress · mylist · search │
   │ ingest · media · mux · subtitles · contact · privacy · ops           │
   └───────┬───────────────┬─────────────────────┬────────────────────────┘
           │ SQL           │ fichiers HLS        │ HTTPS (jeton Mux)
           ▼               ▼ (voie « self »)     ▼ (voie « mux »)
     PostgreSQL 17     disque local  ──(option)──▶ Bunny CDN      MUX (stockage, encodage,
     (32 tables)       storage/videos              [jamais testé   diffusion, lecture signée)
           ▲                ▲                       en réel]       [validé 1× sur 4 s]
           │                │
     backup (nuit)    worker FFmpeg ◀── tus (envoi du fichier) ◀── BACK-OFFICE (agent dédié)
     watchdog (5 min)                                              Login/2FA · Catalogue · Fiche
                                                                   Envoi vidéo · Préparations
```

---

## 4. Inventaire back-end

| Système | Fichiers principaux | Statut | Preuve / réserve |
|---|---|---|---|
| Comptes, sessions, rôles | `modules/identity/*` | FONCTIONNEL ET TESTÉ | suite de tests ; cookie `httpOnly`, argon2id, verrouillage, 2FA TOTP |
| Alerte de nouvel appareil, e-mails | `identity/service.ts` | IMPLÉMENTÉ, NON TESTÉ EN CONDITIONS RÉELLES | e-mails jamais envoyés pour de vrai (fournisseur Resend non branché) |
| Espace compte | `modules/account/*` | FONCTIONNEL ET TESTÉ | 16+ tests |
| Catalogue, collections, créateurs | `modules/catalog/*` | FONCTIONNEL ET TESTÉ | `GET /api/home` → 200 mesuré |
| Programmation des sorties | `catalog/admin.ts`, `main.ts` | FONCTIONNEL ET TESTÉ | 6 tests ; **10 exécutions simultanées sur 20 programmes : 20 sorties, 0 doublon** (mesuré) |
| Recherche, suggestions, fautes | `catalog/content.ts`, `search.ts` | FONCTIONNEL ET TESTÉ | tests ; non testé en charge sur gros catalogue pour les nouveautés |
| Lecture (session, ident, reprise, repères, suivant) | `modules/playback/*` | FONCTIONNEL ET TESTÉ | réponse réelle mesurée : clés `content, durationSeconds, expiresAt, ident, manifestUrl, markers, next, posterUrl, programId, renditions, resume, status, subtitles` |
| Reprise, « Ma liste » | `modules/progress`, `mylist` | FONCTIONNEL ET TESTÉ | tests ; jamais appelés par le front |
| Sous-titres | `modules/subtitles` | IMPLÉMENTÉ, NON TESTÉ EN CONDITIONS RÉELLES | tests ; **aucun fichier WebVTT déposé** (`storage/subtitles` vide) |
| Mesure de lecture | `modules/analytics` | FONCTIONNEL ET TESTÉ | table `playback_sessions` ; périmètre transféré à l'agent back-office |
| Contact, journal d'audit | `modules/contact`, `catalog/routes.ts` | FONCTIONNEL ET TESTÉ | tests |
| RGPD (export, suppression, rétention) | `modules/privacy`, `ops` | FONCTIONNEL ET TESTÉ | tests |
| Bandes-annonces gérées | — | ABSENT | seul un champ `trailerUrl` existe dans la fiche ; pas de route ni de lecture dédiée |
| Audio multiple, direct (live), DRM, notifications, profils | — | ABSENT | décisions propriétaire |

**Fonctionnalités non connectées côté front :** voir §7.
**Obstacle à un fonctionnement réel :** aucun côté code ; ce sont des obstacles d'environnement (§9, §10).

---

## 5. Inventaire du pipeline vidéo

### 5.1 Voie « self » (nos fichiers)
- **Envoi :** protocole tus (reprise possible) sous `/uploads/*`, petits fichiers admin sous `/files/*`.
- **Encodage :** worker FFmpeg avec baux et points de reprise → HLS fMP4 (segments de 4 s), échelle 1080/720/480/360, contrôle qualité, normalisation du volume (−16 LUFS), publication atomique. **5 tests de bout en bout avec un vrai FFmpeg : 5 passés** (mesuré, dont publication vers un Bunny simulé, reprise après interruption, rejet d'un fichier illisible).
- **Outil :** aucun FFmpeg dans le `PATH` de cette machine ; les tests utilisent celui d'une autre application (`…/AutoCut/ffmpeg/ffmpeg`). Sur le serveur, l'image Docker installe FFmpeg (jamais construite). Le worker local exigerait de renseigner `FFMPEG_PATH`.
- **Fichiers présents (mesuré) :** `storage/videos` = 76 Mo, 4 médias prêts (`tout-recommencer` 15 s, `deux-fois-oui-s1-e1`, `demo-b4`, `origin-ident`), 2 tâches d'encodage réussies.
- **Lecture (mesuré, via l'API réelle) :** manifeste maître avec 4 variantes ; **16 fichiers téléchargés, tous en 200, non vides** ; durée cumulée 15,08 s par qualité ; `#EXT-X-ENDLIST` présent ; `Range` → `206` ; **jeton falsifié → 403**.
- **Lecture signée :** jeton temporaire dans l'URL (`/media/<jeton>/…`), durée `MEDIA_TTL_SECONDS` (4 h par défaut), secret `MEDIA_SECRET` avec rotation (`MEDIA_SECRET_PREVIOUS`).

### 5.2 Bunny (CDN)
`IMPLÉMENTÉ, NON TESTÉ EN CONDITIONS RÉELLES` — publication vers la zone de stockage et URL signée par jeton CDN, testées **contre un faux**. Script `cdn:check` prêt. Aucun compte Bunny connecté. Pas nécessaire si Mux est retenu (décision du 30/10).

### 5.3 Mux
| Élément | Statut |
|---|---|
| Client HTTP, envoi direct navigateur → Mux, suivi, inscription en base | FONCTIONNEL ET TESTÉ **sur le compte réel, 1 essai de 4 s** (session antérieure) ; 15 tests automatiques contre un faux Mux |
| Jeton d'accès (`MUX_TOKEN_ID`/`SECRET`) | présent dans `api/.env` (droits 600, **absent de l'historique Git** — mesuré sur les 50 derniers commits) |
| Lecture **signée** | IMPLÉMENTÉ, NON TESTÉ EN CONDITIONS RÉELLES — `MUX_SIGNING_KEY_ID`/`MUX_SIGNING_PRIVATE_KEY` **absents** ; sans clé, la lecture signée répond 503 (comportement sûr, lu) ; la configuration refuse de démarrer en `signed` sans clé (lu) |
| Webhooks | ABSENT (interrogation toutes les 10 s à la place) |
| Film long, taille, coût, résidence des données, conditions d'utilisation | non vérifiés |
| Base | aucune ligne dans `mux_uploads` (mesuré) : aucun envoi Mux n'est en base |

### 5.4 Comportement quand les clés externes sont absentes (lu)
Mux désactivé (routes d'administration indisponibles, voie « self » seule) ; Bunny désactivé (`DELIVERY_MODE=origin`, l'API sert elle-même les fichiers) ; e-mails en mode « journal » (affichés dans les logs, pas envoyés).

### 5.5 Architecture multi-fournisseurs
FONCTIONNEL ET TESTÉ : le fournisseur est choisi **média par média** (`provider` = `self` ou `mux`) par un signataire de routage ; les deux voies cohabitent. Le même contrat de lecture est renvoyé dans les deux cas.

### 5.6 Une vidéo autorisée peut-elle être importée et regardée intégralement en local ?
- **Regardée :** oui — mesuré (clip de 15 s, navigateur réel).
- **Importée par notre chaîne :** oui par tests de bout en bout avec un vrai FFmpeg (outil externe à la machine) ; jamais refait avec un long film.
- **Importée par Mux :** possible par l'API avec le jeton présent ; pas d'écran de lecture signée possible tant que la clé de signature manque.

---

## 6. Inventaire PostgreSQL / Supabase (mesuré)

- **Supabase : non utilisé.** Aucune occurrence dans l'API, ses scripts, le déploiement ni le `package.json` du front ; la seule trace dans le front est un fichier de signalement d'erreurs généré par Lovable (`lovable-error-reporting.ts`). Les mentions dans `docs/` sont des analyses comparatives.
- **PostgreSQL 17.10 local**, `public`, **32 tables** : audit_log, collection_items, collections, contact_messages, creator_contents, creators, email_changes, email_verifications, episodes, invitations, login_devices, media_assets, media_jobs, mux_uploads, my_list, password_resets, playback_sessions, program_themes, programs, schema_migrations, search_history, seasons, sessions, subtitle_tracks, themes, uploads, user_preferences, user_recovery_codes, user_themes, user_totp, users, watch_progress.
- **Migrations :** 18 appliquées (001, 003 à 019 ; 002 volontairement absente), **aucune en attente**. Additives, sérialisées par verrou.
- **Données de développement :** 39 programmes (39 publiés, 38 de démonstration), 4 médias prêts (tous `self`), 1 administrateur et 2 spectateurs, 3 sessions actives.
- **Sauvegarde / restauration :** `backup`, `backup:verify`, `restore` (chiffrées AES-256-GCM, restauration d'essai) — testées en local lors d'une session antérieure ; **jamais externalisées** (aucune copie hors serveur configurée).

---

## 7. État des connexions front (lu, branche `front/hero-immersive`)

Seule la page de lecture appelle l'API. Le front possède `origin-api.ts` (91 lignes, **une seule fonction `fetchPlayback`**), `use-hls.ts` (hls.js) et `env.ts`.

| Fonctionnalité | Backend prêt ? | État front |
|---|---|---|
| Lecture HLS (`/playback`) | oui | **Totalement connectée** (mesuré, §1) |
| Ident de marque (`ident.show`) | oui | Réponse **ignorée** (le client ne lit pas ce champ, n'envoie pas `identSeen`) — PARTIEL |
| Reprise (`resume`, `PUT /api/me/progress`) | oui | **Non connectée** (le client lit uniquement `manifestUrl`, `posterUrl`, durée, qualités) |
| Sous-titres (`subtitles`) | oui (aucun fichier déposé) | Non connectée ; l'écran affiche des choix Français/English fictifs |
| Épisode suivant, « Passer l'intro » (`next`, `markers`) | oui | Non connectées |
| Choix de langue audio | **non** (une seule piste) | L'écran affiche « Français / English / Audiodescription » : **fictif** |
| Accueil, catalogue, fiche, classement, thématiques, créateurs | oui | Données **fictives** locales (la page affiche « Contenu de démonstration ») |
| Recherche (+ suggestions, fautes) | oui | Données fictives |
| Comptes (inscription, connexion, 2FA, mot de passe oublié, vérification) | oui | Comptes de démonstration (`demo-accounts.ts`, `demo-session.ts`) — les clients réels existent sur la branche `front/comptes-securite`, non fusionnée |
| Espace compte, Ma liste, Continuer à regarder | oui | `demo-space.ts` : fictif |
| Recommandations « Pour vous » | oui | Non appelées |
| Bandes-annonces | non (route absente) | Aperçus vidéo locaux uniquement |
| Contact | oui | Non connecté |

**Détail de configuration :** aucun fichier `.env` dans le front ; sans `VITE_API_URL` le front retombe sur `http://127.0.0.1:4000` (observé), alors que le contrat exige `localhost` pour que le cookie de session fonctionne dès que l'authentification sera branchée.
**Tests front :** une exécution du `npm test` du front a été lancée mais n'a pas terminé dans la durée impartie ; **non mesuré**.

---

## 8. État des interfaces d'administration (lu + mesuré, back-office en lecture seule)

Back-office : React + Vite, `tus-js-client`. **8 fichiers de test, 23 tests passés ; typage sans erreur** (mesuré).
- **Écrans présents :** connexion, configuration 2FA, catalogue, fiche programme (formulaire), envoi vidéo (Mux), préparations (jobs).
- **Routes API appelées :** `/api/admin/catalog`, `/api/admin/mux/uploads`, `/api/admin/video-providers`, `/api/auth/login|logout`, `/api/me`, `/api/me/2fa/*`, `/api/themes`, `/api/admin/jobs`, `/api/admin/programs/*`, `/api/programs/*`, `/files/images/*` : toutes existent au contrat.
- **Écarts avec le contrat v1.9 — fonctions du back-end qu'il n'utilise pas encore :** mots-clés de recherche, programmation des sorties (`publishAt`, `unpublishAt`, `announced`, calendrier), repères d'intro/générique, sous-titres, créateurs et leurs contenus, collections, journal d'audit, messages de contact, invitations. (Chacun est à 0 occurrence dans son code.)
- **Chevauchement :** aucun constaté. La mesure de lecture et l'administration lui sont dévolues ; le back-end ne fait que fournir les routes.

---

## 9. État du déploiement

| Point | Statut |
|---|---|
| Image Docker (`api/Dockerfile`, Node 24 + FFmpeg, utilisateur non-root, healthcheck) | IMPLÉMENTÉ, NON TESTÉ — **`docker` absent de cette machine ; l'image n'a jamais été construite**. Un job CI la construit mais le dépôt n'a pas de distant, donc la CI **n'a jamais tourné** |
| Compose (api, worker, backup, watchdog, caddy, postgres), Caddyfile (HTTPS automatique, `-Server`, HSTS) | IMPLÉMENTÉ, NON TESTÉ (lu) |
| Variables d'environnement | documentées (`contexte-agents/09`, `deploy/.env.production.example`) ; `VIDEO_PROVIDER=mux` positionné dans le modèle |
| Stockage persistant | volumes `pgdata` et `data` prévus ; **aucune copie externe des sauvegardes** |
| HTTPS / domaine | ABSENT (aucun domaine ni serveur ; hébergeur non arrêté : Hetzner et Hostinger évoqués, **aucun achat**) |
| Supervision / alertes | `/health`, `/ready`, `/metrics` (jeton), watchdog avec webhook ; `ALERT_WEBHOOK_URL` non renseigné |
| En-têtes de sécurité (mesuré) | présents : `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, HSTS (6 mois), `Referrer-Policy: no-referrer`, COOP, etc. **Pas de `Content-Security-Policy`** (acceptable pour une API JSON ; à décider pour le front) |
| CORS (mesuré) | écriture depuis une origine étrangère → **403** ; aucun `Access-Control-Allow-Origin` pour une origine inconnue |
| Limitation de débit | présente (120/min API, 10/min authentification, 5/h contact) — testée |

---

## 10. Risques et problèmes bloquants

| # | Risque | Gravité | Nature |
|---|---|---|---|
| 1 | **Code back-end et back-office sans aucune copie hors de cet ordinateur** (pas de dépôt distant) | Élevée | Perte totale possible en cas de panne ou de vol de la machine |
| 2 | Jamais validé en ligne (serveur, HTTPS, domaine, cookies `__Host-`, e-mails) | Élevée | Inconnues réelles |
| 3 | Image Docker jamais construite ; CI jamais exécutée | Élevée | Peut casser au premier déploiement |
| 4 | Lecture signée Mux jamais testée ; clé de signature absente | Élevée | Bloqué par une action propriétaire |
| 5 | Aucun long film essayé (Mux ou chaîne propre) | Élevée | Durée, taille, coût inconnus |
| 6 | Front : ident, reprise, sous-titres, suivant, intro non lus ; tout le reste fictif | Élevée | Dette d'intégration front |
| 7 | Écran affichant des fonctions inexistantes (choix de langue audio, sous-titres sans fichier) | Moyenne | Promesse non tenue à l'utilisateur |
| 8 | Une publication automatique peut rendre visible un titre sans média prêt (il reste non lisible, `playable: false`) | Moyenne | Décision propriétaire en attente |
| 9 | Jeton Mux passé dans une conversation | Moyenne | À régénérer avant la production |
| 10 | Aucune revue de sécurité extérieure ; pas de test d'intrusion | Moyenne | — |
| 11 | Aucune copie externe des sauvegardes de la base | Moyenne | — |
| 12 | Back-office n'utilise pas encore les nouvelles routes (programmation, repères, sous-titres…) | Faible | Normal, échéance de l'autre agent |

---

## 11. Travail réalisable sans intervention du propriétaire

1. **Essai Mux avec une vidéo de test longue** (par exemple 10 à 30 minutes générées avec FFmpeg : mire + tonalité, donc sans droits d'auteur) en **lecture publique**, avec le jeton déjà présent : mesure de la durée d'envoi, du temps de préparation et de la qualité obtenue. Écrit une trace de coût et de limites. *(Effet externe : consomme un peu de quota Mux ; à confirmer avant exécution.)*
2. Page de test de lecture hors projet et script automatisé « envoi → prêt → lecture publique → lecture refusée sans jeton » prêt à rejouer en mode signé.
3. Script d'installation du VPS (utilisateur, pare-feu, mises à jour, Docker) et relecture des fichiers de déploiement.
4. Revue de sécurité interne et tests complémentaires (en-têtes, cookies, droits).
5. Test de charge des nouveautés (suggestions, correction, bouton « Lecture », programmation).
6. Routes d'administration manquantes pour le back-office (utilisateurs, invitations) — annoncées dans `docs/API-REQUESTS.md` avant.
7. Mise à jour du brief front : rappeler que `ident`, `resume`, `subtitles`, `next`, `markers` sont **déjà renvoyés** par `/playback` et attendent d'être lus.
8. Création de la **copie de sauvegarde du code** (par exemple une archive `git bundle` sur un disque externe) si le propriétaire l'accepte.

## 12. Actions nécessitant impérativement une intervention humaine

1. Créer la **clé de signature Mux** et **régénérer le jeton d'accès**.
2. Choisir et payer **l'hébergeur / VPS**, acheter le **nom de domaine**, créer le compte **Resend** (e-mails).
3. Créer un dépôt distant privé (GitHub) pour le back-end et le back-office, ou autoriser une autre copie externe.
4. Fournir un **vrai film** et valider les **droits** d'exploitation ; lire **conditions d'utilisation, tarifs, résidence des données** de Mux.
5. Décider : publication automatique **conditionnée** à un média prêt (oui/non) ; audio multiple ; connexion Google/Apple ; profils ; direct ; langue des contenus.
6. Rédiger et faire valider les **pages légales** (avant d'inviter des utilisateurs).
7. Autoriser tout déploiement public ou achat.

## 13. Plan d'exécution priorisé pour obtenir une lecture vidéo réelle

| Ordre | Étape | Qui | Critère de réussite |
|---|---|---|---|
| 0 | Sécuriser le code : dépôt distant privé pour back-end et back-office | Propriétaire | `git push` réussi ; copie hors machine |
| 1 | Essai Mux, vidéo longue de test, lecture publique | Agent back-end (sur accord) | Prête sans erreur ; lecture complète dans un navigateur ; durées et limites consignées |
| 2 | Clé de signature Mux + jeton régénéré | Propriétaire | `mux:check` OK ; lien sans jeton refusé, lien signé accepté |
| 3 | Front : lire `ident`, `resume`, `subtitles`, `next`, `markers`, envoyer la progression | Agent front | Parcours « lire → quitter → revenir → reprendre » démontré en local |
| 4 | Serveur + domaine + HTTPS + e-mails (plan de mise en ligne, phases 1–3) | Propriétaire + agent back-end | `/health` en HTTPS ; e-mails reçus ; restauration rejouée |
| 5 | Un vrai film via le back-office sur le serveur, lecture signée sur ordinateur, iPhone, Android | Tous | Une heure sans coupure ; refus sans jeton |
| 6 | Branchement du front restant (comptes, catalogue, recherche), recette en ligne | Agent front | Recette de 10 vérifications du brief |
| 7 | Bandes-annonces, popularité | Agent back-end | Après validation de l'étape 5 |

## 14. Résultats exacts des tests et preuves (mesurés pendant cet audit)

| Contrôle | Résultat |
|---|---|
| `tsc --noEmit` (back-end) | aucune erreur |
| `npm test` (back-end) | `tests 264 · suites 74 · pass 264 · fail 0 · skipped 0 · 19,7 s` |
| Test e2e d'encodage avec FFmpeg réel | 5/5 passés |
| Typage + tests du back-office | typage sans erreur ; 23/23 tests (8 fichiers) |
| Santé du serveur | `/health` 200 `{"status":"ok","database":"ok"}` ; `/ready` 200 |
| Routes publiques sondées | `/api/home`, `/api/coming-soon`, `/api/search`, `/api/search/suggestions`, `/api/programs`, `/api/creators`, `/api/programs/tout-recommencer/playback`, `/…/play-target` → 200 ; `/api/me` sans session → 401 |
| Base | 32 tables ; migrations 001–019 appliquées sauf 002 (absente par conception) ; aucune en attente |
| Lecture HLS directe (API) | 4 variantes ; 16 fichiers téléchargés tous 200 non vides ; `ENDLIST` présent ; `Range` → 206 ; jeton falsifié → 403 |
| **Lecture dans un navigateur réel** (front :3210 → API :4000) | `<video>` : 1280×720, `readyState 4`, `currentTime` 10,63 s, `buffered` 15,17 s sur 15,17 s, `error: null`, **aucune erreur console** ; 284 requêtes réseau, segments 200 |
| Concurrence de la programmation | 10 exécutions simultanées × 20 programmes : 20 sorties, 20 distincts, 20 lignes d'audit |
| Média non prêt | programme publié avec média « en cours d'encodage » → non lisible ; sans média → non lisible |
| Secrets | `api/.env` ignoré par Git, droits 600 ; valeurs des deux jetons Mux absentes de l'historique (50 derniers commits) |
| CORS / en-têtes | écriture depuis origine étrangère → 403 ; en-têtes de sécurité présents (voir §9) |
| **Non mesuré** | construction Docker ; CI ; tests du front ; lecture signée Mux ; film long ; e-mails réels ; quoi que ce soit en ligne |

---
*Ce rapport ne contient aucune valeur secrète. Prochaine étape attendue : l'analyse architecturale avant toute décision structurante.*
