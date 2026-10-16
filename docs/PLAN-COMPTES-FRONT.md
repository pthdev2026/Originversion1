# Plan — comptes, reprise de lecture, « Ma liste » (front ORIGIN)

Statut : **plan à valider, aucun code écrit.** Date : 16/10/2026. Auteur : agent front.
Sources : `docs/API-CONTRACT.md` (sections « Comptes », « Reprise de lecture et Ma liste », « Mesure de lecture »),
addendum v0.7 de `docs/BRIEF-AGENT-FRONT.md` (étape 5 puis 6).

## 1. Objectif

Remplacer par de **vraies fonctions** ce qui est aujourd'hui simulé ou désactivé, sans toucher au design validé :

| Aujourd'hui | Demain |
|---|---|
| « Se connecter » ouvre un panneau « disponible prochainement » | Connexion, inscription, déconnexion, mot de passe oublié, profil |
| « Ma liste » bascule un état local (faux) | Liste réelle liée au compte |
| « Marquer comme vu » : historique simulé en session | Reprise réelle (« Reprendre à 12:30 »), état « Vu » issu du serveur |
| « Pour vous » absent | Affiché **uniquement** si l'API renvoie `personalized: true` |
| Mesure de lecture visible en `?debug` seulement | Rapport anonyme envoyé à `POST /api/playback-sessions` |

Règles : aucune fonction simulée ; un état explicite pour chaque cas (chargement, anonyme, connecté, erreur, verrouillé) ;
le front ne lit ni n'écrit jamais le cookie de session.

## 2. Contraintes découvertes dans le contrat (à traiter AVANT tout écran)

1. **Même site obligatoire.** Le cookie de session n'est transmis que si front et API partagent le site. Notre dev utilise
   `127.0.0.1` (`VITE_API_URL`, `launch.json`, `--host 127.0.0.1`) : il faut passer **front et API sur `localhost`**
   (`http://localhost:3210` ↔ `http://localhost:4000`). En production : `origin.example` ↔ `api.origin.example`.
2. **`credentials: 'include'`** sur tous les appels `/api/*` qui touchent au compte (et à `/api/recommendations`).
   Le catalogue public reste sans cookie (pas de régression de cache).
3. **CORS côté API** : `CORS_ORIGINS` doit contenir l'origine exacte du front ; toute écriture d'une origine inconnue = `403`.
   → demande au back-end (voir §7).
4. **Rendu serveur vs navigateur.** Le serveur du front ne reçoit pas le cookie du navigateur pour l'API : l'état du compte
   se charge **côté navigateur après affichage** (pas de `loader`). Conséquence : un court instant « état inconnu »
   (le bouton affiche « Se connecter » sans clignotement bloquant, puis bascule si une session existe).
5. **Lecture réservée aux comptes** : si `PLAYBACK_REQUIRES_LOGIN=true`, `/playback` renvoie `401` → écran « Connexion requise »
   qui ouvre la connexion puis relance la lecture (nouvel état dans le lecteur, à côté de « indisponible » et « erreur »).
6. **Mot de passe** : 10 à 128 caractères, ni l'e-mail, ni trop répétitif : message clair avant l'envoi ET affichage du `400` reçu.

## 3. Architecture proposée

```
src/lib/auth-api.ts        client typé : register / login / logout / me / forgot / reset / changePassword / deleteAccount
src/lib/me-api.ts          client typé : progress (get/put/delete), continue-watching, list (get/put/delete)
src/lib/auth-context.tsx   AuthProvider + useAuth() : 'unknown' | 'anonymous' | { user }  (TanStack Query, clé ['me'])
src/components/account/    AuthDialog (connexion / inscription), ForgotForm, ProfilePanel, AccountMenu
src/routes/reinitialiser.tsx   page du lien e-mail (?token=…) → POST /api/auth/password/reset
src/lib/watch-progress.ts  hook de reprise : envoi 10–15 s, pause, fermeture (keepalive), `sentAt`
```

- Résultats typés et explicites, comme `catalog-api.ts` : `ok` / `unauthenticated` / `locked` / `conflict` / `invalid` / `error`.
- **Formulaires** : `react-hook-form` + `zod` (déjà dépendances du projet, aucun ajout) ; composants existants (`Dialog` Radix déjà utilisé).
- **Aucun secret côté front** ; mots de passe jamais journalisés ni stockés.
- **Intention conservée** : un clic sur « Ma liste » ou « Regarder » sans compte ouvre la connexion, puis **rejoue l'action**.

## 4. Phases (une branche `front/<sujet>` et une PR chacune, empilées sur `front/catalogue-recherche`)

### C1 — `front/comptes-socle` : session, connexion, inscription, déconnexion
- Passage sur `localhost`, `credentials`, `AuthProvider`, `useAuth()`.
- Panneau « Se connecter » de la Hero : **connexion / inscription** (champ code d'invitation seulement si l'API l'exige : `403`).
- Bouton de la barre : « Se connecter » ↔ menu compte (e-mail, Déconnexion). Même emplacement, même style.
- États : `401` (message unique de l'API), `429` (verrou 15 min : afficher le délai), `409` (adresse déjà utilisée), `400`, réseau.
- **Critère** : se connecter, recharger la page, rester connecté ; se déconnecter ; session expirée → retour propre à l'anonyme.

### C2 — `front/comptes-securite` : mot de passe oublié, `/reinitialiser`, profil
- « Mot de passe oublié » (`202` toujours : message neutre, ne révèle rien).
- Page `/reinitialiser?token=…` (obligatoire : le lien e-mail y renvoie) ; `400` = lien invalide/expiré/déjà utilisé.
- Profil : changer le mot de passe (`/api/me/password`), **supprimer le compte** (confirmation + mot de passe, droit à l'effacement).
- **Critère** : cycle complet « oublié → e-mail → nouveau mot de passe → connexion » (e-mail réel via `MAIL_PROVIDER=resend`, sinon journal API).

### C3 — `front/ma-liste`
- Suppression de l'état local `inList` ; `GET/PUT/DELETE /api/me/list/:slug` ; mise à jour immédiate avec retour arrière si l'API refuse.
- Rail « Ma liste » sur l'accueil, **visible seulement** si la liste n'est pas vide (réutilise `ContentCarousel`, aucun nouveau composant visuel).
- **Dépend** d'une demande au back-end (§7-a) : `GET /api/me/list` ne renvoie que `{slug, addedAt}`.

### C4 — `front/reprise-lecture`
- Envoi de la position **toutes les 10–15 s, à la pause, à la fermeture** (`keepalive: true`), avec `sentAt` ; ouverture du lecteur :
  `GET /api/me/progress/:playbackId` → reprise à la position, ou 0 si `completed`/`404`.
- Bouton principal : **« Reprendre »** (déjà prévu par le design de Lovable) alimenté par le serveur ; barre de progression des épisodes.
- Rail « Reprendre » sur l'accueil via `GET /api/me/continue-watching` (carte + barre de progression).
- **Suppression de « Marquer comme vu »** (historique simulé) : l'état « Vu » vient du serveur (`completed`). Décision §8-3.
- **Dépend** d'une demande au back-end (§7-b) pour l'état de chaque épisode d'une série.

### C5 — `front/pour-vous-mesure`
- `GET /api/recommendations` avec `credentials` : titre **« Pour vous »** seulement si `personalized: true` ; chaque carte affiche sa `reason`.
- Mesure : rapport cumulatif à `POST /api/playback-sessions` (démarrage, coupures, qualités, appareil) ; remplace l'affichage `?debug` seul.
- **Point de conformité** (§8-6) : mesure anonyme, mais à mentionner dans la politique de confidentialité (chantier A9).

## 5. Ce qui change pour l'utilisateur (parcours cibles)

1. **Visiteur** : tout reste consultable ; « Ma liste » et « Reprendre » invitent à se connecter, sans perdre l'action.
2. **Inscription** : e-mail + mot de passe (+ nom, + code d'invitation si requis) → connecté immédiatement.
3. **Lecture** : je quitte à 12:30 ; au retour (même autre appareil) « Reprendre » m'y ramène.
4. **Oubli** : « Mot de passe oublié » → e-mail → page `/reinitialiser` → connexion.
5. **Effacement** : profil → supprimer → compte supprimé sur confirmation.

## 6. Tests et vérifications

- **Unitaires** : clients (`auth-api`, `me-api`) sur toutes les réponses du contrat (200, 401, 409, 429, 400, réseau, 5xx) ; hook de reprise (envois, `sentAt`, fermeture).
- **Composants** : formulaires (validation, messages, focus, clavier) ; états du lecteur (`401` → connexion → reprise).
- **Bout en bout local** avec la vraie API sur `localhost` : comptes de test créés **uniquement en local** (jamais de mot de passe réel, aucun
  compte de test écrit dans le dépôt en clair). Vérifier le cookie (`httpOnly`), la reprise multi-onglets, le verrouillage 429.
- **Accessibilité** : champs étiquetés, erreurs annoncées (`aria-live`), focus rendu à l'ouverture/fermeture, mobile 375 px.
- Toujours : `tsc`, `bun run test`, `bun run build`, console sans erreur d'hydratation.

## 7. Demandes au back-end (à déposer dans `docs/API-REQUESTS.md`)

- **a. Liste enrichie** : `GET /api/me/list` renvoyant des `ProgramCard` (ou un paramètre `?expand=card`) : sans cela il faut un appel par titre.
- **b. Progression par programme** : `GET /api/me/progress?program=<slug>` (ou champ dans `/api/programs/:slug` quand connecté) donnant la progression
  de **tous les épisodes d'une série** en un appel (pour « Reprendre » et « Vu »).
- **c. Configuration locale** : confirmer `CORS_ORIGINS` = `http://localhost:3210` et l'API accessible en `http://localhost:4000`.

## 8. Décisions attendues de vous

| # | Question | Ma recommandation |
|---|---|---|
| 1 | Connexion en **fenêtre** (panneau existant) ou en **page** dédiée ? | Fenêtre : même geste que la recherche, sans quitter le programme |
| 2 | État du compte chargé **côté navigateur** (léger instant « inconnu ») plutôt que côté serveur ? | Oui : plus simple et fiable ; le côté serveur exigerait de transmettre le cookie |
| 3 | **Supprimer « Marquer comme vu »** (historique simulé) ? | Oui : remplacé par l'état « Vu » réel issu de la reprise |
| 4 | Nouveaux rails « Reprendre » et « Ma liste » sur l'accueil : OK malgré le design validé ? | Oui, en réutilisant le carrousel existant, visibles seulement si non vides |
| 5 | Inscription **ouverte** ou **sur invitation** pour la bêta ? | Sur invitation pour les 50 à 100 premiers (le champ s'affiche seulement si l'API l'exige) |
| 6 | Mesure de lecture : acceptable sans bandeau de consentement (données anonymes, sans cookie) ? | À confirmer avec le volet juridique (A9) avant la mise en ligne |
| 7 | Lecture **réservée aux comptes** ? (`PLAYBACK_REQUIRES_LOGIN`) | Non au départ : l'aperçu sans compte aide l'acquisition |

## 9. Risques

- **Cookie / même site** : seul point qui bloque tout si mal configuré ; on le règle et on le teste en premier (C1).
- **Plus de 7 PR empilées** : relecture lourde ; fusionner la chaîne actuelle avant d'ouvrir C1.
- **Dépendances back-end** (§7-a, b) pour C3 et C4 : on peut livrer C1, C2 et le socle de C4 sans elles.
- **Sécurité** : la politique du brief interdit de saisir de vrais identifiants dans mes tests ; les essais se font avec des comptes jetables locaux.
- **Charge** : C1 à C5 représentent environ 2 à 3 semaines de travail de relecture comprise ; livrables indépendants, arrêt possible après chaque phase.

## 10. Ordre recommandé

`C1 → C2 → C4 (socle) → C3 → C4 (rails) → C5`. Après chaque phase : démonstration locale, validation, PR.
