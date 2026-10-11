# Pull request — texte à coller

Lien de création :
https://github.com/pthdev2026/hero-stream-magic/pull/new/integration/lovable-design-video

## Titre

Lecture vidéo HLS réelle dans le lecteur ORIGIN

## Description

## Résumé
Branche la lecture vidéo réelle dans l'expérience de lecture existante de Lovable, sans modifier le design de la page programme, et rapatrie les images hébergées par Lovable.

## Changements
- `PlaybackExperience` interroge l'API de lecture au lieu des minuteurs de démonstration
- `PlayerShell` lit le flux HLS via hls.js (natif sous Safari) : lecture/pause, progression cliquable, volume, plein écran, choix de qualité, raccourcis clavier, masquage des contrôles après 3 s
- Programme sans vidéo : message « pas encore disponible à la lecture »
- Retrait du lien « Simuler une erreur (démo) » et du lecteur factice
- Ajout de `hls.js` (`package.json` + `bun.lock`), `src/lib/origin-api.ts`, `src/lib/use-hls.ts`
- Rapatrie les 13 images hébergées par Lovable (pointeurs `.asset.json`, URLs `/__l5e/...`) dans `src/assets` : le dépôt ne dépend plus du stockage Lovable

## À savoir
- Nécessite l'API ORIGIN (`VITE_API_URL`, par défaut `http://127.0.0.1:4000`). Sans elle, le clic sur « Regarder » affiche « Service momentanément indisponible »
- Vérifié en local : film avec vidéo (lecture 480p auto), film sans vidéo (message), 84 images chargées sans erreur, types sans erreur, 4 tests passent
- Ne fusionner qu'une fois l'API accessible depuis l'aperçu Lovable

🤖 Generated with [Claude Code](https://claude.com/claude-code)
