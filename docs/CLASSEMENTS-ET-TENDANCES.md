# ORIGIN — Top 10, classement, tendances : qui décide de quoi (31/10/2026)

Quatre notions distinctes, une seule définition de l'audience (`api/src/modules/catalog/audience.ts`).

| Notion | Qui décide | Route | Règle |
|---|---|---|---|
| **Classement éditorial** | L'équipe éditoriale (back-office) | collection `top-10` dans `GET /api/home` et `GET /api/collections/top-10` | Ordre choisi à la main (`position`). Aucun calcul. Peut contenir plus de 10 éléments (14 aujourd'hui : c'est une donnée éditoriale, pas une règle du code). |
| **Top 10 de l'accueil** | Le même : c'est l'**affichage** du classement éditorial | `collections[slug=top-10]` | Le front affiche ce que la collection contient, avec `rank`. Le libellé « cette semaine » est un texte du front, il ne signifie pas que l'ordre est calculé. |
| **Classement global** (`/classement`) | Règle déterministe | `GET /api/ranking` | 1) les programmes du Top 10 éditorial, dans leur ordre ; 2) tout le reste du catalogue publié par audience décroissante ; 3) égalité → titre, puis identifiant. Ordre total : mêmes données = même ordre, pagination sans doublon ni trou. |
| **Tendances** | Calcul sur les lectures | `GET /api/trending` | Programmes réellement regardés (même définition d'audience), du plus vu au moins vu ; égalité → titre puis identifiant ; complétés par la sélection éditoriale tant que les données manquent (`reason` : « Populaire en ce moment » ou « Sélection ORIGIN »). |

**Audience** : une session de lecture compte si elle date de moins de **14 jours** et dure au moins **10 s**. Elle n'est acceptée que si elle porte le jeton émis par la lecture (anti-gonflage, contrat v1.15).

**Exclusions communes** : brouillons (`published = false`) et programmes de marque (`kind = 'brand'`) n'apparaissent dans aucune de ces listes. Un programme sans média prêt peut apparaître (il porte `playable: false`, le front l'affiche « bientôt »).

**Thématiques** : programme phare configuré (`featuredSlug`, null s'il est absent/non publié) ; repli proposé `fallbackFeaturedSlug` = programme le mieux classé de la thématique. Le contenu d'une thématique = phare configuré d'abord, puis ordre du classement global.

## Points à faire valider par le propriétaire (aucun n'a été tranché par le code)
1. Le Top 10 doit-il rester **éditorial** (situation actuelle) ou devenir **calculé** quand l'audience sera suffisante ? Le texte du front dit « classés selon leur audience de la semaine » alors que la fenêtre réelle est de **14 jours** et que le haut du classement est éditorial.
2. Combien d'éléments dans le Top 10 (14 aujourd'hui) ?
3. Fenêtre d'audience (14 j) et seuil de vue (10 s).
