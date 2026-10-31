# Demandes du front au back-end

Format : date · ce qui est voulu · pourquoi · forme souhaitée · statut.

## 2026-10-16 · Liste enrichie · statut : **traitée le 30/10/2026** (contrat v1.2 : `program` = `ProgramCard` ou `null`)
- **Voulu** : que `GET /api/me/list` renvoie des fiches `ProgramCard` (ou accepte `?expand=card`), pas seulement `{slug, addedAt}`.
- **Pourquoi** : afficher le rail « Ma liste » sans un appel `GET /api/programs/:slug` par titre.
- **Forme souhaitée** : `{ items: [{ slug, addedAt, program: ProgramCard }] }`.

## 2026-10-16 · Progression de tous les épisodes d'une série · statut : **traitée le 30/10/2026** (contrat v1.2 : `GET /api/me/progress?program=<slug>`, terminés inclus)
- **Voulu** : une route donnant la progression de **chaque épisode** d'un programme en un appel
  (ex. `GET /api/me/progress?program=<slug>` → `{ items: [{ playbackId, positionSeconds, durationSeconds, completed, updatedAt }] }`).
- **Pourquoi** : afficher « Reprendre » / « Vu » sur la liste d'épisodes ; `GET /api/me/progress/:playbackId` est unitaire et
  `continue-watching` exclut les contenus terminés, donc l'état « Vu » n'est pas reconstituable.

## 2026-10-16 · Environnement local pour la session par cookie · statut : **confirmé le 30/10/2026**
- **Réponse du back-end** : en local, lancer l'API avec `CORS_ORIGINS=http://localhost:3210` et l'ouvrir sur `http://localhost:4000` ; le front sur `http://localhost:3210`. `PUBLIC_APP_URL` par défaut vaut déjà `http://localhost:3210`. Sans `NODE_ENV=production` le cookie s'appelle `origin_session` (sans `Secure`).
- (ancien statut : à confirmer)
- **Voulu** : confirmer que `CORS_ORIGINS` contient `http://localhost:3210` et que l'API est servie en `http://localhost:4000` en local.
- **Pourquoi** : le cookie `origin_session` exige le même site (`localhost`, pas `127.0.0.1`) ; le front passera sur `localhost`.

## 2026-10-30 · Intégration de la Hero Section (demandes du back-end vers le front et le back-office) · statut : **ouvert**
- **Voulu** : voir `docs/DEMANDES-INTEGRATION-HERO.md` (front F1–F9, back-office B1–B3), avec recette en navigateur sur deux comptes.
- **Pourquoi** : la Hero est encore simulée (compte de démonstration, « Ma liste » en stockage navigateur) ; le back-end est prêt et vérifié (contrat v1.10).

## 2026-10-31 · Profils multiples par compte (écran « Qui regarde ? ») · statut : **ouvert**
- **Voulu** : jusqu'à **5 profils** par compte, comme Netflix. Routes souhaitées : `GET /api/me/profiles` (liste), `POST /api/me/profiles` (création), `PATCH /api/me/profiles/:id` (nom, avatar), `DELETE /api/me/profiles/:id` (suppression, impossible pour le dernier profil).
- **Pourquoi** : le front affiche « Qui regarde ? » après connexion (grille de profils, crayon pour modifier, tuile « Ajouter un profil », fond en verre teinté par l'avatar survolé). Aujourd'hui un compte n'a qu'un profil (nom + avatar de `GET /api/me`), donc l'écran n'en montre qu'un.
- **Forme souhaitée** : `{ items: [{ id, name, avatar: null | {kind:"preset", preset:0..7} | {kind:"photo", url, zoom} , isDefault }], max: 5 }` ; le profil actif est choisi côté client (identifiant envoyé avec les rapports de lecture) ; « Ma liste » et « Continuer à regarder » devraient devenir **par profil**.
- **À trancher avec le propriétaire** : liste et progression par profil (comme Netflix) ou partagées par compte ; profil « enfant » éventuel.
