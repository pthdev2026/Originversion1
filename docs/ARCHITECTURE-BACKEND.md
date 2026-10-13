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
│       ├── catalog/            Quels programmes sont lisibles ?
│       ├── playback/           « Je veux regarder » → URL signée.
│       ├── media/              Jetons de lecture et distribution des fichiers HLS.
│       ├── ingest/             Inscrire un média encodé en base.
│       ├── identity/           Comptes, sessions, droits, invitations, journal d'audit.
│       ├── recommendation/     (à construire) que proposer à cette personne ?
│       └── analytics/          (à construire) mesure de la qualité de lecture.
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

1. **Éditorial** : sélections choisies par l'équipe, par thème (aucune donnée nécessaire).
2. **Règles** : thèmes proches de ce qu'on a terminé, nouveautés, popularité récente.
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

## 8. Commandes

```bash
npm run db:start     # PostgreSQL local (127.0.0.1:5433)
npm run dev          # API (127.0.0.1:4000), redémarre à chaque modification
npm run typecheck    # vérification stricte des types
npm test             # tests (base jetable)
npm run ingest -- <playbackId> --kind film --title "Titre"
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
