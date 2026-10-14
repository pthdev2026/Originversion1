# Prompt à donner à l'agent FRONT — branchement du catalogue (v0.8)

```
Mission : brancher le front ORIGIN sur le catalogue de l'API, sans modifier le design validé.

Lis d'abord : docs/API-CONTRACT.md (v0.8 : sections Catalogue éditorial, Recommandations, Sous-titres, Comptes, Reprise),
docs/BRIEF-AGENT-FRONT.md (règles GitHub/Lovable et addendum v0.7).

Règles : branche `front/api-catalogue` partie de la branche courante ; jamais de push sur main ; pas de réécriture d'historique ;
`bun run build`, `bunx tsc --noEmit`, `bun run test` verts à chaque commit ; les fichiers `src/lib/origin-*.ts` restent le REPLI
quand VITE_API_URL est absent ou que l'API est injoignable (isDemo reste vrai) ; aucune donnée simulée quand l'API répond.

Étapes (un commit par étape, dans cet ordre) :
1. Client typé `src/lib/origin-catalog-api.ts` : /api/home, /api/programs/:slug, /api/search, /api/themes/:slug, /api/creators.
   Préfixer par l'adresse de l'API toute image/vidéo qui commence par « /images/ ». credentials: 'include' partout.
2. Accueil : alimenter Hero, Top 10, Suggestions, Univers, PTH Originals, rails et thématiques depuis `collections[].items`
   (identifier par `slug` de collection, ordre par l'API). Les créateurs depuis `creators`.
3. Fiche programme : `GET /api/programs/:slug` ; saisons/épisodes ; utiliser `episodes[].playbackId` et `playable`
   (bouton « Regarder » seulement si playable). Supprimer playbackProgramId() une fois remplacé.
4. Recherche (`/api/search`) et « Dans le même esprit » (`/api/programs/:slug/similar`).
5. Sous-titres : `<track>` depuis `playback.subtitles` (+ crossOrigin="anonymous" sur la vidéo) ; menu langues.
6. Comptes : connexion/inscription, page `/reinitialiser?token=` (POST /api/auth/password/reset), reprise de lecture
   (PUT /api/me/progress/:playbackId toutes les 10–15 s, pause, fermeture avec keepalive), « Ma liste », ident (`playback.ident`),
   mesure de lecture (POST /api/playback-sessions).
7. « Pour vous » : GET /api/recommendations ; titre « Pour vous » SEULEMENT si `personalized: true`, sinon « Populaire en ce moment » ;
   afficher `reason` sur chaque carte.

Livrable : une PR par étape ou une PR unique relue, avec captures desktop et mobile, et la liste des écarts avec le contrat
(à consigner dans docs/API-REQUESTS.md plutôt que contourner côté front).
```
