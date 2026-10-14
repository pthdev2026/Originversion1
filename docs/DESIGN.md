# ORIGIN — DESIGN.md

Système de design de la plateforme de streaming **ORIGIN** (Partage Ton Histoire).
Ce document décrit ce qui est **réellement dans le code** (`app/src/styles.css`, `app/src/components/`, `app/src/lib/brand.ts`)
au 14/10/2026, plus les règles de direction artistique qui le gouvernent. Les valeurs de couleur font foi en **OKLCH** (dans le code) ;
les hexadécimaux sont des équivalents approchés pour les outils de design.

> **Principe produit** : « Le contenu raconte l'émotion. L'interface prépare la rencontre. »
> **Signature** : « Les histoires méritent plus qu'un écran. »

---

## 1. Identité en une page

| Dimension | Décision |
|---|---|
| Ambiance | Cinématographique, premium, immersive, minimaliste, légèrement futuriste, émotionnelle |
| Ce que ce n'est PAS | Un template SaaS, une marketplace, un clone de Netflix, une interface « religieuse » cliché |
| Fond | Noir profond, toujours. Les images portent la couleur ; l'interface reste sobre |
| Signature de couleur | **Argent** (mat, jamais chromé caricatural) |
| Action principale | **Champagne**, réservé aux actions importantes (« Regarder ») |
| Atmosphère | Bordeaux / rouge désaturé, **jamais dominant** : lueurs, bords de sélection, accents ponctuels |
| Rythme | Grandes sections aérées, grandes affiches, peu de séparateurs, beaucoup d'espace vide volontaire |
| Voix éditoriale | Honnête, directe, respectueuse. Pas de faux témoignages, de fausses statistiques ni de fausse personnalisation |

---

## 2. Couleurs

### 2.1 Palette de base

| Rôle | Jeton (CSS) | OKLCH | ≈ Hex | Usage |
|---|---|---|---|---|
| Fond | `--background` | `oklch(0.115 0 0)` | `#050505` | Fond de toute la plateforme |
| Surface | `--card` | `oklch(0.174 0.004 286)` | `#101012` | Cartes, menus, panneaux |
| Texte principal | `--foreground` | `oklch(0.938 0.009 80)` | `#EEEAE4` | Titres, texte courant (ivoire chaud) |
| Texte secondaire | `--muted-foreground` | `oklch(0.68 0.006 80)` | `#9A9894` | Métadonnées, légendes |
| **Action** | `--primary` | `oklch(0.815 0.072 83)` | `#D9BF8D` | Bouton « Regarder » uniquement |
| Action (survol) | `--hero-champagne-hover` | `oklch(0.85 0.065 83)` | `#E3CB9E` | |
| **Argent** | `--silver` | `oklch(0.777 0.004 260)` | `#B5B6B9` | Contours, icônes, texte secondaire fort |
| Argent catalogue | `--catalog-silver` | `oklch(0.827 0.006 260)` | `#C4C6CA` | Catalogues, bordures actives |
| Argent doux | `--catalog-silver-muted` | `oklch(0.629 0.012 260)` | `#858990` | Libellés discrets |
| Sélection | `--selection` | `oklch(0.9 0.006 260)` | `#DCDEE2` | Focus, élément actif |
| Bordeaux (lueur) | `--ember` | `oklch(0.48 0.145 26)` | `#9F322F` | Ombres, halos, liseré de sélection |
| Progression | `--watch-progress` | `oklch(0.61 0.21 26)` | `#E63839` | Barre « déjà vu », statut de lecture |
| Erreur | `--destructive` | `oklch(0.577 0.245 27.3)` | `#E7000B` | Erreurs seulement |
| Bordure | `--border` | argent à 30 % | | Contours de composants |

### 2.2 Règles
- **Le rouge n'est jamais une couleur de surface.** Il vit dans des lueurs (`--cinema-glow`, `--experience-atmosphere`), des ombres (`--selection-shadow`) et la barre de progression.
- **Un seul accent chaud par écran** : le champagne du bouton principal. Pas de doré décoratif.
- **L'argent est mat** : aplats, contours, texte. Le dégradé métallique (`--chromo-metal`) est réservé aux grands chiffres (Top 10) et au mot-symbole.
- **Pas de néon, pas de couleurs saturées dans l'interface.** La saturation vient des photographies.
- Contraste : texte courant sur fond ≥ 7:1 (ivoire sur `#050505`) ; texte secondaire ≥ 4,5:1.

### 2.3 Atmosphère et dégradés (portés par le conteneur d'accueil, jamais par chaque section)
`--experience-atmosphere` (lueurs latérales), `--hero-bottom-shade`, `--hero-side-shade`, `--hero-top-shade`, `--top-ten-top-fade`,
`--watch-backdrop-shade`, `--playback-veil`. Règle : **aucune coupure visible entre deux sections** — un seul fond continu.

### 2.4 Grain
`--chromo-grain` : grain de pellicule fin en pseudo-élément de la page d'accueil, transparent aux clics. Jamais sur le texte courant.

---

## 3. Typographie

Polices **auto-hébergées** (`@fontsource`, sous-ensemble latin) : aucune requête vers un tiers.

| Famille | Graisses | Rôle |
|---|---|---|
| **Manrope** | 400 · 500 · 600 · 700 | Police principale : navigation, titres de sections, boutons, synopsis, métadonnées |
| **Michroma** | 400 | **Mot-symbole « ORIGIN »** et titres de signature (« PTH Originals », créateurs). Jamais pour du texte courant |
| **Barlow Condensed** | 500 · 600 | Titres de catalogue en capitales, noms de classement |
| Bebas Neue / Playfair Display / Cormorant Garamond | 400 / 600 / 500 italique | **Direction artistique par carte** (suggestions) : une affiche peut avoir son propre caractère de titre |

Échelle observée (px, desktop) :

| Élément | Taille | Notes |
|---|---|---|
| Mot-symbole nav | 25 | Michroma, argent, centré |
| Titre Hero (programme) | 29–42 | Michroma, 1 ou 2 lignes |
| Synopsis Hero | 14 | Manrope 400, argent, interligne 1,6, largeur max 420 |
| Titre de section | 30–43 | Barlow Condensed 600 |
| Titre de carte catalogue | 30 | Barlow Condensed 500, capitales |
| Métadonnées / étiquettes | 11–13 | Manrope, **capitales, interlettrage 0,14–0,2 em** |
| Bouton | 13 | Manrope 600, capitales, interlettrage 0,08 em |
| Grand chiffre Top 10 | 140 | Manrope 600, dégradé argent |

Règles : majuscules **non systématiques** (réservées aux étiquettes, boutons et titres condensés) ; maximum 2 familles par écran
(+ le logo-titre du programme) ; les logos-titres des productions ne sont jamais remplacés par la police commune ;
les textes visent des proportions de page web, **pas** d'affiche (cf. mémoire projet : viser ~50 % des tailles « maquette »).

---

## 4. Espace, grille, formes

| Jeton | Valeur | Usage |
|---|---|---|
| Rayon de base | `0.25rem` (4 px) | Boutons, cartes (3–6 px selon le composant) |
| Rayon pilule | 24 px | Boutons de compte, champ de recherche |
| Marge latérale de section | `5 %` (catalogues) · `clamp(20px, 5vw, 72px)` (pages programme) | Alignement général |
| Padding vertical de section | 48 px | `.origin-catalog` |
| Hero | `min-height 760px` · `100svh` · `max-height 1200px` | Plein écran immersif |
| Bloc éditorial Hero | `left 4.4 %` · largeur 475 px (max 48 %) | |

**Formats d'images** (ne pas dévier) :

| Format | Ratio | Où |
|---|---|---|
| Affiche verticale | `2 / 3` | Suggestions, univers |
| Affiche classement | `0.595` | Top 10 |
| Carte large | `16 / 9` (ou `2.04` dans la Hero) | Catalogues, épisodes, lecteur |
| Carte portrait | `4 / 5` | Collections « portrait » |
| Carte éditoriale | `1.8` | PTH Originals |

---

## 5. Profondeur et matière

| Effet | Jeton | Où |
|---|---|---|
| **Verre sombre** | `--hud-glass` (+ `backdrop-filter: blur(10–18px)`) | Boutons secondaires, panneaux, états du lecteur |
| Filet de verre | `--hud-line` (22 %) · `--hud-line-strong` (60 %) | Contours de tous les éléments « HUD » |
| Surface de menu | `--menu-surface` + `--menu-shadow` | Menu déployable |
| Halo de sélection | `--selection-shadow` | Carte sélectionnée : liseré argent + lueur bordeaux 18 % |
| Halo champagne | `--champagne-shadow` | Bouton « Regarder » |

Règle : **la profondeur vient de la lumière, pas des ombres portées noires.** Une ombre est toujours teintée (bordeaux ou argent à faible opacité).

---

## 6. Composants

### 6.1 Boutons

| Variante | Classe | Aspect | Usage |
|---|---|---|---|
| **Principal (champagne)** | `.hud-primary`, `.watch-button` | Fond `--primary`, texte `--primary-foreground`, filet argent, halo champagne, hauteur 48 px, capitales 13 px, rayon 4 px | UNE action par écran : « Regarder » |
| **Verre** | `.hud-glass` | Fond verre + flou, filet 22 %, survol 60 % | Retour, Ma liste, actions secondaires |
| **Icône ronde** | `.hud-icon`, `.player-icon` | 42–48 px, sans fond, survol verre | Lecteur, navigation |
| **Pilule** | `.account-button` | Contour argent, rayon 24 px, 40 px de haut | « Se connecter » |
| **Lecture ronde** | `.player-center`, `.episode-play` | Cercle 46–84 px, verre + filet fort | Lancer la lecture sur une vignette |

États : survol = filet plus marqué + léger relèvement (`translateY(-1px)`) ; appui = `hud-press` (300 ms) ; focus = **contour 1 px `--selection`, décalage 3 px** ;
désactivé = opacité 45 %, curseur interdit, **avec libellé honnête** (« Bientôt disponible », jamais un bouton muet).

### 6.2 Navigation
Barre transparente sur la Hero : menu (burger) à gauche, **mot-symbole ORIGIN centré** (Michroma, argent), recherche et compte à droite.
Menu déployable en panneau verre. L'indicateur actif est un filet argent (pas un fond).

### 6.3 Hero
Image plein cadre, 3 voiles (haut, côté, bas), titre du programme (Michroma ou logo-titre), accroche + synopsis, **deux actions** :
« Regarder maintenant » (champagne) et « Voir la bande-annonce » (verre). Sélecteur horizontal de programmes en bas : miniatures 2,04:1,
numérotation `01–05` à droite. Le changement de programme fond l'image en **450–700 ms**.

### 6.4 Cartes de catalogue
- Carte large 16:9 : titre **dans** l'image ou sous l'image, durée en métadonnée discrète, badge en haut à gauche.
- Carte portrait 4:5 : image pleine carte, voile `--catalog-portrait-veil`, titre Barlow Condensed en capitales.
- Au survol : agrandissement léger (~1,015), bordure argent, `--catalog-hover-shadow`, **180–250 ms**, sans rebond.

### 6.5 Top 10
Grandes affiches verticales (0.595) avec un **chiffre de 140 px** en dégradé argent (`--chromo-metal`), partiellement hors de l'affiche.
Fondu supérieur doux (`--top-ten-top-fade`) pour une transition sans bord net depuis la Hero.

### 6.6 Page programme (`/production/:slug`)
Hero du programme (affiche + synopsis + statuts), actions (Regarder / Ma liste), sélecteur de saison (verre), liste d'épisodes (cartes 16:9 + durée),
titres similaires. Une saison à la fois ; l'épisode sélectionné reçoit un liseré `--episode-selected-edge`.
Marquage « Contenu de démonstration » (`.demo-tag`, bordure pointillée) tant que le contenu est fictif.

### 6.7 Lecteur
Plein écran sombre. États, dans l'ordre : *préparation* (loader fin 180 px) → *prêt* (« Ouvrir le lecteur ») → *lecture*.
Barre de progression de 2 px (`--selection`), contrôles verre : lecture/pause, son, temps `mm:ss`, qualité (Auto / 1080p…), liste d'épisodes, plein écran.
Contrôles masqués après 3 s d'inactivité pendant la lecture. États d'erreur honnêtes, jamais d'écran noir muet.

### 6.8 Signature d'ouverture (ident)
Séquence « ORIGIN » (~6 s, avec son) avant le **premier** visionnage d'un titre. Décision côté serveur (`ident.show`).
Bouton « Passer » après 2 s. Le programme se précharge pendant sa lecture. Voir `docs/API-CONTRACT.md`.

### 6.9 Blocs de recommandation (proposition, à valider sur maquette)
Bloc immersif « Pour vous / Recommandé » : grande image 16:9 plein cadre avec voile, **titre**, **durée** (film : `1 h 42` ; épisode : `S1 É3 · 47 min`),
**synopsis** (3 lignes max), et la rangée d'actions : **Regarder** (champagne), **Ma liste** (verre), **Accueil** et **Retour** (icônes rondes).
Chaque recommandation affiche sa **raison** (« Parce que vous avez regardé… ») — jamais de boîte noire.
Statut : spécification de principe ; la maquette attend l'image d'inspiration.

---

## 7. Mouvement

| Intention | Durée | Courbe |
|---|---|---|
| Retour d'état (survol, focus) | 180–250 ms | `ease` |
| Apparition de section | 400–700 ms | `ease`, opacité + translation ≤ 12 px (`fade-up`, `hero-text-in`) |
| Changement de programme (Hero) | 450–700 ms | fondu croisé, image qui « s'installe » (`hero-settle`) |
| Entrée de page / lecteur | 500–600 ms | `production-in`, `stage-in` |
| Signature d'ouverture | ~4–6 s | voir §6.8 |

Règles : **CSS d'abord** ; aucun rebond ; un effet répétitif n'est jamais envahissant ; l'animation sert la compréhension, pas l'attention.
`prefers-reduced-motion` : les animations d'entrée et de survol sont supprimées (15 règles dédiées), la lecture reste fonctionnelle.

---

## 8. Responsive

| Point de rupture | Comportement |
|---|---|
| `≥ 1600 px` | Grands écrans : marges et tailles agrandies |
| `≤ 1000 px` / `≤ 900 px` | Colonnes réduites, panneaux empilés |
| `≤ 767 px` (mobile) | Une colonne, recherche ancrée en haut, champ de 16 px (pas de zoom iOS), fermeture tactile, balayage horizontal des carrousels sans capter le défilement vertical |
| `pointer: coarse` | Cibles ≥ 44 px, pas d'états « survol » indispensables |

La Hero garde `100svh` ; l'ident passe de 4 à 2 colonnes sur mobile.

---

## 9. Accessibilité

- Contraste AA minimum partout ; focus **toujours visible** (contour 1 px sélection, décalage 3 px).
- Navigation clavier complète (carrousels : flèches ; lecteur : Espace/K, ←/→ ±10 s, F, M, Échap).
- `aria-label`, `aria-current`, `aria-live` sur les zones qui changent (Hero, état de préparation).
- `prefers-reduced-motion` et `forced-colors` pris en charge.
- Texte alternatif décrivant la scène pour chaque visuel de programme.
- États d'erreur en langage clair, avec une action (Réessayer, Retour).

---

## 10. Images

| Règle | Détail |
|---|---|
| Rendu | Photographie de film : peau texturée (pores, grain naturel), contraste doux, noirs relevés, couleurs naturelles légèrement chaudes |
| Interdits | Néon, étalonnage orange-bleu appuyé, peau lissée, rouge saturé, effets de verre « jeu vidéo » |
| Cadrage | Sujet dans les 60 % centraux (recadrages verticaux fréquents) |
| Droits | **Uniquement des images originales ou sous licence.** Pas de plans de série, de personnalités sans accord, d'œuvres signées |
| Poids | Affiches ≤ ~150 Ko, fonds Hero ≤ ~250 Ko, formats modernes (WebP/AVIF) dès que possible |
| Stockage | Dans le dépôt (`src/assets`), **jamais** dans un stockage tiers lié à un domaine |

---

## 11. Identité sonore
Signature : harpe solo (glissando ascendant, note tenue, impact grave discret, réverbération naturelle) — noble, lumineux, humain.
Volume homogénéisé entre l'ident et les programmes (cible commune ≈ −16 LUFS). Jamais de son qui démarre sans geste de l'utilisateur.

---

## 12. Contenu et ton

| À faire | À éviter |
|---|---|
| « Pas encore disponible à la lecture. » | Un bouton qui ne fait rien |
| « Préparation de votre séance… » | Un écran noir muet |
| Étiquettes courtes en capitales espacées | Des phrases en capitales |
| Marquer clairement le contenu de démonstration | Faire passer du faux contenu pour réel |
| Raison explicite d'une recommandation | « Recommandé pour vous » sans explication |

Textes de marque : source unique `app/src/lib/brand.ts`.

---

## 13. Correspondance code

| Sujet | Fichier |
|---|---|
| Jetons, composants, animations | `app/src/styles.css` |
| Textes de marque | `app/src/lib/brand.ts` |
| Hero, navigation, catalogues, Top 10, ident | `app/src/components/origin/` |
| Page programme, lecteur | `app/src/components/production/` |
| Données de démonstration | `app/src/lib/origin-*.ts`, `productions.ts` |
| Contrat avec le back-end | `docs/API-CONTRACT.md` |

## 14. Règle de modification
Toute évolution de ce système (nouvelle couleur, nouveau composant, nouvelle durée de mouvement) est d'abord décrite ici, validée,
puis implémentée. **Les maquettes finales priment** sur ce document en cas de divergence.
