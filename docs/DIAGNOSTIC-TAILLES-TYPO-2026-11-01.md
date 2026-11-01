# Diagnostic — tailles de police et d'éléments (mobile, bureau, TV)

Date : 01/11/2026 · Périmètre : accueil, page programme, Paramètres, « Qui regarde ? » (mesures réelles dans le navigateur, serveur de développement) ·
**Aucun code modifié** : ce document sert à décider avant de corriger.

## 1. Méthode
Chaque page a été ouverte en 390 × 844 (mobile), 1440 × 900 (bureau) et 1920 × 1080 avec `?tv=1` (TV). Un script a relevé :
(a) la taille de police de chaque texte visible, pondérée par le nombre de caractères ; (b) la taille de chaque zone cliquable (plus petit côté).

Limites : la page programme et l'accueil ont été mesurés sans le lecteur (non mesuré, voir §5) ; la tablette n'a pas été remesurée (elle réutilise le mobile en portrait et le bureau en paysage) ;
un écran de bureau à 1920 px n'est **pas** une télévision (voir §3).

## 2. Repères (à valider auprès des sources primaires)
| Sujet | Repère | Source / statut |
|---|---|---|
| Texte TV | Android TV : minimum 12 sp, défaut 18 sp ; Fire TV : corps ≥ 14 sp, soit ≈ 28 px à 1080p | guides Android TV et Amazon Fire TV (recherche du 01/11) |
| Marges TV | ≈ 5 % de chaque bord (≈ 48 px à gauche/droite, ≈ 27 px en haut/bas à 1080p) ; focus et texte dans les 90 % centraux | idem |
| Cible tactile | WCAG 2.2 SC 2.5.8 (AA) : 24 × 24 px minimum ; Apple 44 pt ; Material 48 dp | **connaissance du modèle, non vérifié par la recherche** |
| Texte mobile | Material 3 : corps 14–16 sp, légendes 11–12 sp au minimum ; iOS : légende ≥ 11 pt | **idem, à vérifier** |
| Plateformes de streaming | Pas de mesure directe des applications Netflix, Disney+ ou Prime dans ce diagnostic : à faire avec captures si on veut un étalonnage « à la Netflix » | — |

## 3. Résultats

### Texte (part des caractères par taille)
| Page / écran | < 12 px | 12–13,5 px | 14–15 px | ≥ 17 px |
|---|---|---|---|---|
| Accueil bureau | **21 %** (9, 10, 10,5, 11) | 23 % | 38 % | 18 % |
| Page programme bureau | **24 %** | 22 % | 30 % | 26 % |
| Accueil mobile | **30 %** (9, 10, 10,5, 11) | 13 % | 42 % | 15 % |
| Page programme mobile | **17 %** | 23 % | 40 % | 18 % |
| Paramètres mobile | **51 %** (11 px dominant) | 31 % | 17 % | 2 % |
| « Qui regarde ? » mobile | 9 % (« Bientôt » à 8 px) | 40 % | 22 % | 29 % |
| Accueil TV (`?tv=1`) | 6 % | 22 % | 53 % (14,5 px dominant) | 17 % |
| Page programme TV | 15 % | 31 % | 28 % | 26 % |

### Zones cliquables (plus petit côté)
| Écran | Éléments | < 24 px | < 32 px | < 44 px |
|---|---|---|---|---|
| Accueil bureau | 214 | 23 | 38 | 65 |
| Page programme bureau | 31 | 15 | 15 | 18 |
| Accueil mobile | 183 | 13 | 39 | 43 |
| Paramètres mobile | 37 | 14 | 25 | 31 |
| Accueil TV | 214 | 23 | 28 | 59 |

### Constats principaux (par gravité)
1. **Barre de navigation : liens en 9 px sur tous les écrans**, bureau comme TV (hauteur cliquable 14 px). C'est le plus petit texte du site et il est constant. Le pseudo à 10 px et l'avatar à 9 px aussi.
2. **TV : deux fois trop petit selon les guides TV.** Le texte dominant est à 12,5–15 px alors que les repères TV donnent ≈ 24–28 px (Android TV : 12 sp ≈ 24 px à 1080p ; Fire TV : 14 sp ≈ 28 px). Les marges sont correctes (4 vw ≈ 77 px) mais les cibles et le texte sont ceux d'un ordinateur.
   *Contradiction à trancher* : vous avez jugé la première version TV « beaucoup trop grosse » parce qu'elle était vue sur un moniteur de bureau, à 60 cm. Une télévision se regarde à 2–3 m. Il faut étalonner sur une vraie TV (ou en simulant la distance), pas sur l'écran de travail.
3. **Mobile : 17 à 30 % du texte sous 12 px** (étiquettes 10 px, légendes de cartes 10,5–11 px, rubriques 9–10 px). Titres de cartes à 11 px, légendes à 10,5 px.
4. **Paramètres : trop réduits.** Après la mise « à l'échelle fine » demandée, 51 % du texte est à 11 px sur mobile et les boutons font 24 à 34 px de haut : trop petit pour le tactile (14 éléments sous 24 px).
5. **Cibles tactiles mobiles** : boutons « + » du Top 10 à 24 × 46 px ; liens du pied de page à 19 px de haut ; menu de l'espace compte à 34 px ; bouton « Réinitialiser » à 32 px.
6. **Bureau** : 65 éléments sous 44 px et 38 sous 32 px. À 36–42 px les boutons d'action sont acceptables au pointeur ; les liens de navigation (14 px) et les puces numérotées de la Hero (6,5 px dans l'état actif) ne le sont pas.
7. **« Qui regarde ? »** : bon dans l'ensemble ; seule la mention « Bientôt » est trop petite (8 px).
8. **Échelle non systématique** : 25 tailles distinctes sur l'accueil (6,5 / 9 / 10 / 10,5 / 11 / 11,5 / 12 / 12,5 / 13 / 14 / 14,5 / 15 …). Aucun jeu de variables : chaque règle fixe sa taille en pixels.

## 4. Proposition d'échelle (à valider)
Principe : **un petit nombre de rôles**, avec trois plateaux (mobile, bureau, TV), au lieu de valeurs ad hoc.

| Rôle | Mobile | Bureau | TV (à étalonner) |
|---|---|---|---|
| Légende / étiquette (plancher) | 11 | 12 | 20 |
| Texte secondaire | 12–13 | 13 | 22 |
| Corps | 14–15 | 15 | 26 |
| Titre de carte | 14 | 15 | 26 |
| Titre de section | 20 | 24 | 36 |
| Titre de Hero | 34 | 44 | 64 |
| Zone cliquable minimale | 44 | 32 (36 pour les boutons d'action) | 56 |

Règles : jamais de texte courant sous 11 px (12 sur bureau) ; capitales espacées autorisées à 11 px minimum ;
aucune cible tactile sous 44 px sur mobile (on peut agrandir la zone sans agrandir le dessin) ; focus TV déjà en place.

## 5. Plan de correction proposé (après validation)
1. **Variables d'échelle** (`--fs-label`, `--fs-small`, `--fs-body`, `--fs-card`, `--fs-h2`, `--fs-hero`…) définies par plateau dans `src/styles.css`, puis remplacement des valeurs en dur, page par page.
2. **Barre du haut et pastilles de la Hero** : 9 px → 12 px, zone cliquable 32 px.
3. **Mobile** : rubriques et légendes à 11–12 px, titres de cartes à 13–14 px ; zones tactiles 44 px (boutons « + », pied de page, menu compte).
4. **Paramètres** : remonter à 12–13 px de texte et 40–44 px de cible (en gardant le dessin fin).
5. **TV** : repasser à l'échelle du tableau §4 **après étalonnage sur une vraie télévision** ; le lecteur (temps, qualité, sous-titres, épisodes) reste à mesurer.
6. Contrôle automatique : un test qui parcourt les pages et échoue si un texte < 11 px ou une cible < 24 px apparaît (hors exceptions listées).

## 6. À décider
- Étalonnage TV : voulez-vous tester sur une vraie télévision (recommandé), ou fixer l'échelle TV à ≈ 1,6 × le bureau en attendant ?
- Mesurer aussi des applications de streaming de référence (Netflix, Disney+, Prime) pour un étalonnage « marché », ou s'en tenir aux guides de plateforme ?
- Les Paramètres : garder la finesse actuelle sur bureau et remonter seulement sur mobile ?
