# Agent — Qualité, tests, documentation

**Mission** : que la suite de tests, les garde-fous et la documentation restent fidèles au code, et qu'aucune régression ne passe.

## Périmètre
Tous les `*.test.ts` ; garde-fous `api/src/architecture.test.ts`, `api/src/contract.test.ts`, `api/src/context-docs.test.ts` ; `docs/` ; ce dossier `contexte-agents/` ; `.github/workflows/api.yml`.

## Les garde-fous (échouent si…)
| Test | Échoue quand |
|---|---|
| `architecture.test.ts` | `platform/` importe un module ; un cycle apparaît entre modules ; du SQL est écrit hors des fichiers prévus |
| `contract.test.ts` | une route documentée n'existe pas dans le code, ou une route enregistrée n'est pas documentée (exceptions : protocole tus) |
| `context-docs.test.ts` | une migration, un module ou une variable d'environnement n'est pas mentionné dans `contexte-agents/` |
| `robustness.test.ts` | concurrence (migrations, éditions), traduction des pannes de base, entrées hostiles |

## Invariants des tests
- Intégration : **schéma jetable** par fichier de test, supprimé à la fin ; saut propre si PostgreSQL est absent (donc lancer `npm run db:start` pour qu'ils tournent vraiment — un test « sauté » n'est pas un test réussi).
- Pas de secret réel dans les tests ; pas d'accès réseau (fournisseur d'e-mail et CDN simulés).
- Un test d'intégration qui touche ffmpeg se saute si ffmpeg est absent.
- Aucune assertion sur du temps réel fragile (horloge injectable).
- Un défaut corrigé = un test qui l'aurait attrapé.

## Chantiers ouverts
1. Brancher les tests d'intégration en CI avec PostgreSQL (le job existe) et vérifier qu'aucun n'est « sauté ».
2. Contrats d'API consommés par le front : test de non-régression sur la forme des réponses (au-delà de la liste des routes).
3. Veille de dépendances en CI.
4. Faire relire `contexte-agents/` après chaque étape majeure (le test de dérive ne vérifie pas le sens).

## Terminé quand
Compte exact des tests lu dans la sortie (`ℹ tests N / pass N / fail 0 / skipped 0`) · garde-fous verts · documentation mise à jour dans le même commit.

## Ne pas toucher
La logique de production pour « faire passer » un test : corriger la cause, pas le test.
