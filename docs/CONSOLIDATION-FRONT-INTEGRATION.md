# Consolidation du front : procédure sûre (30/10/2026)

## État des branches (dépôt front `app/`)
| Branche | Tip | Contenu |
|---|---|---|
| `front/hero-immersive` | `666af6b` | travail de l'agent front (direction artistique mobile, nouveau lecteur, adaptatif) — aucun travail non commité au moment de la vérification |
| `integration/backend-hero` | `43fb5ca` | **contient intégralement** `666af6b` + l'intégration réelle (jalons 1 à 3) |

**Vérifié par `git merge-base --is-ancestor front/hero-immersive integration/backend-hero` → vrai** : la branche de l'agent front est un **ancêtre** de la branche d'intégration. La reprise se fait donc **en avance rapide**, sans conflit et sans risque d'écraser quoi que ce soit, **tant que l'agent front n'a pas ajouté de nouveaux commits**.

## Ce qui a déjà été fusionné (dans MA branche, jamais dans la sienne)
Deux fusions de `front/hero-immersive` vers `integration/backend-hero` ont eu lieu. La seconde a produit **3 conflits purement additifs**, résolus en gardant les deux côtés : `playback-experience.tsx` (imports du lecteur), `origin-api.ts` (`parseSubtitles` de l'agent front + `parseResume`), `styles.css` (règles du lecteur + règle « Ma liste » desktop). Tous ses fichiers visuels (menu, barre mobile, PTH Originals, adaptatif/teintes, nouveau lecteur) sont **conservés** ; vérifié par la compilation, 51 tests et un essai navigateur du nouveau lecteur.

## Procédure pour l'agent front (à exécuter dans `app/`)
1. **Commiter ou mettre de côté** tout travail en cours (`git status` doit être propre).
2. `git fetch` n'est pas nécessaire (même dépôt). Vérifier : `git merge-base --is-ancestor front/hero-immersive integration/backend-hero && echo "avance rapide possible"`.
3. **Cas A — avance rapide possible** : `git merge --ff-only integration/backend-hero`.
4. **Cas B — l'agent front a commité entre-temps** : `git merge integration/backend-hero`. Conflits attendus uniquement là où les deux côtés ont touché : `styles.css`, `playback-experience.tsx`, `origin-api.ts`, `origin-hero.tsx`, `program-page.tsx`. **Règle : garder les deux côtés** (les changements de l'intégration sont additifs) ; me demander la résolution si un doute subsiste.
5. Contrôles : `npx tsc --noEmit -p tsconfig.json` (aucune erreur) · `npx vitest run` (**51 tests**, 0 échec).
6. Recette navigateur : `cd api && scripts/recette/start.sh` puis, dans `app/`, `VITE_API_URL=http://localhost:4020 npx vite dev --port 3211 --host localhost` ; parcours : inscription → Hero « Ma liste » (mobile **et** ordinateur) → lecteur → pause → `/continuer` → reprise → déconnexion/reconnexion → second compte vide. Arrêt : `scripts/recette/stop.sh`.
7. Ne **pas** pousser vers GitHub/Lovable avant l'accord du propriétaire (la branche est locale).

## Points de vigilance visuelle à regarder à l'œil
- Hero ordinateur : le bouton « Ma liste » (3ᵉ bouton, gabarit « Voir la bande-annonce »).
- `/continuer` et `/ma-liste` : données réelles (la page « Continuer » n'affiche plus de démonstration).
- Compte › Confidentialité : champ « mot de passe » ajouté à la suppression de compte.

## Ce que je ne fais pas
Je ne fusionne **pas** dans `front/hero-immersive` et je ne touche pas à son dossier de travail : c'est à l'agent front (ou au propriétaire) de l'exécuter, avec la procédure ci-dessus.
