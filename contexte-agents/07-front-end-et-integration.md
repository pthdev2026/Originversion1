# 07 — Front-end et intégration

Vérifié le : 30/10/2026 (d'après l'historique git du dépôt `app/`, branche `front/comptes-securite`, dernier commit du 21/10/2026) · Sources : `docs/BRIEF-AGENT-FRONT.md`, `docs/PLAN-COMPTES-FRONT.md`, `docs/PR-CHAINE.md`, `docs/API-REQUESTS.md`, `docs/FRONT-DIAGNOSTIC-2026-10-13.md`

**Le front est le périmètre d'un autre agent.** L'agent back-end ne modifie jamais le code d'`app/` (sauf mandat explicite du propriétaire). Cette fiche sert à comprendre ce que le front attend et fait.

## 1. Le dépôt front
| Élément | Valeur |
|---|---|
| Dépôt | `git@github.com:pthdev2026/hero-stream-magic.git` (compte `pthdev2026`), cloné dans `ORIGIN-plateforme/app/` — **dépôt Git séparé** de la racine |
| Pile | TanStack Start (React 19) + TanStack Router/Query, Vite, Tailwind v4, Radix/shadcn, TypeScript, Vitest ; lecteur `hls.js` ; gestionnaire de paquets **bun** (`bun.lock` fait foi) |
| Lovable | Relié à `main` : tout ce qui est poussé sur `main` se synchronise dans Lovable |
| Règles impératives | Jamais de push sur `main` sans validation du propriétaire ; **jamais réécrire l'historique** (pas de force-push/rebase/amend sur du publié) ; branches `front/<sujet>` + PR ; pas d'images en stockage Lovable (`*.asset.json`) ; pas de second gestionnaire de paquets |
| Contrôles avant fusion | `bunx tsc --noEmit`, `bun run test`, `bun run build` |
| Variables | `VITE_API_URL`, `VITE_SITE_URL`, `VITE_APP_ENV`, `VITE_ENABLE_INTRO`, `VITE_SUPPORT_EMAIL` (jamais de secret côté front) |

## 2. Qui fait quoi
| Sujet | Propriétaire | Règle |
|---|---|---|
| API, base, pipeline, infrastructure | Back-end | Le front n'y touche pas |
| Interface, DA, motion, accessibilité | Front | Le back-end n'y touche pas |
| `docs/API-CONTRACT.md` | Back-end | Toute évolution y est annoncée avant déploiement |
| `docs/API-REQUESTS.md` | Front écrit, back-end répond | **Seul canal** pour demander un changement d'API |
| Fusion dans `main` | Propriétaire | Aucune fusion sans sa validation |

## 2 bis. ⚠️ Deux lignes de front (constat du 30/10/2026)
Le nouveau front **« Millenium »** (Lovable + refonte du 30/10, branches `front/millenium-base`, `front/page-film-reco`) **n'est branché sur aucune route** : comptes, liste, progression, appareils, préférences y sont des données de démonstration du navigateur, et il n'y a **aucun lecteur vidéo**. Le branchement existe sur la ligne `front/comptes-securite` (21/10), non fusionnée. Détail et inventaire complet : `docs/ANALYSE-FRONT-VS-BACKEND-2026-10-30.md`. Ne pas se fier au tableau ci-dessous pour la ligne Millenium.

## 3. État du branchement du front sur l'API (ligne connectée, au 21/10/2026)
| Fonction | État côté front | Route(s) |
|---|---|---|
| Lecture HLS (états chargement/indisponible/erreur/expiré) | ✅ en place | `GET /api/programs/:id/playback` |
| Client du catalogue, accueil alimenté par l'API (repli local conservé) | ✅ branche `front/catalogue-accueil` | `/api/home` |
| Fiche programme (saisons, épisodes, `playbackId`, `playable`) | ✅ `front/catalogue-programme` | `/api/programs/:slug` |
| Recherche, « dans le même esprit » | ✅ `front/catalogue-recherche` | `/api/search`, `/similar` |
| Comptes : connexion, inscription, déconnexion, mot de passe oublié, réinitialisation, profil, e-mail, export | ✅ `front/comptes-socle`, `front/comptes-securite` (C1, C2) | `/api/auth/*`, `/api/me*` |
| « Pour vous » / recommandations | 🟡 client écrit, affichage à confirmer | `/api/recommendations` |
| Double authentification (écrans) | ❌ aucune trace dans le code front | `/api/me/2fa/*` |
| Reprise de lecture, « Ma liste » réels, état « Vu » | ❌ pas encore branchés | `/api/me/progress/*`, `/api/me/list/*` |
| Ident ORIGIN (lecteur à deux vidéos) | ❌ non branché | `playback.ident` |
| Mesure de lecture anonyme (id + `token` à reprendre de `analytics` dans la réponse de lecture, contrat v1.15) | ✅ branché sur `consolidation/millenium` (non publié) — `playback-stats.ts` | `POST /api/playback-sessions` |
| Sous-titres (`<track>`) | ❌ non branchés | `playback.subtitles` |
| Pages `/reinitialiser`, `/verifier-email` | 🟡 à vérifier (le lien d'e-mail y pointe) | — |

À revérifier avant de s'y fier : `git -C app log` et `grep` des routes dans `app/src/lib/`.

## 4. Demandes du front en attente de réponse du back-end (`docs/API-REQUESTS.md`)
| Date | Demande | Statut au 30/10 |
|---|---|---|
| 16/10 | `GET /api/me/list` doit renvoyer des `ProgramCard` (`{items:[{slug, addedAt, program}]}`) pour éviter N appels | ✅ **Traitée le 30/10** (contrat v1.2 ; `program` = fiche ou `null`) |
| 16/10 | Route de progression de **tous les épisodes d'un programme** (`GET /api/me/progress?program=<slug>`) pour l'état « Reprendre/Vu » | ✅ **Traitée le 30/10** (contrat v1.2 ; terminés inclus) |
| 16/10 | Confirmer `CORS_ORIGINS` ∋ `http://localhost:3210` et API en `http://localhost:4000` (cookie : même site `localhost`) | ✅ Confirmé le 30/10 |
> Les trois demandes sont closes. Le front peut brancher « Ma liste » (rail avec fiches) et l'état « Vu » par épisode. Vérifier `docs/API-REQUESTS.md` avant chaque session pour de nouvelles demandes.

## 5. Contraintes du front que le back-end doit respecter
- **Même site** pour le cookie : en local `http://localhost:3210` ↔ `http://localhost:4000` (pas `127.0.0.1`) ; en production `origin.example` ↔ `api.origin.example`.
- `credentials: 'include'` sur les appels de compte ; le catalogue public reste sans cookie (cache).
- Le front ne lit/écrit jamais le cookie de session ; il ne construit jamais une URL de lecture ; il ne recalcule jamais la règle d'ident, de reprise, de `playable`, de `personalized`.
- Les fichiers `src/lib/origin-*.ts` du front sont le **repli** de démonstration quand l'API est absente (`isDemo: true`). Ils sont exportables : `npm run catalog:export-front`.
- Chaque état doit être explicite côté API pour que le front l'affiche honnêtement (chargement, indisponible ≠ erreur, expiré, verrouillé, 2FA requise).

## 6. Maquettes et design
Référence : `docs/DESIGN.md` (système de design tel qu'implémenté, mis à jour le 14/10), `maquettes/` (à remplir), `assets/`. Un bloc de recommandation (titre, durée, synopsis, boutons Accueil/Retour/Recommandation) est spécifié en `DESIGN.md` §6.9 ; la maquette visuelle n'a pas été produite (image d'inspiration jamais fournie).
