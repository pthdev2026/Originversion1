# ORIGIN — Cahier des charges du back-office (outil d'administration)

Version 1.0 — 30/10/2026 — Auteur : agent back-end — Destinataire : l'agent qui construira le back-office
Statut : **à valider par le propriétaire avant de démarrer la phase 1.**

> **En une phrase** : une application web réservée au propriétaire, qui permet de créer un programme, d'envoyer sa vidéo, de suivre sa préparation, de la publier et d'observer sa performance — **sans jamais ouvrir Bunny, Mux, un terminal ni la base de données**.

Documents à lire avant de commencer : `contexte-agents/README.md` (parcours « agent front »), `docs/API-CONTRACT.md` (v1.2 ou plus récent), `docs/SECURITE-BACKEND.md`, `docs/DESIGN.md` (pour le ton seulement), ce cahier des charges.

---

## 1. Pourquoi, et dans quel ordre

### 1.1 Le besoin
Aujourd'hui, ajouter une vidéo exige des commandes tapées sur le serveur (`npm run media:enqueue`), des appels d'API à la main pour créer la fiche et la publier, et aucun écran pour suivre la préparation ni les statistiques. Pour un propriétaire non développeur, c'est le principal frein pour **mettre des vidéos en ligne et les observer**.

### 1.2 Ce que le back-office n'est pas
- Pas un écran pour le public : **aucun spectateur n'y accède, ni n'en voit l'adresse**.
- Pas un remplaçant du back-end : il **utilise l'API existante** (63 routes) et n'implémente aucune règle métier.
- Pas un préalable à la validation du CDN : la connexion à Bunny/Mux se vérifie **par commande**, en parallèle (`npm run cdn:check`).

### 1.3 Ordre de construction (esprit MVP)
| Phase | Contenu | But |
|---|---|---|
| **Phase 1 — Minimum utile** | Connexion + double authentification, liste du catalogue, créer/éditer un programme, envoyer une vidéo, suivre la préparation, publier | Mettre les 10 premières productions en ligne sans terminal |
| **Phase 2 — Éditorial** | Organiser l'accueil (Top 10, Hero, rails), thématiques, créateurs, images, sous-titres, invitations | Piloter l'expérience du spectateur |
| **Phase 3 — Observation** | Tableau de bord (audience, achèvement, qualité de lecture, santé du système), journal des modifications, comptes | Mesurer la performance des vidéos |
**Ne pas construire la phase 3 avant que la phase 1 soit utilisée en vrai.**

---

## 2. Principes non négociables
1. **Réservé à l'administrateur** : chaque appel est vérifié par le serveur (rôle `admin`, et double authentification si exigée). L'interface cachée n'est pas la sécurité ; **la sécurité est côté API**.
2. **Honnêteté** : jamais d'état simulé. Une vidéo « en préparation » est affichée comme telle ; un contenu « non lisible » n'est jamais présenté comme prêt.
3. **Tout en français**, simple, sans jargon (le propriétaire n'est pas développeur) : « Brouillon », « Publié », « En préparation », « Prêt », « Échec — relancer ».
4. **Chaque erreur de l'API est expliquée** à l'écran avec le `message` fourni, et une action possible.
5. **Aucune action destructive sans confirmation** (supprimer un programme, annuler une préparation).
6. **Aucun secret dans le code** de l'interface ; aucun jeton stocké dans `localStorage` (la session est un cookie `httpOnly` géré par le navigateur).
7. **Ne jamais modifier `api/`** (back-end) : toute demande passe par `docs/API-REQUESTS.md`.

---

## 3. Architecture
| Sujet | Décision |
|---|---|
| Application | **À part** du site public et du dossier du projet : dossier **`~/Desktop/ORIGIN-back-office/`** sur le Bureau, **dépôt Git séparé**, **non relié à Lovable**. Il ne contient aucun code de l'API : il lui parle uniquement par son adresse (`VITE_API_URL`) |
| Adresse | `admin.origin.xxx` (même domaine principal que l'API, pour le cookie de session) ; non indexée par les moteurs de recherche (`noindex`) |
| Hébergement | Fichiers statiques (application monopage) servis par le portier Caddy du serveur, ou tout hébergeur statique |
| Pile conseillée | React + TypeScript strict + Vite + Tailwind + Vitest, gestionnaire **bun** (comme le front) ; l'agent peut proposer mieux s'il le justifie |
| Appels à l'API | `fetch` avec `credentials: 'include'`, adresse dans `VITE_API_URL` |
| Cookie / CORS | L'origine `https://admin.origin.xxx` doit figurer dans `CORS_ORIGINS` côté API (configuration, à demander) ; en local : `http://localhost:<port>` |
| Design | Sobre, sombre, lisible, **fonctionnel avant tout**. Pas besoin de reprendre la direction artistique du site public ; reprendre seulement le fond sombre et l'argent par cohérence |
| Ordinateur d'abord | Utilisé sur un ordinateur ; tablette acceptable ; téléphone non prioritaire |

Sécurité complémentaire (côté serveur, hors de ce chantier) : option de n'autoriser que l'adresse IP du propriétaire sur ce sous-domaine, au niveau du portier.

---

## 4. Accès et authentification
1. **Écran de connexion** : e-mail + mot de passe → `POST /api/auth/login`.
2. Si la réponse est `401 { error: "two_factor_required" }` : afficher le champ « Code de votre application » (6 chiffres) ou « code de secours », puis renvoyer la même requête avec `code`.
3. Après connexion, `GET /api/me` : si `role !== 'admin'` → message « Accès réservé » et déconnexion ; **aucun écran d'administration n'est affiché**.
4. Si une route répond `403 { error: "two_factor_required" }` (administrateur sans double authentification alors qu'elle est exigée) : afficher l'assistant d'activation (`POST /api/me/2fa/setup` → afficher le secret en QR code (`otpauthUrl`) → `POST /api/me/2fa/enable` avec un premier code → **afficher les 8 codes de secours une seule fois**, avec un bouton « Je les ai notés »).
5. Session expirée (`401`) : retour à la connexion en conservant la page demandée.
6. Déconnexion : `POST /api/auth/logout`.
7. Le compte administrateur est créé par l'exploitant (`npm run user:create-admin`). Le back-office n'a **pas** d'inscription.

---

## 5. Les écrans

### Phase 1

**S1 — Connexion** (voir §4).

**S2 — Catalogue** (`GET /api/admin/catalog`)
- Liste des programmes : titre, type (film/série/documentaire), **statut** (Brouillon / Publié), **lisible ou non** (vidéo prête ?), démonstration (oui/non).
- Recherche locale par titre, filtre par statut.
- Boutons : « Nouveau programme », ouvrir une fiche.
- État vide : « Aucun programme. Créez le premier. »

**S3 — Fiche programme** (créer / modifier) — `PUT /api/admin/programs/:slug`, lecture : `GET /api/admin/programs/:slug` (livré, voir §7 B2)
- Champs (conformes à la validation du serveur, `api/src/modules/catalog/schemas.ts`) : type, titre, lignes de titre, accroche, résumé, catégorie, libellé de durée, année, langue, classification, présentateur, genres, étiquettes, thématiques (liste issue de `GET /api/themes`), visuels (affiche, fond, logo : adresse ou image envoyée, voir B1), texte alternatif des images, vidéo de fond, bande-annonce, « démonstration ».
- **Identifiant (slug)** : proposé automatiquement à partir du titre (minuscules, chiffres, tirets, sans accents) ; **modifiable seulement à la création** (l'identifiant ne change plus ensuite). Vérifier qu'il n'existe pas déjà.
- **Séries** : éditeur de saisons et d'épisodes (clé d'épisode `s1-e1`, numéro, titre, résumé, durée, image). L'identifiant de lecture d'un épisode est `<slug>-<clé>` (affiché en lecture seule).
- Enregistrement : un clic ; le serveur renvoie `400` avec un message précis en cas d'erreur : l'afficher à côté du champ concerné quand c'est possible.
- Un nouveau programme est **toujours créé en brouillon**.
- **Avertissement visible** : « Cette fiche n'est pas visible du public tant qu'elle n'est pas publiée. »

**S4 — Envoyer une vidéo** (deux voies : demander `GET /api/admin/video-providers` ; si `mux` est la voie par défaut, utiliser le parcours « Voie vidéo Mux » du contrat — `POST /api/admin/mux/uploads`, puis `PUT` du fichier sur `uploadUrl` **sans cookie**, puis suivi par `GET /api/admin/mux/uploads/:id` ; sinon le parcours tus décrit ci-dessous)
- Depuis la fiche (film) ou depuis un épisode (série) : « Envoyer la vidéo ».
- Choix du fichier (extensions acceptées : `.mp4 .mov .m4v .mkv .webm .avi .mxf`), l'identifiant de lecture est **pré-rempli** (`<slug>` pour un film, `<slug>-<clé>` pour un épisode) et non modifiable.
- Envoi **reprenable** par le protocole tus (voir §8) : barre de progression, vitesse, temps restant, **pause/reprise**, reprise automatique après une coupure de connexion, avertissement si l'onglet est fermé pendant l'envoi.
- À la fin de l'envoi, la préparation démarre toute seule : rediriger vers S5.
- Erreurs : `409` « Une préparation est déjà en cours pour ce contenu », `413` fichier trop gros, `403` accès refusé, disque plein (message du serveur).

**S5 — Suivi des préparations** (`GET /api/admin/jobs`, `GET /api/admin/jobs/:id`)
- Liste des tâches : contenu, **statut** (`queued` En attente, `running` En cours, `succeeded` Prêt, `failed` Échec, `canceled` Annulé), **étape** lisible (`step`), **pourcentage** (`progress`), tentatives (`attempts`/`maxAttempts`), dernière erreur (`lastError`).
- Actualisation automatique toutes les **5 à 10 secondes** tant qu'une tâche est active.
- Actions : **Relancer** (`POST /api/admin/jobs/:id/retry`, tâche échouée ou annulée), **Annuler** (`POST /api/admin/jobs/:id/cancel`, avec confirmation).
- Message d'aide : « Compter environ 2 fois la durée du film (un film de 2 h ≈ 4 à 5 h) ».

**S6 — Publier**
- Interrupteur « Visible par le public » (enregistre `published`), **désactivé tant que la vidéo n'est pas prête** (sauf pour une fiche sans vidéo, avec avertissement « Pas de vidéo : le bouton Regarder n'apparaîtra pas »).
- Lien « Voir la page publique ».
- Après publication : proposer « Ajouter à l'accueil » (phase 2).

### Phase 2

**S7 — Accueil** : `PUT /api/admin/collections/:slug`. Liste des collections de l'accueil (Hero, Top 10, rails) avec **glisser-déposer** de l'ordre des programmes, ajout/retrait, titre, étiquette, position sur l'accueil (`homePosition`), publication de la collection. Aperçu du rang (Top 10). Collections existantes : `hero`, `top-10`, `suggestions`, `universes`, `pth-originals`, `nouveautes`, `suspense`, `drama`, `couple`, `science-fiction`.
**S8 — Thématiques** (`PUT/DELETE /api/admin/themes/:slug`) et **Créateurs** (`PUT/DELETE /api/admin/creators/:slug`).
**S9 — Images** : envoi d'une image (voir B1) depuis la fiche ; aperçu ; point focal (`imageFocus`) réglable.
**S10 — Sous-titres** : par vidéo et par langue, `PUT /files/subtitles/:playbackId/:lang?label=…&default=true` avec le fichier WebVTT brut ; liste ; suppression. Contrôles côté interface : le fichier commence par `WEBVTT`, 1 Mo au plus.
**S11 — Invitations** : `POST /api/admin/invitations` (note, nombre d'usages, durée) ; afficher le code **une seule fois** avec un bouton « Copier ».

### Phase 3

**S12 — Tableau de bord** : `GET /api/admin/metrics/programs?days=` (lectures réelles, heures, durée moyenne regardée, spectateurs, taux d'achèvement, démarrage, erreurs, coupures) ; `GET /api/admin/metrics/playback` (qualité de lecture globale et par appareil, **objectifs** : démarrage p75 < 2 s, coupures < 1 %, erreurs < 1 %, avec voyants vert/rouge) ; `GET /api/admin/system` (santé : base, disque, tâches, dernière sauvegarde). Santé du catalogue : programmes publiés sans vidéo.
**S13 — Journal des modifications** (voir B3).
**S14 — Comptes** (liste, désactivation) : **nécessite des routes à créer** (hors de ce cahier des charges ; demander via `docs/API-REQUESTS.md`).

---

## 6. Ce qui existe déjà dans l'API (aucune modification nécessaire)
| Besoin | Route |
|---|---|
| Connexion, session, 2FA | `POST /api/auth/login`, `GET /api/me`, `POST /api/auth/logout`, `POST /api/me/2fa/{setup,enable,disable}` |
| Catalogue (admin) | `GET /api/admin/catalog`, `PUT/DELETE /api/admin/programs/:slug` |
| Thématiques, créateurs, collections | `GET /api/themes`, `GET /api/creators`, `PUT/DELETE /api/admin/{themes,creators,collections}/:slug` |
| Envoi de vidéo (tus) | `POST /uploads`, `HEAD/PATCH/DELETE /uploads/:id` |
| Préparation | `GET /api/admin/jobs`, `GET /api/admin/jobs/:id`, `POST …/cancel`, `POST …/retry` |
| Sous-titres | `PUT/DELETE /files/subtitles/:playbackId/:lang` |
| Statistiques | `GET /api/admin/metrics/programs`, `/api/admin/metrics/playback`, `/api/admin/system` |
| Invitations | `POST /api/admin/invitations` |
Contrat détaillé : `docs/API-CONTRACT.md`. En cas d'écart entre ce document et le code ou le contrat, **le contrat et le code font foi**.

---

## 7. Ce que le back-end ajoute pour le back-office (côté agent back-end)
**B1, B2 et B4 sont livrés (contrat v1.3, 30/10/2026)** et testés : l'agent du back-office les utilise directement. B3 (journal) et B5 (Mux) restent à venir ; il peut simuler B3 en attendant (clairement signalé « simulé » dans le code, jamais à l'écran).

| Réf. | Ajout | Contrat proposé | Utilisé par | Priorité |
|---|---|---|---|---|
| **B1** ✅ livré | Envoi d'images | `PUT /files/images/:slug/:file` — corps = image brute ; `.jpg .jpeg .png .webp .avif` ; ≤ 10 Mo ; type vérifié sur le contenu (pas seulement l'extension) ; réponse `201 { url: "/images/<slug>/<file>" }` ; administrateur uniquement | S3, S9 | Phase 1 |
| **B2** ✅ livré | Vue « fiche admin » d'un programme | `GET /api/admin/programs/:slug` — tous les champs éditoriaux (brouillon inclus), saisons/épisodes, thématiques, **médias** (`playbackId`, statut, durée) et **dernières tâches** | S3, S4, S6 | Phase 1 |
| **B3** | Journal des modifications éditoriales | Écriture dans `audit_log` à chaque modification admin (`catalog.program.upsert`, `…delete`, `collection.upsert`…) ; `GET /api/admin/audit?limit=&before=` | S13 | Phase 3 |
| **B4** ✅ livré | Filtre des tâches | `GET /api/admin/jobs?playbackId=` ou `?program=` | S4, S5 | Phase 1 |
| **B5** ✅ livré (phase 1) | Voie Mux | `GET /api/admin/video-providers`, `POST /api/admin/mux/uploads` (renvoie `uploadUrl`), `GET /api/admin/mux/uploads[/:id]`, `POST …/cancel` — voir `docs/API-CONTRACT.md` « Voie vidéo Mux » | S4 | Phase 1 |
Chaque ajout est annoncé dans `docs/API-CONTRACT.md` (nouvelle version) avant d'être utilisé.

---

## 8. Guide de l'envoi tus (reprenable)
Protocole : tus 1.0.0. Bibliothèque conseillée : `tus-js-client` (à valider : version récente et maintenue).
1. **Créer** : `POST /uploads` avec `Tus-Resumable: 1.0.0`, `Upload-Length: <octets>`, `Upload-Metadata` = paires `clé valeurEnBase64` séparées par des virgules : `filename`, `playbackId`, `kind` (`film|serie|documentaire`), `title`, `programSlug` (facultatif, par défaut = playbackId), `demo` (`true|false`, facultatif). Réponse `201` + en-tête `Location: /uploads/<id>`.
2. **Envoyer** : `PATCH /uploads/<id>` avec `Upload-Offset` et `Content-Type: application/offset+octet-stream`, par morceaux.
3. **Reprendre** : `HEAD /uploads/<id>` renvoie `Upload-Offset` (où reprendre).
4. **Fin** : au dernier octet, le serveur range le fichier et **crée lui-même** la tâche de préparation. Aucun appel supplémentaire.
5. **Annuler** : `DELETE /uploads/<id>`.
Toutes ces requêtes exigent le cookie administrateur (`credentials: 'include'`), l'origine autorisée, et — si exigée — la double authentification.
Limite : `UPLOAD_MAX_BYTES` (60 Go par défaut). Refus si l'espace disque du serveur est insuffisant.

---

## 9. États d'erreur à gérer (tous les écrans)
| Réponse | Comportement |
|---|---|
| `401` | Retour à la connexion (conserver la page) |
| `401 two_factor_required` (à la connexion) | Demander le code |
| `403 two_factor_required` | Assistant d'activation de la 2FA |
| `403 forbidden` | « Accès refusé » |
| `400` | Afficher `message` ; ne pas réessayer sans correction |
| `404` | « Introuvable » |
| `409` | Afficher `message` (doublon, préparation déjà en cours) |
| `413` | « Fichier trop volumineux » |
| `429` | « Trop de demandes, patientez » (respecter `Retry-After`) |
| `503` | « Service momentanément indisponible », bouton Réessayer, respecter `Retry-After` |
| Réseau | Message clair, reprise automatique pour l'envoi de fichier |
Chaque erreur comporte un `requestId` : l'afficher en petit (copiable) pour faciliter le diagnostic.

---

## 10. Qualité attendue
- Tests unitaires pour la logique (génération du slug, validation, mappage des statuts, reprise d'envoi) ; au moins un test par écran de la phase 1 avec l'API simulée.
- Commandes de contrôle propres avant chaque livraison : vérification des types, tests, construction.
- Accessibilité de base : navigation au clavier, libellés des champs, contrastes suffisants, focus visible.
- Aucune dépendance superflue ; aucune donnée personnelle dans les journaux de l'interface.
- Livraison **par phase**, avec captures d'écran et la liste de ce qui est fait / limité / non fait.

---

## 11. Critères d'acceptation de la phase 1
Un administrateur doit pouvoir, **sans terminal** :
1. Se connecter avec sa double authentification ; un compte non administrateur est refusé.
2. Créer un programme en brouillon (film), avec identifiant généré et thématiques.
3. Envoyer une vidéo de 30 secondes, voir la progression de l'envoi, couper puis rétablir la connexion et constater la **reprise**.
4. Suivre la préparation jusqu'à « Prêt », voir une erreur volontaire (fichier invalide) expliquée, et la **relancer**.
5. Publier : `GET /api/programs/<slug>` (public) renvoie la fiche avec `playable: true` ; avant publication, il renvoie 404.
6. Voir la liste du catalogue avec le bon statut de chaque programme.
7. Refaire la même chose pour un épisode de série.

---

## 12. Hors périmètre
Paiement, comptes spectateurs avancés, édition vidéo, encodage dans le navigateur, application mobile, multi-administrateurs avec rôles différenciés (un seul administrateur pour l'instant), statistiques temps réel.

## 13. Questions ouvertes (à trancher avant ou pendant la phase 1)
1. **Nom de domaine** de l'outil (`admin.origin.xxx`) et restriction par adresse IP : oui/non.
2. **Voie vidéo** : Bunny (envoi via notre serveur) ou Mux (envoi direct possible) — sans effet sur les écrans, mais l'écran S4 devra être adaptable (B5).
3. **Qui est l'agent** : l'agent front actuel ou un agent dédié (recommandé : dédié, pour ne pas bloquer le site public).
4. Faut-il un **second administrateur** (collaborateur) à court terme ?
