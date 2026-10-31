# Rapport — contenus publiés incomplets (31/10/2026)

Base de développement, 38 programmes publiés (hors marque). **Aucun n'a été modifié, masqué ni dépublié** : ce rapport sert à décider.

## 1. `demo-b4` et `tout-recommencer`
| | `demo-b4` | `tout-recommencer` |
|---|---|---|
| Origine | Reliquat de la démonstration B4 (13/10) ; référencé par `api/scripts/load/prepare.ts` (jeu de test de charge) | Titre de démonstration du front (11/10), importé sans visuel |
| Image / catégorie / synopsis / accroche | ❌ / ❌ / ❌ / ❌ | ❌ / ❌ / ❌ / ❌ |
| Média prêt (lisible) | ✅ | ✅ |
| Collections / thématiques | aucune / aucune | aucune / aucune |
| Où il apparaît | `/api/ranking` (en bas), recherche, tendances s'il est regardé ; **écarté du classement par le front** (pas de visuel) | idem ; **phare configuré de « Reconstruction »** mais hors de la thématique (donc non exposé), 1 ligne de progression de test |
| Comptes réels touchés | aucun | aucun (1 ligne de test) |

**Options** : (A) *Compléter* : visuel, catégorie, synopsis, rattachement à une thématique (indispensable pour `tout-recommencer` si on veut le garder phare). (B) *Masquer* : ne pas l'afficher dans les listes automatiques (classement, recherche) tant qu'il n'a pas de visuel — règle générale possible côté API : « publié » exigerait un visuel. (C) *Dépublier* : `published=false` (réversible, données conservées). **Recommandation** : `demo-b4` → (C) après vérification que le jeu de test de charge ne l'attend pas (il le recrée) ; `tout-recommencer` → (A) si le film existe réellement, sinon (C). **Décision éditoriale requise.**

## 2. Autres contenus incomplets (28 sur 38 ont au moins un champ éditorial manquant ; chiffres vérifiés en base)
- **27 programmes sans synopsis** (et aucun n'a d'accroche, sauf mention contraire) : tous « démonstration » — `gladiator`, `damnes`, `acteurs`, `au-dela`, séries Suspense/Science-fiction, témoignages… L'écran affiche « Présentation à venir — contenu de démonstration ».
- **33 programmes sur 38 sans média prêt** : ils s'affichent « Bientôt » et la lecture répond « pas encore disponible » (comportement correct, vérifié en navigateur). Parmi eux **12 des 14 éléments du Top 10 éditorial** : seuls `le-silence` (rang 5) et `les-passagers` (rang 6) se lisent aujourd'hui ; un visiteur voit un Top 10 dont presque tous les titres répondent « bientôt ».
- **Aucune thématique** pour 28 programmes (ils n'apparaissent dans aucune catégorie, seulement dans des collections).
- Programmes sans visuel : uniquement les deux ci-dessus.

**Règle proposée** (à valider) : un programme ne peut être **publié** que s'il a visuel + catégorie + synopsis ; il ne peut être mis dans le **Top 10** que s'il a un média prêt ou une date de sortie annoncée (`coming-soon`).

## 3. Composant inutilisé `production-hero.tsx` (front)
- `src/components/production/production-hero.tsx` n'est **importé nulle part** (vérifié : seules des classes CSS `production-hero*` de `styles.css` le mentionnent). Il contient un faux bouton « Ma liste (démo) » non enregistré.
- Les classes `hud-glass`, `hud-icon`, `hud-primary` qu'il utilise n'apparaissent dans aucun autre composant.
- **Nettoyage proposé (à faire par l'agent front)** : supprimer le fichier, puis les règles `.production-hero*` et `--production-hero-fade` de `styles.css` **après** avoir relancé `tsc`, les tests et `vite build`. Rien n'est supprimé par le back-end.
