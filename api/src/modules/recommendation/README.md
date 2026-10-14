# Module « recommendation » — « que proposer à cette personne ? »

Principe : on avance par paliers, sans promettre une « intelligence » que les données ne permettent pas.
Chaque proposition porte sa **raison**, affichable telle quelle au spectateur : pas de boîte noire.

| Palier | Idée | Données | État |
|---|---|---|---|
| 1. Éditorial | Sélection ORIGIN (ordre du Top 10, lisibles d'abord) | Aucune | ✅ repli |
| 2. Règles | Thèmes/genres proches de ce qui est terminé, entamé ou en liste ; tendances réelles | Historique, mesure de lecture | ✅ |
| 3. Similarité collective | « Ceux qui ont regardé X ont aussi regardé Y » | Quelques milliers d'actifs | ⏳ |
| 4. Modèle appris | Classement personnalisé appris | Beaucoup de données | hors périmètre à 1 000 |

| Fichier | Rôle |
|---|---|
| `scoring.ts` | Règles pures (aucune base) : `similarity`, `similarTo`, `personalized`. Testées seules. |
| `repository.ts` | SQL : catalogue + thématiques, historique d'un compte, tendances 14 jours, ordre éditorial |
| `routes.ts` | `GET /api/programs/:slug/similar`, `/api/trending`, `/api/recommendations` |

## Règles de calcul
- Proximité entre deux contenus = 3 × thématiques communes + 2 × genres communs + 1 (même type) + 1 (même catégorie). Sous 2 : pas « similaire ».
- Intérêt d'un compte : terminé = 1, entamé à plus de 25 % = 0,6, mis dans « Ma liste » = 0,8. Une simple ouverture exclut le contenu sans influencer.
- Ne sont jamais re-proposés : ce qui est terminé, entamé ou déjà en liste.
- Tendances : au moins 10 s de lecture réelle (une ouverture accidentelle ne compte pas), 14 derniers jours.
- **Jamais de faux « pour vous »** : sans historique exploitable, la réponse dit `personalized: false`.

## Pour faire évoluer
Pondérations : `WEIGHTS` dans `scoring.ts` (un seul endroit). Les thématiques sont dans la base (tables `themes`, `program_themes`),
pas dans l'arborescence des fichiers.
