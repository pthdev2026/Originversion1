# ORIGIN — plateforme de streaming PTH

> Les histoires méritent plus qu'un écran.

Dossier de travail **local** du projet ORIGIN (source de vérité).

## Structure

| Dossier | Contenu |
|---|---|
| `docs/` | Contexte, décisions validées, audits, notes de mission |
| `maquettes/` | Maquettes finales (Hero, Top 10, Ce qui pourrait vous plaire, À découvrir…) |
| `assets/logos/` | Logo ORIGIN, logos-titres des productions |
| `assets/visuels/` | Visuels Hero et photographies |
| `assets/affiches/` | Affiches verticales et horizontales |
| `app/` | Front React (dépôt Git à part, relié à Lovable) |
| `api/` | API locale : autorisation de lecture, distribution HLS |
| `video-pipeline/` | Encodage FFmpeg → HLS multi-débits |
| `storage/` | Rendus vidéo générés (non versionné) |

## Répartition

- **Lovable** : conception et développement front-end
- **GitHub** : synchronisation et versionnage du code
- **Claude Code** : backend, intégration technique
- **Ce dossier** : source de vérité locale

## Méthode

Compréhension → analyse critique → recommandations → validation → exécution → contrôle qualité → livraison.
Rien n'est modifié sur une composition validée sans accord.

## GitHub

Dépôt : `git@github.com:pthdev2026/hero-stream-magic.git` (branche `main`, cloné dans `app/` via clé SSH)
Compte GitHub : `pthdev2026`
⚠️ Dépôt relié à Lovable : ne jamais réécrire l'historique (force push, rebase, amend).
Projet Lovable de référence : https://hero-stream-magic.lovable.app/
