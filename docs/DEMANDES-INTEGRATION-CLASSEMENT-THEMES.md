# Demande d'intégration front — classement, thématiques, Tendances (31/10/2026)

**Déjà réalisée et vérifiée dans mon espace isolé** : branche `integration/classement-themes` du dépôt `app/` (commit `71a5a86`), posée **directement au-dessus** du sommet local de l'agent front (`1449774`) : un simple `git merge integration/classement-themes` (avance rapide) l'applique, sans conflit ni changement visuel. 74 tests, `tsc` propre.

| Section | Composant / fichier | Source serveur | État |
|---|---|---|---|
| Top 10 (accueil) | `origin-top-ten.tsx` ← `catalog-api.ts › toRanked` | `GET /api/home` → `collections[top-10]` | ✅ déjà branché (jalon accueil) |
| Classement complet | `routes/classement.tsx` → `ranking-page.tsx` | `GET /api/ranking` (`fetchRanking`) | ✅ branché ; erreur « Réessayer » ; catalogue vide = message ; programmes sans visuel écartés |
| Thématiques (chips, phare, sous-titre) | `theme-explorer.tsx` ← `origin-catalogs.ts › applyServerCatalog` | `GET /api/home` → `themes[]` (`subtitle`, `featuredSlug`, `fallbackFeaturedSlug`, `programs` classés) | ✅ branché ; `themeShowcase` n'est plus qu'une valeur de repli |
| Tendances | `theme-explorer.tsx` (chip « Tendances ») | `GET /api/trending?limit=12` | ✅ branché (desktop). **Mobile : aucun chip « Tendances »** (conception mobile) |
| Menu — catégories | `millenium-menu.tsx` | thématiques du serveur | ✅ lues à l'affichage (avant : figées au chargement du module) |
| Recherche | `search-overlay.tsx` / `search-api.ts` | `GET /api/search`, `/api/search/suggestions` | ✅ déjà branché |
| Page « Recommandations » mobile / `/continuer` / `/ma-liste` | — | `/api/recommendations`, `/api/me/continue-watching`, `/api/me/list` | ✅ (jalons précédents) ; recommandations mobiles non vérifiées par moi |

## Comportements attendus (vérifiés dans le navigateur)
- Un programme garde **le même `slug`** partout : Top 10, classement, thématique, Tendances, recherche, fiche, lecture, Ma liste, Continuer à regarder.
- Un programme sans média prêt : fiche ouverte, bouton « Regarder » → « Ce programme n'est pas encore disponible à la lecture. » + « Retour au programme » (jamais de fausse lecture).
- Phare d'une thématique : `featuredSlug` (configuré, publié, **membre de la thématique**), sinon `fallbackFeaturedSlug` (mieux classé), sinon premier programme.
- API arrêtée : `/classement` et l'accueil affichent « momentanément indisponible » + « Réessayer ».

## Reste à faire par l'agent front
1. Fusionner `integration/classement-themes` (ou en reprendre les 9 fichiers) puis publier `front/integration-hero` — **ton utilisateur doit l'autoriser**.
2. Envoyer la mesure de lecture avec `analytics.sessionId`/`token` (contrat v1.15).
3. Texte du classement : « selon leur audience de la semaine » alors que le haut du classement est éditorial et la fenêtre d'audience de 14 jours (voir `CLASSEMENTS-ET-TENDANCES.md`).
4. Afficher un visuel de repli pour un programme publié sans image (2 cas aujourd'hui : `demo-b4`, `tout-recommencer`) ou les compléter dans le back-office.
