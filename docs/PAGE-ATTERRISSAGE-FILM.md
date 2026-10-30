# Page d'atterrissage d'un film (page programme) — référence figée

Statut : **validée par l'utilisateur le 30/10/2026 — boutons, cartes et typographie figés.** Ne plus modifier leur apparence ;
on travaille autour (recommandations, données, lecture). Sources : `src/components/production/program-page.tsx`, `src/styles.css`
(blocs `.pp-*`). Exemple de rendu : `/production/le-silence` (capture de référence fournie par l'utilisateur).

## Structure de la page

| Section | Id | Contenu |
|---|---|---|
| Hero | `pp-top` | Visuel plein cadre, surtitre, titre, synopsis, **dock d'actions** |
| Avant de commencer | `pp-details` | Choix Audio et Sous-titres |
| Recommandations | `pp-similar` | « Vous pourriez aussi aimer » : rail de cartes |

## Typographie (variables dans `:root`)

| Rôle | Police | Valeurs |
|---|---|---|
| Affichage (`--font-display`) | **Montserrat** | titres, surtitres, légendes de cartes |
| Texte (`--font-body`) | **Manrope** | synopsis, boutons |
| Logo (`--font-logo`) | **Michroma** | mot-symbole uniquement |

| Élément | Règle |
|---|---|
| **Surtitre** (« FILM · N° 5 CETTE SEMAINE ») | Montserrat 600, 12 px, majuscules, interlettrage .24 em, blanc 84 % |
| **Titre** | Montserrat 600, `clamp(34px, 5.4vw, 76px)`, interligne .98, interlettrage .01 em, majuscules, `text-wrap: balance`, halo doux de la couleur de la page ; titre long : `clamp(30px, 4.5vw, 62px)` |
| **Synopsis** | Manrope 400, `clamp(15px, 1.3vw, 17px)`, interligne 1.65, blanc 76 %, 540 px max, 3 lignes max |
| **Apparition** | `pp-rise` 1 s, en cascade : surtitre → titre (+.12 s) → synopsis (+.22 s) → dock (+.3 s) |

## Dock d'actions (boutons)

- **Conteneur** : pilule (rayon 999 px), verre : fond blanc 10 %, bordure blanche 20 %, marge intérieure 8 px, espace 6 px.
- **« Regarder »** : Manrope 600, 15 px, hauteur 48 px, marge `0 28px 0 22px`, fond blanc, texte noir, icône lecture 16 px.
  Survol : cerne blanc + halo de la couleur de la page (`--tt-c3`). Désactivé (« Bientôt disponible ») : fond blanc 12 %, texte blanc 60 %.
- **Boutons ronds** (ma liste, sous-titres, partage) : icônes seules, séparés par un filet.

## Cartes de recommandation (`.pp-sim`)

- Format 236 × 352 (`aspect-ratio: 236 / 352`, largeur `clamp(168px, 22vw, 236px)`), rayon 22 px, bordure blanche ~16 %, défilement à aimantation.
- Image assombrie au repos (`brightness(.62) saturate(.85)`).
- **Survol / focus (`.is-hot`)** : la carte monte de 8 px, bordure ~60 %, halo de la couleur `--tt-c1`, image à pleine lumière et agrandie à 1,08.
- **Pastille de rang** en haut à droite (Montserrat 600, 11 px, interlettrage .08 em).
- **Légende** en bas : surtitre 10 px (.22 em, majuscules, visible au survol), titre 17 px (500), bouton « lecture » en pilule qui se déplie au survol.

## Règles de travail

1. Ne pas changer ces valeurs sans demande explicite.
2. Les données (images, textes, recommandations, disponibilité) peuvent évoluer ; le dessin non.
3. Une image verticale n'est jamais étirée en plein cadre : fond flou + affiche nette (`BackdropImage`).
