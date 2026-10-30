# Hero « application » — téléphone et tablette (portrait)

Statut : livré le 30/10/2026 sur `front/hero-mobile` (au-dessus de `front/lecture-reelle`). Ordinateur et tablette en paysage inchangés.
Source : `src/components/origin/origin-hero.tsx`, bloc « Hero « application » » en fin de `src/styles.css`, `src/lib/use-image-tint.ts`.

## Principe
- **Le film occupe tout l'écran** ; plus de dégradé noir : un **verre dépoli teinté par le film** couvre le bas (flou + teinte, bord supérieur en fondu, aucun trait).
- **Teinte calculée sur l'image du programme à l'écran** (moitié basse, pixels colorés pondérés) : si le teaser change, la teinte change en fondu (1,3 s). Repli : palette de l'univers du programme tant que l'image n'est pas lue.
- **Pas de survol sur mobile** : un toucher sur une carte, ou un **balayage horizontal** sur la Hero, change le film (fond, titre, synopsis, teinte).
- **Barre fixe en bas** : cœur (ma liste, même logique que la page programme : visiteur → connexion) + « Regarder ». Elle se retire quand la Hero sort de l'écran ou qu'un panneau est ouvert.
- Mise en page en **grille** (espace, titre, rail) : plus de décalages en pixels, le rail ne chevauche plus le texte.

## Où ça s'applique
Requête commune (CSS et `COMPACT_QUERY`) : `(max-width: 767px), (max-width: 1100px) and (orientation: portrait)`.

## Limites connues / suites
- Les visuels sont des plans **paysage** : sur un écran portrait ils sont recadrés (un visage peut être coupé). Cible : un visuel **vertical** par programme (champ à ajouter côté catalogue) et un point focal éditorial.
- Téléphone en paysage (≥ 768 px de large) : retombe sur la mise en page ordinateur.
- TV : base à définir (focus télécommande, marges de sécurité) — chantier suivant.
- Durée / note non affichées : aucune donnée réelle à ce stade.

## Menu du bas (téléphone, ≤ 767 px) — 30/10/2026, `front/menu-bas-mobile`
- Pastille de verre flottante : Accueil · Films (section Films & Séries) · Ma liste · Compte (Connexion si visiteur) + bouton rond Rechercher. Composant `mobile-tab-bar.tsx`, monté dans `__root.tsx`.
- Se retire au défilement vers le bas, revient vers le haut ; masquée pendant la lecture et sur les pages de connexion.
- Teinte du verre : celle du film de la Hero (variables `--hg-*` posées sur la racine) ; neutre sur les autres pages.
- « Regarder » et le cœur reviennent dans la Hero (plus de barre fixe en double) ; le burger du haut reste pour le secondaire.
- À décider : Originals / Explorer / Recommandations (accessibles par le burger) ; teinte du film sur la page programme.
