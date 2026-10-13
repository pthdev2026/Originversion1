# ORIGIN — Diagnostic du front-end (13/10/2026)

Mission A du brief front. **Aucun fichier du dépôt `app/` n'a été modifié** (lecture, `tsc`, `test`, `lint`, `build` seulement ; `.output/` est ignoré par git).
Dépôt examiné : `app/`, branche locale `feature/origin-intro` (HEAD `9878a02`).

## 1. Verdict

Le front est une **vitrine soignée et cohérente avec une lecture réelle branchée** : Hero → fiche programme → lecteur HLS → API locale, avec des états honnêtes (« pas encore disponible » ≠ panne).
Il n'est pas encore **fiable en conditions réelles** : le parcours de lecture ne gère ni l'expiration des liens, ni le 403, ni les pertes réseau prolongées, ni le plein écran iPhone ; hls.js alourdit la page programme ; une fonction (« Ma liste ») est **simulée** en local, ce que le brief interdit ; le socle de configuration (env, textes de marque) n'existe pas ; plusieurs visuels posent un **problème de droits**.

## 2. Mesures

| Contrôle | Résultat |
|---|---|
| `bunx tsc --noEmit` | 0 erreur |
| `bun run test` | 4 tests, 2 fichiers, tous passent (routage + catalogues ; rien sur la lecture) |
| `bun run build` | OK (Nitro/Cloudflare par défaut) |
| `bun run lint` | **857 problèmes**, 850 « prettier/prettier » : le code n'est pas formaté selon `.prettierrc` (héritage Lovable). 7 avertissements non vérifiés un par un |
| API locale `GET /health` | `{"status":"ok","database":"ok"}` |
| Poids client | page programme **580 Ko** JS (hls.js inclus), accueil **308 Ko** JS, CSS **145 Ko**, 38 images = **6,0 Mo** |
| Images | 0 fichier `*.asset.json`, 0 URL `/__l5e` : règle 4 respectée |

## 3. État Git

- **Correctif (après `git fetch`)** : `origin/main` est à `fc0eaf5`, soit **36 commits Lovable** de plus que notre `main` local (`c5dd0a3`) et que toutes nos branches (15 fichiers, +269/−72 : statut des épisodes « Déjà vu / En cours / À regarder », contour rouge de sélection, ajustements de boutons et de vignettes, `cardStyle` des collections, balises `og:image`). Une fusion à blanc donne **2 conflits** (`src/lib/productions.ts`, `src/styles.css`). Les constats ci-dessous portent sur notre arbre local, pas sur l'état actuel de GitHub.
- `main` local = `c5dd0a3` : la PR `integration/lovable-design-video` n'est **pas fusionnée**.
- `integration/lovable-design-video` : 1 commit local non poussé (`b587f34`, « Deux fois oui » jouable).
- `feature/origin-intro` (courante) : empilée sur ce commit local + intro Prisme (`9878a02`).
- `feature/video-playback` : ancienne branche locale, supplantée par l'intégration.
- Arbre de travail propre. Aucune branche `front/<sujet>` n'existe encore.

→ **Décision à prendre avant toute modification** : sur quelle base créer `front/<sujet>` (cf. §8).

## 4. Ce qui est validé (à ne pas toucher sans autorisation)

- Composition de l'accueil : Hero, Top 10, nouveautés, suggestions, univers, PTH Originals, créateurs, 3 collections (`src/routes/index.tsx`).
- Page programme `/production/$slug` (`watch-landing.tsx`, `production.$slug.tsx`).
- Jetons de couleur (`styles.css:55+`) conformes à la palette du brief ; 12 blocs `prefers-reduced-motion`, dont un coupe-circuit global (`styles.css:286`).
- Séparation données / présentation : `origin-*.ts` typés, `isDemo: true` partout ; `playbackProgramId()` respecte la convention du contrat (`origin-api.ts:43`).
- Pas de faux contenu vidéo : une séance sans média donne « pas encore disponible ».

## 5. Fragile — parcours de lecture (mission B)

| # | Constat | Où | Gravité |
|---|---|---|---|
| B1 | `expiresAt` est typé mais **jamais lu** : un lien expiré (page laissée ouverte, onglet réveillé) échoue sans re-demande | `origin-api.ts:18`, `playback-experience.tsx` | Haute |
| B2 | Aucun traitement du 403 sur segment/manifeste (contrat : redemander `/playback` une fois) | `use-hls.ts:44-49` | Haute |
| B3 | Erreur réseau fatale : `hls.startLoad()` **sans limite** ni message ; l'utilisateur voit un tampon infini | `use-hls.ts:46` | Haute |
| B4 | Lecture HLS native (Safari/iOS) : **aucun écouteur `error`** → échec silencieux | `use-hls.ts:55-61` | Haute |
| B5 | hls.js importé **statiquement** (le brief exige un import dynamique à l'ouverture du lecteur) | `use-hls.ts:2` | Moyenne |
| B6 | Plein écran sur `document.documentElement`, pas sur le lecteur ; pas de `webkitEnterFullscreen` (iPhone ne supporte pas l'API sur un div) ; aucune gestion de l'orientation | `playback-experience.tsx:105-108` | Haute (mobile) |
| B7 | Modale `aria-modal` sans piège de focus ni restitution du focus ; au passage « Ouvrir le lecteur » → lecteur, le bouton focalisé disparaît et le focus est perdu | `playback-experience.tsx:230-240` | Moyenne |
| B8 | Raccourcis clavier sur `window` : `Espace` sur un bouton focalisé peut déclencher deux actions ; pas de réglage de volume, pas d'annonce lecteur d'écran lecture/pause | `playback-experience.tsx:115-126` | Moyenne |
| B9 | Messages d'erreur : pas de « Service momentanément indisponible », pas d'adresse support, pas de cas « expiré » ; l'échec du lecteur n'a **pas de bouton Réessayer** | `playback-experience.tsx:30-39, 157` | Moyenne |
| B10 | Aucune mesure du temps de démarrage (même en debug) | — | Moyenne |
| B11 | `fetchPlayback` : pas de délai maximal, aucune validation de la forme de la réponse (`as PlaybackInfo`) | `origin-api.ts:31` | Basse |
| B12 | `GET /api/programs` jamais utilisé : on ne sait pas, avant de cliquer, quels programmes sont jouables | — | À décider |

## 6. Fragile / manquant — hors lecture

**Fonctions simulées (interdit par §7 du brief)**
- « Ma liste » : l'état `inList` bascule en local, donne l'impression d'un enregistrement qui n'existe pas (`watch-landing.tsx:18, 62`). À désactiver explicitement (« bientôt »), pas à simuler.
- « Vous pourriez aussi aimer » : `similarTo()` est une similarité de démo ; la légende promet une personnalisation « selon votre profil » (`watch-landing.tsx:119`). Honnête sur le caractère démo, mais promet une fonction qui n'existe pas.
- Top 10 : un classement présenté comme tel avec des données de démonstration (« fausses statistiques » au sens du ton éditorial). Libellé de démonstration à vérifier visuellement avant de conclure.

**Configuration et marque (brief §5)**
- Pas de `.env.example`. Seule `VITE_API_URL` est lue ; `VITE_SITE_URL`, `VITE_APP_ENV`, `VITE_ENABLE_INTRO`, `VITE_SUPPORT_EMAIL` n'existent pas.
- Repli silencieux sur `http://127.0.0.1:4000` si la variable est absente (`origin-api.ts:3`) : en production, ce serait une valeur inventée plutôt qu'un état dégradé explicite.
- Pas de module de marque (`src/lib/brand.ts`) : nom, signature et textes SEO sont dispersés (`index.tsx:21-26`, `__root.tsx:81`, composants).
- `app/.claude/launch.json` lance `npm run dev` sur le port 8080 (le brief impose bun).

**Pages d'erreur** : 404 et erreur globale sont en **anglais** (« Page not found », « This page didn't load »), avec les styles du gabarit Lovable, dans un `<html lang="fr">` (`__root.tsx:16-74`).

**Comptes / reprise / mesure** : aucun point d'intégration typé. Le bouton « Se connecter » ouvre un panneau honnête (« disponible prochainement ») mais rien n'est préparé pour `/api/auth/*`, `/api/me`, progression, liste, `POST /api/playback-sessions`.

**Intro Prisme** (`origin-intro.tsx`)
- Rendue côté serveur à chaque chargement puis retirée après hydratation : un visiteur qui a déjà vu l'intro dans la session subit un **flash de recouvrement** (`origin-intro.tsx:26, 38`).
- Sans JavaScript, le recouvrement plein écran reste.
- Elle charge `pth-presentatrice-bordeaux.jpg` (**1,28 Mo**) en arrière-plan d'un panneau.
- Pas d'interrupteur `VITE_ENABLE_INTRO`.

## 7. Qualité : performance, accessibilité, responsive (missions D)

**Performance**
- Aucune image responsive (`srcset`) ni format moderne ; deux fichiers dépassent 1 Mo (`pth-presentatrice-bordeaux.jpg`, `pth-chantal.jpg`), 38 images servies telles quelles (6,0 Mo).
- Variantes `.jpg` / `.jpeg` de la même personne pour 3 créateurs (`yvan-castanou`, `nathaniel-bassey`, `joshua-selman`) : à dédoublonner ou justifier.
- Polices : **7 familles** chargées en une requête bloquante vers Google Fonts (`__root.tsx:93`) : Barlow Condensed, Bebas Neue, Cormorant Garamond, Playfair Display, Manrope, Michroma, Montserrat. Le `body` est en **Montserrat** (`styles.css:175`), pas Manrope comme le brief le prescrit. À arbitrer : AGENTS.md documente une typographie par carte de suggestion (choix Lovable validé) ; elle contredit « ne pas multiplier les familles ». Le chargement depuis les serveurs de Google pose en outre une question RGPD (chantier A9) : auto-hébergement à envisager.

**Accessibilité (constats à confirmer par audit, rien de mesuré aux outils pour l'instant)**
- Deux `<main>` imbriqués sur l'accueil : `index.tsx:32` et `origin-hero.tsx:45`.
- Le panneau de menu est un `Dialog` Radix (bon point) ; la modale de lecture ne l'est pas (B7).
- Contrastes des textes secondaires (`--muted-foreground`, argent foncé) et styles `:focus-visible` : non audités.
- `prefers-reduced-motion` bien couvert dans le CSS ; le JS d'intro le respecte.

**Tests** : 4 tests, aucun sur la lecture (`useHls`, états, expiration). Aucune mesure sur le terrain mobile réelle.

## 8. Risques de droits (brief §7 : « image dont les droits ne sont pas établis »)

| Élément | Constat | Risque |
|---|---|---|
| Créateurs (`origin-creators.ts`) | Noms et photographies de personnalités réelles : Benny Hinn, Chris Oyakhilome, Joshua Selman, Nathaniel Bassey, Yvan Castanou, avec des textes « à venir ». Les suggestions réutilisent trois de ces visages avec des titres de programmes inventés (« Puissance & intimité », « Le courage de croire »…) | **Élevé** : droit à l'image et suggestion d'une collaboration inexistante |
| Top 10 | Titre « Gladiator » classé n° 1 en « Film original », « Rosie », « Au-delà »… | Moyen : titre d'œuvre tierce, visuels de nature IA/illustratif à vérifier, faux classement |
| `film-stills.jpg`, `top-ten-posters.jpg` | Présents dans `src/assets`, non référencés dans le code | À purger ou documenter |
| Visuels PTH (`pth-chantal`, `pth-presentatrice-bordeaux`, `pth-episode-5/6/7`) | Présentatrice et invités : autorisations à confirmer (cf. ANALYSE-GLOBALE, décision 4) | À confirmer |

Je n'ai pas modifié ni retiré ces éléments : ils font partie du design validé.

## 9. Proposition d'ordre de travail

Un livrable à la fois, chacun sur sa branche `front/<sujet>` + PR, validé avant le suivant.

1. **`front/fiabilite-lecture`** (mission B) : B1–B11 ; import dynamique de hls.js ; états expiré / indisponible / erreur / reprise réseau ; plein écran lecteur + iOS ; focus et clavier ; mesure du démarrage (`?debug`) ; tests Vitest de la machine d'états.
2. **`front/config-marque`** : `.env.example`, module de configuration, `src/lib/brand.ts`, pages 404/erreur en français, état dégradé si `VITE_API_URL` absent, `VITE_ENABLE_INTRO`.
3. **`front/preparation-comptes`** (mission C) : interfaces typées désactivées ; « Ma liste » et « Reprendre » en état explicitement non disponible.
4. **`front/qualite`** (mission D) : formatage (`prettier --write` en un commit isolé), images responsives, `<main>` unique, audit WCAG, polices.
5. Intro vidéo : attendre le fichier (mission E).

## 10. Décisions attendues

1. **Branche de base** : partir de `integration/lovable-design-video` (avec son commit local non poussé), de `feature/origin-intro`, ou attendre la fusion de la PR ?
2. **Prettier** : accepter un commit isolé de reformatage global (850 erreurs, aucun changement de comportement), ou ne formater que les fichiers touchés ?
3. **Demande de route** : souhaitez-vous que le front utilise `GET /api/programs` pour n'afficher « Regarder » que sur les programmes jouables, ou garder « clic puis 404 honnête » ? Si oui, une entrée dans `API-REQUESTS.md` n'est pas nécessaire (la route existe).
4. **Droits** : que fait-on des créateurs et du Top 10 de démonstration avant toute mise en ligne (masquer, anonymiser, remplacer) ? Je ne touche à rien sans accord.
5. **Typographie** : confirmer que la typographie par carte de suggestion (Lovable) prime sur « Manrope + Michroma uniquement ».
