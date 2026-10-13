**Titre** : Fiabilise le parcours de lecture (mission B)

**Base** : `front/sync-lovable` · **Branche** : `front/fiabilite-lecture`

## Contenu

| Sujet | Changement |
|---|---|
| Lien expiré | `expiresAt` est lu : nouveau lien avant l'ouverture du lecteur, à la reprise après pause, et sur 403 (une seule fois), avec reprise à la position courante |
| Réseau | 3 reprises à délais croissants puis échec explicite avec « Réessayer » ; reprise automatique au retour de la connexion |
| Lecture native (Safari/iOS) | Écouteur d'erreur ajouté, même politique de reprise |
| Poids | hls.js chargé à la demande : page programme 580 Ko → 28 Ko (chunk hls séparé de 561 Ko) |
| Plein écran | Sur le lecteur (pas la page), repli iPhone `webkitEnterFullscreen`, verrou paysage si possible |
| Focus / clavier | Piège de focus dans la modale, focus suivant l'état et restitué à la fermeture, Espace/Entrée natifs sur les boutons, volume ↑/↓, annonces lecture/pause |
| Messages | Indisponible (404) ≠ panne ; « Service momentanément indisponible » ; non configuré ; perte de connexion ; `VITE_SUPPORT_EMAIL` |
| Debug | `?debug` : durée API, manifeste, 1re image, qualité |
| Client API | Délai de 10 s, validation de la réponse, pas de repli localhost en production |
| Config | `.env.example`, `src/lib/env.ts` |

## Vérifications

- `tsc --noEmit` : 0 erreur · `bun run test` : 23 / 23 (19 nouveaux) · `bun run build` : OK
- Navigateur + API locale : démarrage 324 ms jusqu'à la 1re image ; expiration simulée → 1 appel `/playback`, reprise à la bonne position

## Limites / à valider

- Non testé sur iPhone / Safari réel (plein écran, orientation, lecture native).
- Erreur réseau au milieu d'une lecture et 403 sur segment réel : couverts par tests de politique, pas bout en bout.
- Si le renouvellement du lien échoue, l'écran d'erreur ferme le lecteur (position perdue).
- Fichiers touchés au style des fichiers voisins (guillemets simples) : Prettier global toujours en attente de décision.

Aucun changement du design validé ni du contrat d'API.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
