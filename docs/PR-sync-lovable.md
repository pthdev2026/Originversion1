**Titre** : Fusionne les 36 commits Lovable dans la lecture réelle

**Base** : `integration/lovable-design-video` · **Branche** : `front/sync-lovable`

## Contenu

Récupère les changements poussés par Lovable sur `main` (11 → 13/10, `c5dd0a3..fc0eaf5`, 36 commits, 15 fichiers) dans la branche qui porte la lecture HLS réelle.

- Statut des épisodes : « Déjà vu / En cours / À regarder », barre de progression, minutes restantes (`episode-progress.ts`, `episode-watch-status.tsx`).
- Retouches visuelles : contour de sélection, boutons (cadre, survol), vignettes PTH, page Dune, titre et bouton de la Hero.
- `cardStyle` des collections, balises `og:image` / `twitter:image` de la page programme.
- Inclut le commit local `b587f34` (« Deux fois oui » jouable depuis la Hero), jusqu'ici non poussé.

## Conflits résolus (2)

| Fichier | Résolution |
|---|---|
| `src/lib/productions.ts` | Les deux imports sont conservés (`origin-programs`, `episode-progress`) |
| `src/styles.css` | Styles du lecteur HLS et retouches Lovable, indépendants, conservés tous les deux |

## Vérifications

- `bunx tsc --noEmit` : 0 erreur
- `bun run test` : 8 / 8
- `bun run build` : OK
- Lecture réelle conservée (`fetchPlayback`, `useHls`, prop `slug` dans la route)
- Rendu visuel : **non vérifié dans un navigateur**, à relire

## À valider

- Le bouton « Marquer comme vu » de Lovable est un état local de session : il simule un historique, ce que le brief front interdit. Conservé tel quel dans cette PR ; décision à prendre.
- L'intro « Prisme » (`feature/origin-intro`) n'est pas incluse.

## Sans effet sur

`main` et la synchronisation Lovable : cette PR cible la branche d'intégration. Aucun force push ni réécriture d'historique.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
