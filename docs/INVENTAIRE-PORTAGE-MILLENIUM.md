# Inventaire — ce que nous avons fait et qui n'est pas dans la version du 30/10 (« Millenium »)

Base adoptée : `origin/main` `4862909` (30/10/2026 01:55), branche locale `front/millenium-base` (copie fidèle, aucun commit ajouté).
État de la base brute : `tsc` 0 erreur · 16 tests · build OK · **mais 27 visuels hébergés chez Lovable (`*.asset.json`) inutilisables hors du domaine Lovable**.
Branche de référence de notre travail : `front/comptes-securite` (`66f8740`), qui contient tout ce qui suit.

## A. Absent de la nouvelle version — à reporter (par ordre de valeur)

| # | Notre travail | Où (branche d'origine) | Pourquoi c'est important | Recouvrement avec leur version |
|---|---|---|---|---|
| 1 | **Lecture vidéo réelle** (HLS, URLs signées, `use-hls`, reprise après coupure, lien expiré, plein écran iPhone, clavier, focus) | `front/fiabilite-lecture` + `integration/lovable-design-video` | **Leur lecteur est le simulateur à minuteries** (`setTimeout` → « ready »), aucune vidéo réelle ne se lit | **PORTÉ le 30/10/2026** (`front/lecture-reelle`) : leur `playback-experience.tsx` est remplacé, leur design de lecteur conservé, ouverture automatique du lecteur gardée (un clic). Vérifié en réel (flux 1080p, erreur + « Réessayer »). Seuls `demo-b4`, `tout-recommencer` et `deux-fois-oui-s1-e1` ont une vidéo côté back-end : les autres films affichent « pas encore disponible ». |
| 2 | **Branchement sur l'API** : catalogue (accueil, fiche), recherche, « dans le même esprit » | `front/catalogue-*` | Sans lui le site n'affiche que des données figées | Touche Hero, Top 10, suggestions, `program-page`, `search-overlay` |
| 3 | **Vrais comptes** : session par cookie, connexion/création, mot de passe oublié, `/reinitialiser`, `/verifier-email`, profil, export, suppression | `front/comptes-*` | Leurs pages de compte sont une **démo locale** (`demo-session.ts`, faux compteurs) | Remplace `demo-*`, garde leur design (`auth-layout`, menu) |
| 4 | **Configuration et marque** (`env.ts`, `brand.ts`, `.env.example`, pages 404/erreur en français) | `front/config-marque` (dans `front/experience`) | Variables d'environnement, textes en un seul lieu | Le nom devient « MILLENIUM » : `brand.ts` à adapter |
| 5 | **Polices auto-hébergées** (RGPD, plus de Google Fonts) | `front/experience` | La nouvelle version charge encore Google Fonts | Aucun |
| 6 | **Qualité mobile** : zones tactiles ≥ 40 px, textes ≥ 10 px, recherche à 16 px (zoom iOS), balayage créateurs, `max-height` de la fiche | `front/experience` | À re-mesurer sur leur nouvelle interface | Leur CSS a changé (+2 525 lignes) : à re-vérifier plutôt que copier |
| 7 | **Intro « Prisme »** (+ masquage sans flash) | `feature/origin-intro` | Dépend de la décision sur la signature (nom changé) | Aucun |
| 8 | **Poids des images** (2 images de 1,2 Mo → 140 Ko ; vidéos 49 Mo → 7 Mo) | `front/experience` | À refaire sur les nouveaux fichiers | Les 27 visuels sont à rapatrier |
| 9 | **Tests** : 75 chez nous contre 16 dans la base | toutes | Filet de sécurité | — |

## B. À arbitrer plutôt qu'à reporter (deux versions du même sujet)

| Sujet | Leur version | Notre version | Proposition |
|---|---|---|---|
| Animations | `gsap` + `lenis` (scènes au défilement) | CSS (texte Hero, sections, vue de page) | Garder **la leur** (plus riche) ; ne reporter de la nôtre que le respect strict du mouvement réduit si manquant |
| Recherche | `search-overlay` plein écran | boîte de recherche branchée sur `/api/search` | Garder **leur écran**, brancher **notre hook** `useCatalogSearch` |
| Comptes (pages) | `/connexion`, `/inscription`, `/mot-de-passe-oublie`, `/compte`… | panneau dans la Hero | Garder **leurs pages**, brancher **notre `AuthProvider`** |
| Page programme | `program-page.tsx` immersive | `watch-landing` branché API | Garder **la leur**, y brancher `loadProduction` / `playable` / `playbackId` |

## C. Rapatriement des visuels (49 Mo → ~7 Mo après compression)

27 fichiers `*.asset.json` pointent vers `/__l5e/…` (stockage Lovable). Source : `https://hero-stream-magic.lovable.app/__l5e/assets-v1/…`.
Gros fichiers : 4 vidéos (6 à 12 Mo), 4 PNG (2 Mo). Le reste : posters et portraits (< 120 Ko).
**Téléchargement soumis à l'accord de l'utilisateur** (nom, source et poids ci-dessus).

## D. Ordre de portage proposé

1. Rapatrier les 27 visuels (accord requis) → la base s'affiche enfin en local.
2. Lecture réelle (#1) — le plus critique.
3. Config, marque « MILLENIUM », polices (#4, #5).
4. API : catalogue, fiche, recherche (#2).
5. Comptes réels branchés sur leurs pages (#3).
6. Mobile re-mesuré (#6), tests (#9), poids (#8).
7. Intro (#7) selon la décision sur la signature.
