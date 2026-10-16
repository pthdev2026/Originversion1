# Demandes du front au back-end

Format : date · ce qui est voulu · pourquoi · forme souhaitée · statut.

## 2026-10-16 · Liste enrichie · statut : ouverte
- **Voulu** : que `GET /api/me/list` renvoie des fiches `ProgramCard` (ou accepte `?expand=card`), pas seulement `{slug, addedAt}`.
- **Pourquoi** : afficher le rail « Ma liste » sans un appel `GET /api/programs/:slug` par titre.
- **Forme souhaitée** : `{ items: [{ slug, addedAt, program: ProgramCard }] }`.

## 2026-10-16 · Progression de tous les épisodes d'une série · statut : ouverte
- **Voulu** : une route donnant la progression de **chaque épisode** d'un programme en un appel
  (ex. `GET /api/me/progress?program=<slug>` → `{ items: [{ playbackId, positionSeconds, durationSeconds, completed, updatedAt }] }`).
- **Pourquoi** : afficher « Reprendre » / « Vu » sur la liste d'épisodes ; `GET /api/me/progress/:playbackId` est unitaire et
  `continue-watching` exclut les contenus terminés, donc l'état « Vu » n'est pas reconstituable.

## 2026-10-16 · Environnement local pour la session par cookie · statut : à confirmer
- **Voulu** : confirmer que `CORS_ORIGINS` contient `http://localhost:3210` et que l'API est servie en `http://localhost:4000` en local.
- **Pourquoi** : le cookie `origin_session` exige le même site (`localhost`, pas `127.0.0.1`) ; le front passera sur `localhost`.
