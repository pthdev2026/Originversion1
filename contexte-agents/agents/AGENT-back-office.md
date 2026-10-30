# Agent — Back-office (outil d'administration)

**Mission** : construire l'application web réservée au propriétaire pour créer des programmes, envoyer des vidéos, suivre leur préparation, les publier, organiser l'accueil et observer la performance. **Cahier des charges : `docs/CAHIER-DES-CHARGES-BACK-OFFICE.md`** (écrans, routes, critères d'acceptation). Prompt : `docs/PROMPT-AGENT-BACK-OFFICE.md`.

## Périmètre
Dossier **`~/Desktop/ORIGIN-back-office/`** (dépôt Git séparé, application à part, **non reliée à Lovable**, adresse `admin.origin.xxx`). Il ne contient aucun code de l'API : il lui parle par `VITE_API_URL`. Il **consomme** l'API ; il n'implémente aucune règle métier.

## Invariants
- La sécurité est **côté API** (rôle `admin`, 2FA si `REQUIRE_ADMIN_2FA=true`) ; l'interface n'est jamais la serrure.
- Cookie de session `httpOnly` uniquement (`credentials: 'include'`) ; aucun jeton en `localStorage`.
- Même domaine principal que l'API (cookie) ; son origine doit figurer dans `CORS_ORIGINS`.
- Un nouveau programme est **toujours créé en brouillon** ; la publication est un geste séparé.
- L'identifiant d'un programme ne change plus après création ; l'identifiant de lecture d'un épisode est `<slug>-<clé>`.
- L'envoi de fichiers passe par tus sous `/uploads/*` ; les petits dépôts annexes (sous-titres, images) sous `/files/*`.
- Jamais d'état simulé affiché ; toute erreur de l'API est expliquée avec son `message` et son `requestId`.

## Qui fait quoi
| Sujet | Propriétaire |
|---|---|
| Écrans, ergonomie, tests de l'interface | Agent back-office |
| Routes et règles (`api/`) | Agent back-end — **livrés** : B1 (envoi d'images), B2 (fiche admin), B4 (filtre des tâches) ; **à venir** : B3 (journal), B5 (Mux) |
| Configuration serveur (CORS, sous-domaine, restriction par IP) | Agent exploitation |
| Demandes de nouvelles routes | `docs/API-REQUESTS.md` |

## Chantiers ouverts
Phase 1 (connexion/2FA, catalogue, fiche, envoi, suivi, publication) → Phase 2 (accueil, thématiques, créateurs, images, sous-titres, invitations) → Phase 3 (tableau de bord, journal, comptes). Voie vidéo (Bunny ou Mux) : n'influe pas sur les écrans, mais l'étape d'envoi devra être adaptable.

## Terminé quand
Les critères d'acceptation du cahier des charges §11 sont démontrés ; types, tests et construction verts ; captures et liste « fait / limité / non fait » remises au propriétaire.

## Ne pas toucher
`api/` (back-end), `app/` (site public), l'infrastructure. Ne rien écrire dans `ORIGIN-plateforme/` (seul dossier de l'API et du projet).
