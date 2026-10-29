# Agent — Catalogue éditorial, recherche, recommandations

**Mission** : que le catalogue soit entièrement pilotable par l'équipe éditoriale via l'API, rapide, et honnête ; que la recherche et les recommandations soient explicables.

## Périmètre
`api/src/modules/catalog/` (lectures `content.ts`, écritures `admin.ts`, validation `schemas.ts`, routes, visuels `images.ts`), `recommendation/` (`scoring.ts` pur, `repository.ts`, `routes.ts`), `progress/`, `mylist/`, migrations 008–009, `seed/catalog-demo.json`, scripts `catalog-import.ts` / `catalog-export-front.ts`.

## Invariants (ne jamais casser)
- Brouillon (`published = false`) et `kind = 'brand'` : **invisibles** de toute lecture publique (fiche, accueil, collections, thèmes, recherche, recommandations).
- `playable` = au moins un `media_assets.status = 'ready'` ; jamais déduit du catalogue seul.
- Écriture éditoriale = **document complet en transaction**, sous verrou consultatif ; champs inconnus refusés (`strict`) ; images `https://` ou `/images/…` uniquement.
- Une écriture admin **vide le cache serveur** du catalogue (`CATALOG_CACHE_SECONDS`).
- Recommandation : chaque élément a une `reason` ; `personalized: false` sans historique ; ce qui est vu/en cours/en liste n'est jamais re-proposé ; `WEIGHTS` = un seul endroit.
- La colonne `search_text` est tenue par un trigger : toute colonne cherchable ajoutée à `programs` exige de mettre à jour le trigger (nouvelle migration).
- Reprise : terminé à 95 % ou < 30 s de la fin ; envois en retard ignorés ; durée de référence = celle du média.

## Chantiers ouverts (priorité)
1. ~~`GET /api/me/list` enrichi~~ et ~~progression par programme~~ : faits le 30/10 (contrat v1.2). Vérifier `docs/API-REQUESTS.md` pour de nouvelles demandes.
3. Édition du nom d'affichage (`PATCH /api/me`) si le front en a besoin.
4. Au-delà de ~20 000 titres : pré-calcul des recommandations (seuil mesuré, `docs/TEST-DE-CHARGE.md`).

## Tests de référence
`catalog/catalog.test.ts`, `catalog/catalog-cache.test.ts`, `recommendation/recommendation.test.ts`, `progress/user-data.test.ts`, `analytics/dashboard.test.ts`, `robustness.test.ts`.

## Terminé quand
Typage + tests verts · contrat mis à jour (`docs/API-CONTRACT.md`) · test pour le cas nominal, hostile et concurrent · mesure de charge `browse` si la route est publique et fréquente · fiche `05-…` à jour.

## Ne pas toucher
Le front (`app/`), le schéma des comptes, le pipeline vidéo.
