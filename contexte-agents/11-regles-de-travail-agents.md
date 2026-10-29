# 11 — Règles de travail des agents

Vérifié le : 30/10/2026 · Sources : `docs/BRIEF-AGENT-FRONT.md` §7–8, `docs/ARCHITECTURE-BACKEND.md` §7, mémoire de méthode du projet, pratique des commits `git log`

## 1. Valeurs non négociables
1. **Honnêteté** : ne jamais simuler une fonction, un chiffre, une personnalisation (voir `02-…` §4). Un état inconnu se dit « inconnu ».
2. **Mesurer avant d'affirmer** : tout seuil d'échelle renvoie à une mesure datée (`docs/TEST-DE-CHARGE.md`). Une estimation sans mesure s'écrit « estimation ».
3. **Plan avant décision structurante** : pour une décision d'architecture, de données exposées ou artistique, reformuler la demande → signaler risques et impacts → proposer → **attendre la validation du propriétaire** → exécuter. (Le propriétaire peut accorder un « mode automatique » explicite pour un périmètre ; ne pas l'étendre de soi-même.)
4. **Ne jamais toucher au périmètre de l'autre agent** (front ↔ back). Les demandes passent par `docs/API-REQUESTS.md`.
5. **Ne rien détruire sans regarder** : avant de supprimer/écraser, lire la cible. Pas de `--force`, pas de réécriture d'historique publié, pas de push sur `main`.
6. **Le propriétaire apprend** : expliquer en français simple, définir chaque terme technique, donner l'analogie ; résumer d'abord, détailler ensuite.

## 2. Conventions de code
| Sujet | Règle |
|---|---|
| Langue | Français : commentaires (expliquer le *pourquoi*), messages d'erreur, documentation, noms de tests. Identifiants de code en anglais usuel ou français cohérent avec le module |
| Style | Imiter l'existant (densité de commentaires, nommage). Modules petits, un fichier = un rôle |
| Types | TypeScript strict ; `npm run typecheck` sans erreur |
| Validation | `zod` aux frontières (config, corps de requêtes, documents d'administration) ; `strict()` pour les documents |
| SQL | Uniquement dans les fichiers autorisés (voir `03-…` §3) ; paramètres liés, jamais de concaténation ; `Executor` pour fonctions utilisables en transaction |
| Erreurs | `AppError` / fabriques `errors.*` ; jamais d'exception brute pour un cas attendu |
| Secrets | Jamais dans le code, les tests (sauf valeurs factices), les journaux, les réponses |
| Dépendances | Éviter d'en ajouter ; si nécessaire, justifier (le projet fonctionne avec 5 dépendances d'exécution) |
| Migrations | Nouvelle migration numérotée, additive, jamais de modification d'une migration appliquée (voir `04-…` §1) |
| Comptes/chemins | Tout chemin de fichier dérivé d'une entrée passe par `resolveInside` / `isValidId` |

## 3. Cycle de travail (définition de « terminé »)
Une tâche est terminée **seulement si** :
1. `npm run typecheck` : 0 erreur.
2. `npm test` : tous verts (compter ; ne pas affirmer sans avoir lu la sortie). Les tests d'intégration créent un schéma jetable et se sautent si PostgreSQL est absent — lancer `npm run db:start` pour qu'ils s'exécutent réellement.
3. Des **tests nouveaux** couvrent le comportement (cas nominal + cas hostile/limite + concurrence si pertinent).
4. La **documentation est à jour dans le même commit** : `docs/API-CONTRACT.md` (si route), `docs/DECISIONS.md` (si décision), README du module, ce dossier (fiches concernées + « Vérifié le »), `.env.example` / `deploy/.env.production.example` (si variable).
5. Les garde-fous passent : `architecture.test.ts`, `contract.test.ts`, `context-docs.test.ts`.
6. Vérification **réelle** quand c'est possible (démarrer l'API sur la base de développement, appeler la route, lire la réponse) — pas seulement les tests.
7. Compte rendu honnête au propriétaire : ce qui est fait, vérifié, limité, **non fait**.

## 4. Commits
- Un commit = une intention claire ; message en français : `Sujet: ce qui change (effet mesuré si pertinent)`.
- Terminer par la ligne d'attribution demandée par l'environnement (`Co-Authored-By: …`).
- Dépôt racine `ORIGIN-plateforme/` : branche `main` locale. Dépôt front `app/` : séparé, branches `front/*`.
- Ne jamais committer : `.env`, `deploy/.env.production`, `storage/`, `node_modules`.

## 5. Recette : ajouter une fonctionnalité back-end
1. Lire la fiche `agents/` du compartiment et `03-…` (règles de dépendance).
2. Décider du module propriétaire ; si nouveau module : `routes.ts` (+ `service.ts` s'il y a une règle métier) + `repository.ts` + `README.md` + tests ; une ligne dans `app.ts`.
3. Table(s) : nouvelle migration (contraintes en base).
4. Route : validation `zod`, erreurs normalisées, droits (`requireUser`/`requireAdmin`), cache (`no-store` par défaut), limites de débit.
5. Tests (nominal, hostile, concurrence), documentation (voir §3), vérification réelle.
6. Si le front est concerné : annoncer dans le contrat et, si besoin, répondre/ouvrir dans `docs/API-REQUESTS.md`.

## 6. Commandes essentielles (dossier `api/`)
| But | Commande |
|---|---|
| Démarrer PostgreSQL local (port 5433) | `npm run db:start` (laisser tourner) |
| Démarrer l'API (port 4000, rechargement auto) | `npm run dev` |
| Typage / tests | `npm run typecheck` · `npm test` (un fichier : `node --test src/chemin/fichier.test.ts`) |
| Migrations | `npm run db:migrate` (aussi appliquées au démarrage de l'API) |
| Créer un administrateur | `npm run user:create-admin` |
| Encodage | `npm run worker` · `npm run media:enqueue` |
| Catalogue | `npm run catalog:import -- seed/catalog-demo.json` · `npm run catalog:export-front -- --copy` |
| Sauvegarde | `npm run backup` · `npm run backup:verify` |
| Charge | `npm run load:prepare -- --users 1000 --catalog 500` puis `npm run load:run -- --scenario browse|api|startup|origin` (base dédiée `origin_load`, API sur le port 4100) |
Environnement : Node ≥ 24.7. FFmpeg : `FFMPEG_PATH` (sur le poste de développement : `~/Library/Application Support/AutoCut/ffmpeg/ffmpeg`).

## 7. Pièges déjà rencontrés (à ne pas refaire)
- Un test de charge mal configuré : mauvais nom de cookie en production (`__Host-origin_session`) → 401 massifs ; générateur sur la même machine fausse l'origine.
- `new Response(body, {status: 204})` lève une exception : renvoyer `c.body(null, 204)`.
- Hono ne dispatche pas `routes.on('HEAD')` : utiliser `routes.get` pour tus.
- `/uploads/*` appartient à tus (renvoie 412 sans `Tus-Resumable`) : autre dépôt de fichier → `/files/*`.
- `CREATE TABLE IF NOT EXISTS` concurrent échoue sur le catalogue interne de PostgreSQL : sérialiser par verrou.
- Un tableau passé en paramètre JSON doit être typé `::text::jsonb` avec le pilote `postgres` (sinon double encodage).
- Une affirmation d'échelle (« 5 000 titres ») posée sans mesure s'est révélée fausse (27,7 % d'échecs).
- Utiliser `localhost` (pas `127.0.0.1`) en local, sinon le cookie de session n'est pas transmis.
- L'encodage ne doit jamais écraser un titre éditorial existant ; les brouillons ne sont jamais publics.
