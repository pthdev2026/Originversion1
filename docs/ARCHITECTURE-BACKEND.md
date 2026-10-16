# Architecture du back-end ORIGIN — guide pour comprendre et apprendre

Ce document explique **pourquoi** le code est organisé ainsi, pas seulement comment. Lis-le avec VS Code ouvert
sur le dossier `api/` : chaque fichier a un commentaire d'en-tête qui rappelle son rôle.

## 1. L'idée en une image

On construit un **monolithe modulaire** : un seul programme, mais découpé en « modules » aux frontières nettes.

```
 Navigateur ──▶ [ Middlewares ] ──▶ Module ──▶ Base de données / Fichiers
               identifiant, journal,    ┌────────────────────────────┐
               sécurité, CORS           │ routes  : parle HTTP       │
                                        │ service : règles métier    │
                                        │ repository : écrit le SQL  │
                                        └────────────────────────────┘
```

**Pourquoi pas des microservices ?** Plusieurs petits programmes séparés multiplient les pannes possibles et
la maintenance. Amazon Prime Video a lui-même regroupé un service pour réduire ses coûts de 90 %. Pour 1 000
utilisateurs, un seul programme bien découpé est plus simple, plus rapide à déboguer et moins cher. Et comme les
modules sont indépendants, on pourra en sortir un le jour où c'est nécessaire.

## 2. Plan du dossier `api/`

```
api/
├── src/
│   ├── main.ts                 Point d'entrée : démarre tout, arrête proprement. Aucune règle métier.
│   ├── app.ts                  Assemblage : middlewares + modules. Ajouter un module = une ligne ici.
│   ├── config/
│   │   └── env.ts              Lit et VALIDE la configuration. Seul fichier qui touche aux variables d'environnement.
│   ├── platform/               Le « socle technique » : utile à tous les modules, sans aucune règle métier.
│   │   ├── logger.ts           Journaux structurés (JSON).
│   │   ├── errors.ts           Erreurs « attendues » et leurs codes HTTP.
│   │   ├── http/               Middlewares (id de requête, journal d'accès, CORS, en-têtes) + gestion d'erreurs.
│   │   ├── database/           Connexion PostgreSQL et migrations.
│   │   └── storage/layout.ts   Plan de rangement des fichiers (vidéos, images, sous-titres).
│   └── modules/                Le « métier », un dossier par domaine.
│       ├── health/             Le service est-il vivant ?
│       ├── ops/                Disponibilité (/ready), supervision (/metrics), tableau de bord, entretien horaire (conservation des données).
│       ├── catalog/            Catalogue éditorial : fiches, saisons/épisodes, collections, thèmes, créateurs, visuels, recherche, administration.
│       ├── playback/           « Je veux regarder » → URL signée, ident, sous-titres.
│       ├── subtitles/          Pistes WebVTT (dépôt administrateur, distribution publique).
│       ├── privacy/            Droits RGPD : export des données d'un compte.
│       ├── media/              Jetons de lecture et distribution des fichiers HLS.
│       ├── ingest/             Envoi reprenable, file de tâches, encodage, contrôle qualité, publication.
│       ├── identity/           Comptes, sessions, droits, invitations, e-mail vérifié, double authentification (TOTP), journal d'audit.
│       ├── progress/           Reprise de lecture (« Reprendre »).
│       ├── mylist/             « Ma liste ».
│       ├── analytics/          Mesure de la qualité de lecture.
│       └── recommendation/     Similaires, tendances, « pour vous » — chaque proposition porte sa raison.
├── migrations/                 Évolutions de la base, en SQL numéroté (001_, 002_…).
├── scripts/                    Commandes d'administration : db:start, db:migrate, ingest.
└── tsconfig.json               Règles strictes de TypeScript (vérifiées par `npm run typecheck`).
```

### La règle de dépendance (la plus importante)

```
routes  ─▶  service  ─▶  repository  ─▶  base de données
   │            │             │
   └────────────┴─────────────┴──▶  platform/ (socle)
```
- Une **route** ne contient aucune règle métier : elle lit la requête, appelle un service, renvoie la réponse.
- Un **service** ne connaît ni HTTP ni SQL : il décide (« ce média est-il lisible ? »).
- Un **repository** est le seul à écrire du SQL.
- Un module **ne va jamais lire à l'intérieur d'un autre** : il passe par ce que l'autre expose.
- `platform/` ne dépend d'**aucun** module.
- Les modules ne forment **aucun cycle** : une dépendance va toujours « vers le bas » (ex. `playback → ingest`, jamais l'inverse).

Ces règles ne sont pas que des principes : `src/architecture.test.ts` les vérifie à chaque exécution des tests (socle indépendant,
aucun cycle, SQL uniquement dans les fichiers prévus), et `src/contract.test.ts` vérifie que `docs/API-CONTRACT.md` et les routes du code
sont identiques. Une entorse fait échouer la CI.

Pourquoi : si ces règles sont respectées, on peut changer la base, le CDN ou la façon de signer sans toucher aux routes,
et on peut tester chaque couche seule.

## 3. Le trajet d'une requête : « je veux regarder »

1. Le navigateur appelle `GET /api/programs/tout-recommencer/playback`.
2. **Middlewares** : un identifiant est attribué (`X-Request-Id`), la requête est journalisée, les en-têtes de sécurité
   et le CORS sont appliqués.
3. **`playback/routes.ts`** reçoit l'appel et le passe au service.
4. **`playback/service.ts`** demande au repository « ce média est-il prêt ? ». Si non : erreur `not_available`.
5. **`playback/repository.ts`** exécute le SQL.
6. Le service fabrique une URL **signée** (jeton valide 4 h, lié à ce média) et la renvoie.
7. Le lecteur télécharge ensuite les segments via **`media/routes.ts`**, qui revérifie le jeton à chaque fichier.
8. Si quelque chose échoue : une `AppError` est levée, le gestionnaire d'erreurs renvoie
   `{ "error": "...", "message": "...", "requestId": "..." }`. Le `requestId` permet de retrouver la requête dans les journaux.

## 4. Où vivent les vidéos, les images, les thèmes

### Les fichiers : rangés par TYPE puis par IDENTIFIANT

```
storage/
├── videos/
│   ├── sources/<playbackId>/     Vidéos d'origine (à SAUVEGARDER : elles ne se régénèrent pas)
│   └── hls/<playbackId>/         Rendus diffusés (master.m3u8, v0/, v1/…, poster.jpg, meta.json)
├── images/<slug>/                Affiches, fonds, logos-titres d'un programme
├── subtitles/<playbackId>/       Sous-titres WebVTT (fr.vtt, en.vtt…)
└── pgdata/                       Données PostgreSQL de développement
```

### Les thèmes, genres, collections : dans la BASE, jamais dans les dossiers

Tu as demandé des vidéos « selon les thématiques ». La bonne architecture sépare deux questions :

| Question | Où se trouve la réponse |
|---|---|
| **Où est le fichier ?** | Le dossier, déduit de l'identifiant (`videos/hls/<id>/`) |
| **De quoi ça parle ? Dans quelle catégorie ?** | La base de données (tables de thèmes et de liens) |

Si on rangeait les vidéos dans `foi/`, `famille/`, `pardon/`, une histoire qui parle de foi ET de pardon serait copiée
deux fois, et changer un thème obligerait à déplacer des fichiers. Avec la base, un programme appartient à plusieurs
thèmes sans être dupliqué, et un thème se modifie en une ligne.

## 5. La recommandation, par paliers

On n'invente pas d'« intelligence » avant d'avoir des données. Voir `modules/recommendation/README.md` :

1. **Éditorial** : sélections choisies par l'équipe, par thème (aucune donnée nécessaire). ✅ en place (repli « Sélection ORIGIN »).
2. **Règles** : thèmes proches de ce qu'on a terminé, tendances réelles. ✅ en place.
3. **Similarité** : « ceux qui ont vu X ont aussi vu Y » (quelques milliers d'utilisateurs actifs).
4. **Modèle appris** : hors périmètre à 1 000 utilisateurs.

Chaque recommandation expose sa **raison** (« parce que vous avez regardé… ») : c'est ce qui la rend explicable.

## 6. Principes de robustesse appliqués

| Principe | Où dans le code |
|---|---|
| **Échouer vite** : configuration invalide = démarrage refusé | `config/env.ts` |
| **Aucun secret dans le code**, aucun secret dans les journaux | `config/env.ts`, `platform/logger.ts`, `redactPath` |
| **Valider toute entrée extérieure** | identifiants (`isValidId`), chemins (`resolveInside`) |
| **Ne jamais sortir d'un dossier** | `platform/storage/layout.ts` + tests |
| **Erreurs cohérentes et traçables** | `platform/errors.ts`, `platform/http/error-handler.ts` |
| **Journaux structurés avec identifiant** | `platform/logger.ts`, `platform/http/middleware.ts` |
| **Arrêt propre** (finir les requêtes, fermer la base) | `main.ts` |
| **Base évolutive et versionnée** | `migrations/` |
| **Tests sur une base jetable** | `modules/playback/playback.test.ts` |

## 7. Comment ajouter une fonctionnalité (recette)

Exemple : « Ma liste ».
1. **Migration** : `migrations/00X_my_list.sql` (table + contraintes).
2. **Module** : `src/modules/my-list/` avec `repository.ts` (SQL), `service.ts` (règles), `routes.ts` (HTTP).
3. **Assemblage** : une ligne dans `src/app.ts`.
4. **Contrat** : documenter la route dans `docs/API-CONTRACT.md` AVANT de la déployer.
5. **Tests** : au minimum le cas nominal, le cas « non autorisé » et le cas « entrée invalide ».
6. `npm run typecheck && npm test`.

## 7 bis. Quand une couche « service » est-elle utile ?

Pas toujours. Le module `mylist` n'a que des lectures/écritures simples : `routes → repository` suffit.
Le module `progress` a des **règles** (terminé à 95 %, durée de référence côté serveur, position bornée) :
il a donc un `service.ts`. Règle pratique : dès qu'il y a une décision à prendre, elle va dans un service,
jamais dans une route ni dans du SQL.

## 7 ter. Le pipeline vidéo (module `ingest`), pas à pas

```
 envoi reprenable ──▶ fichier « source » ──▶ tâche en file ──▶ travailleur ──▶ contrôle ──▶ publication ──▶ lisible
 (tus, /uploads)       videos/sources/…       (table media_jobs)  (processus     qualité      (déplacement    (media_assets
                                                                   séparé)                     atomique)       « ready »)
```

Trois idées à retenir :

1. **Le travailleur est un processus séparé de l'API** (`npm run worker`). Un encodage de plusieurs heures ne
   ralentit jamais les spectateurs, et redémarrer l'API n'interrompt pas l'encodage.
2. **La file est dans PostgreSQL, avec un « bail »** : un travailleur réserve une tâche pour 90 s et la renouvelle.
   S'il disparaît, le bail expire et un autre la reprend. `FOR UPDATE SKIP LOCKED` empêche deux travailleurs
   de prendre la même tâche.
3. **Rien n'est visible avant la fin** : l'encodage se fait dans `videos/work/<tâche>/`, est contrôlé, puis déplacé
   d'un bloc dans `videos/hls/`. Un échec ne peut donc jamais publier une vidéo incomplète.

Reprise : l'encodage se fait **qualité par qualité** ; chaque qualité terminée et validée est un point de reprise.
Après une panne, on repart à la qualité suivante (on perd au plus une qualité, pas tout le film).

## 7 quater. La diffusion : origine ou CDN

Un seul point de bascule : `DELIVERY_MODE`.

| | `origin` (développement) | `bunny` (production) |
|---|---|---|
| Qui sert les fichiers | Notre API (`/media/...`) | Le CDN Bunny |
| Qui vérifie l'autorisation | Notre API (jeton signé) | Le CDN lui-même (jeton de répertoire) |
| Où le travailleur publie | Déplacement de dossier | Envoi vers Bunny Storage |
| Ce qui change dans le code | Rien : `DeliverySigner` et `MediaStore` sont des interfaces | |

Chaque publication a son **dossier versionné** (`hls/<id>/<version>/`) : on n'écrase jamais, donc cache long et retour arrière possibles.

## 7 quinquies. Sauvegardes : pourquoi « logiques » et pas un simple dossier

Copier le dossier de la base pendant qu'elle tourne donne une copie incohérente. On lit donc la base dans une
**transaction instantanée** (cohérente même si l'application écrit en même temps), table par table, en CSV compressé et
chiffré, avec une empreinte par fichier. La **structure** vient des migrations (source de vérité unique) : la sauvegarde ne
contient que les données, ce qui la rend lisible, vérifiable et indépendante de la version de PostgreSQL.
Principe d'or : **une sauvegarde qu'on n'a jamais restaurée n'existe pas** : `npm run backup:verify` la restaure pour de vrai
dans un schéma temporaire et compare chaque nombre de lignes.

## 7 sexies. L'ident de marque

C'est un média comme un autre (même pipeline, même diffusion CDN, même signature), publié avec `--kind brand` sous l'identifiant
`origin-ident` : il n'apparaît jamais au catalogue. La décision « faut-il le jouer ? » est une **règle métier** isolée dans
`modules/playback/ident-policy.ts` (fonction pure, testée sans base) ; le service de lecture la nourrit avec l'historique du compte,
et l'API renvoie simplement `ident.show`. Changer la règle (« une fois par saison », « toujours », « jamais ») = une variable
d'environnement (`IDENT_POLICY`), sans toucher au front.

Publier ou remplacer l'ident :
```bash
npm run media:enqueue -- /chemin/ident.mp4 --id origin-ident --kind brand --title "Ident ORIGIN"
```

## 8. Commandes

```bash
npm run db:start     # PostgreSQL local (127.0.0.1:5433)
npm run dev          # API (127.0.0.1:4000), redémarre à chaque modification
npm run typecheck    # vérification stricte des types
npm test             # tests (base jetable)
npm run worker       # travailleur d'encodage (processus séparé)
npm run media:enqueue -- /chemin/film.mp4 --id mon-film --kind film --title "Mon film"
```

## 9. Glossaire

| Mot | Sens |
|---|---|
| **Module** | Un domaine métier autonome (catalogue, lecture, comptes…) |
| **Repository** | Le seul code qui écrit du SQL |
| **Service** | Les règles métier, sans HTTP ni SQL |
| **Middleware** | Fonction exécutée avant/après chaque requête |
| **Migration** | Fichier SQL qui fait évoluer la base de façon versionnée |
| **HLS** | Format de diffusion vidéo en petits segments, adapté au réseau du spectateur |
| **CDN** | Réseau de serveurs proches des spectateurs qui diffusent les fichiers |
| **Origine** | Le serveur qui fournit les fichiers au CDN |
| **Jeton signé** | Autorisation temporaire infalsifiable, liée à un média |
| **Idempotent** | Qu'on peut rejouer sans effet secondaire (envois répétés, reprises) |
