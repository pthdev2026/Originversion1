# MILLENIUM × ORIGIN — Matrice d'intégration et tableau de suivi

Mise à jour : **30/10/2026** · Responsable de l'intégration : agent back-end (lead) · Source de vérité : le code, les tests et les essais en navigateur réel (jamais un message envoyé).

## 0. Légende des statuts
| Statut | Sens |
|---|---|
| **VÉRIFIÉ MILLENIUM** | Démontré depuis l'interface MILLENIUM réelle, dans un navigateur, contre le vrai back-end, base jetable |
| Recette indépendante | Démontré seulement par la page de test `api/scripts/recette/` (pas par MILLENIUM) |
| API seule | Route prête et testée, aucun écran ne l'appelle |
| Partiel | Branché dans le code mais pas démontré de bout en bout, ou seulement une partie |
| Simulé | Données ou comportement locaux fictifs |
| Absent | N'existe ni côté serveur ni côté écran |
| Bloqué | Attend un compte, une clé ou une décision externe |

## 1. Où vit le travail d'intégration (important)
- **Branche locale `integration/backend-hero`** du dépôt front (commit `ca33e50`), travaillée dans un **dossier à part** (`~/Desktop/ORIGIN-app-integration`, un « worktree »). La branche et le dossier de travail de l'agent front (`front/hero-immersive`) n'ont **pas été touchés**. **Rien n'est fusionné ni publié** : c'est à l'agent front (ou au propriétaire) de décider de la fusion.
- Fichiers de cette branche : `lib/api.ts`, `lib/session.ts`, `lib/list-store.ts` (nouveaux) ; `demo-session.ts`, `demo-space.ts`, `env.ts` ; `origin-hero.tsx`, `program-page.tsx`, `account-page.tsx`, `connexion.tsx`, `inscription.tsx`, `__root.tsx` ; `list-error-toast.tsx` ; tests `session-and-list.test.ts`. Suppression des comptes de démonstration (`demo-accounts.ts`, dont le mot de passe en clair).
- Contrôle : typage sans erreur, **38 tests front passés** (dont 8 nouveaux sur un faux serveur), 280 tests back-end passés.

## 2. Matrice
Agent : **F** = front · **B** = back-end · **BO** = back-office. Preuve : « E1 » = essai navigateur du 30/10 (voir §4).

### 2.1 Fondations : authentification et session
| Page / composant | Action utilisateur | Route · méthode | Données | Auth | Tables | Resp. | Statut | Preuve |
|---|---|---|---|---|---|---|---|---|
| `/inscription` | Créer un compte | `POST /api/auth/register` | `{email, password, displayName}` → `{user}` + cookie | non | users, sessions | F | **VÉRIFIÉ MILLENIUM** (branche d'intégration) | E1 : formulaire rempli, redirection `/bienvenue`, compte et session en base |
| `/connexion` | Se connecter | `POST /api/auth/login` | `{email, password}` | non | users, sessions, login_devices | F | **VÉRIFIÉ MILLENIUM** | E1 : mauvais mot de passe → « Adresse e-mail ou mot de passe incorrect. » ; bon → `/`, session en base |
| Menu / compte | Déconnexion | `POST /api/auth/logout` | — | oui | sessions | F | **VÉRIFIÉ MILLENIUM** | E1 : dialogue de confirmation, serveur répond 401 ensuite, sessions révoquées en base |
| Toute page | Reconnaître la session au chargement | `GET /api/me` | `{user}` | cookie | sessions, users | F | **VÉRIFIÉ MILLENIUM** | E1 : session conservée après actualisation et navigation |
| `/compte` | Renommer le compte | `PATCH /api/me` | `{displayName}` | oui | users | F | Partiel (code écrit, non démontré dans l'écran) | tests faux serveur |
| `/compte` › Confidentialité | Supprimer le compte | `POST /api/me/delete` | `{password}` (exigé) | oui | users + cascade | F | Partiel (champ mot de passe ajouté, non démontré dans l'écran ; suppression vérifiée par l'API) | E1 (API) |
| `/mot-de-passe-oublie` | Demander un lien | `POST /api/auth/password/forgot` | `{email}` → 202 | non | password_resets | F | **Simulé** (page sans appel) · API seule | API testée |
| (absent) | Réinitialiser / vérifier l'e-mail | `POST /api/auth/password/reset`, `/email/verify` | `{token, …}` | non | password_resets, email_verifications | F | **Absent** côté écran · API seule | — |
| `/compte` › Sécurité | Double authentification | `/api/me/2fa/*` | secret, codes | oui | user_totp, user_recovery_codes | F | **Simulé** · API seule | API testée |
| `/connexion` | Google / Apple | — | — | — | — | — | **Absent** (bouton honnête « arrive bientôt ») · Bloqué (décision et comptes développeur) | — |

### 2.2 Hero Section
| Composant | Action | Route · méthode | Données | Auth | Tables | Resp. | Statut | Preuve |
|---|---|---|---|---|---|---|---|---|
| `origin-hero` | Afficher les 10 programmes | `GET /api/home` (collection `hero`) | titre, synopsis, visuels, vidéo d'ambiance | non | programs, collections | F + B | **VÉRIFIÉ MILLENIUM** (jalon 4 : texte modifié côté administration → visible après rechargement) | E3 |
| `origin-hero` | Sélectionner un autre programme | — (état local) | `active.id` | — | — | F | **VÉRIFIÉ MILLENIUM** (le bouton Ma liste suit le programme actif) | E1 : Silence ↔ Passagers, état du bouton correct à chaque fois |
| `origin-hero` (mobile) | **Ma liste** | `PUT/DELETE /api/me/list/:slug`, `GET /api/me/list` | slug | oui | my_list | F + B | **VÉRIFIÉ MILLENIUM** | E1 : ajout → ligne en base ; actualisation → bouton restauré ; retrait possible |
| `origin-hero` (visiteur) | Ma liste sans compte | — | — | non | — | F | **VÉRIFIÉ MILLENIUM** (renvoi vers `/connexion`) | E1 |
| `origin-hero` (ordinateur) | **Ma liste** | `PUT/DELETE /api/me/list/:slug` | — | oui | my_list | F + B | **VÉRIFIÉ MILLENIUM** (jalon 3 : bouton « Ma liste » ajouté à côté de « Voir la bande-annonce », même gabarit ; clic retenu tant que la session n'est pas connue) | E2 : ajout → ligne en base, retrait, clic dès l'hydratation appliqué après chargement |
| `origin-hero` | **Regarder** | navigation `/production/$slug` | `active.id` | non | — | F | **VÉRIFIÉ MILLENIUM** pour la navigation et la lecture des programmes ayant un média (voir 2.5) | E0 (essai du 30/10, branche de l'agent front) |
| `origin-hero` | Infos | — (fiche locale) | titre, synopsis | non | — | F | **Simulé** (données locales) | — |
| `origin-hero` | Bande-annonce | `heroVideoUrl` local | vidéo d'ambiance | non | programs | F + BO | **Simulé** · gestion serveur **Absente** (seul `heroVideoUrl`) | — |

### 2.3 Accueil, catalogue, recherche, fiches
| Page / composant | Action | Route · méthode | Auth | Tables | Resp. | Statut | Preuve |
|---|---|---|---|---|---|---|---|
| Accueil : Top 10, rails, suggestions, thématiques, créateurs, univers, PTH | Afficher les collections | `GET /api/home` (+ `GET /api/programs/:slug` pour les épisodes PTH) | non | collections, programs, themes, creators, seasons, episodes | F + B | **VÉRIFIÉ MILLENIUM** (jalon 4) : les 12 sections viennent du serveur (36 programmes, 106 images, aucune image embarquée) ; retrait d'un programme par l'administration → disparaît du Top 10 ; serveur coupé → « Le catalogue est momentanément indisponible. Réessayer » (aucune donnée inventée) | E3 |
| Accueil | « Pour vous » | `GET /api/recommendations` | facultative | watch_progress, user_themes | F | **Simulé** · API seule | API testée |
| `/continuer` | Continuer à regarder (liste, « Reprendre », « Marquer comme vu », « Retirer », annuler) | `GET /api/me/continue-watching`, `PUT/DELETE /api/me/progress/:id` | oui | watch_progress | F + B | **VÉRIFIÉ MILLENIUM** pour l'affichage et la mise à jour après lecture (« 23 % · Il reste 12 min », sortie de la liste à la fin) ; retirer / marquer comme vu / annuler : code branché et testé (faux serveur), non démontré dans l'écran | E2 + tests |
| `search-overlay` | Rechercher, suggestions, correction de fautes | `GET /api/search`, `/api/search/suggestions` | non | programs | F | **Simulé** (`searchCatalog` local) · API seule | API testée |
| `/production/$slug` | Fiche, saisons, épisodes, similaires, rang | `GET /api/programs/:slug`, `/similar`, `/api/collections/top-10` | non | programs, seasons, episodes | F + B | **VÉRIFIÉ MILLENIUM** (jalon 5, ordinateur et mobile) | E4 |
| `/production/$slug` | Ma liste (bouton de la fiche) | `PUT/DELETE /api/me/list/:slug` | oui | my_list | F | **VÉRIFIÉ MILLENIUM** (mobile) | E4 : ajout → ligne en base |
| `/classement` | Classement complet | `GET /api/collections/ranking` | non | collections | F | **Simulé** · API seule | — |
| `/createur/$slug` | Univers d'un créateur | `GET /api/creators/:slug` | non | creators, creator_contents | F | **Simulé** (`creator-universes.ts`) · API seule | API testée |

### 2.4 Espace personnel
| Page | Action | Route · méthode | Auth | Tables | Resp. | Statut | Preuve |
|---|---|---|---|---|---|---|---|
| `/ma-liste` | Voir sa liste | `GET /api/me/list` | oui | my_list | F | **VÉRIFIÉ MILLENIUM** | E1 : « 1 titre — Le Silence » ; le second compte voit uniquement « Les Passagers » |
| `/ma-liste` | Retirer un titre | `DELETE /api/me/list/:slug` | oui | my_list | F | Partiel (code branché ; retrait vérifié par tests, non démontré dans cet écran) | tests faux serveur |
| `/compte` | Nom affiché | `GET /api/me` | oui | users | F | **VÉRIFIÉ MILLENIUM** (« Pilote Recette ») | E1 |
| `/compte` | Photo, appareils, préférences, historique, export | `/api/me/avatar`, `/sessions`, `/preferences`, `/history`, `/export` | oui | users, sessions, user_preferences | F | **Simulé** (stockage navigateur) · API seule | API testée |
| `/parametres` | Paramètres | `/api/me/preferences` | oui | user_preferences | F | **Simulé** · API seule | — |

### 2.5 Lecteur vidéo
| Composant | Action | Route · méthode | Auth | Tables | Resp. | Statut | Preuve |
|---|---|---|---|---|---|---|---|
| `playback-experience` | Démarrer la lecture | `GET /api/programs/:id/playback` + HLS signé | selon `PLAYBACK_REQUIRES_LOGIN` | media_assets | F | **VÉRIFIÉ MILLENIUM** (film de 15 min, 1920×1080, pause, saut, fin, aucune erreur) | E0 |
| idem | Progression périodique, pause, saut, fin, fermeture de page, sortie du lecteur | `PUT /api/me/progress/:playbackId` | oui | watch_progress | F + B | **VÉRIFIÉ MILLENIUM** (ordinateur et mobile) | E2 : envoi à 12 s sans pause ; pause → 203,6 s exactes en base ; navigation complète en lecture → +1,9 s enregistrées (keepalive) ; fin → `completed`, 900 s ; film de 85 min : saut à 2 500 s, pause → 2 504,6 s |
| idem | Reprise (`resume`) | champ de `/playback` | oui | watch_progress | F + B | **VÉRIFIÉ MILLENIUM** | E2 : reprise à 204,6 s (enregistré 203,6) ; film de 85 min repris à 2 504,6 s puis 1 814,8 s ; après fin → repart à 0,1 s ; après déconnexion/reconnexion → 34 % restauré |
| idem | Ident, repères d'intro, épisode suivant, sous-titres | champs de `/playback` | non | media_assets, subtitle_tracks | F | **Non branché** · API seule | API testée |
| idem | Choix de langue audio | — | — | — | — | **Absent** côté serveur ; l'écran le présente → à retirer | — |
| idem | Expiration du lien / erreurs | `403`, `expiresAt` | — | — | F | Partiel (`playback-recovery.ts` existe) | tests front |
| Mux signé | Lecture protégée d'un film | `https://stream.mux.com/…?token=` | — | media_assets | B | **Bloqué** (clé de signature absente) | — |

### 2.6 Back-office (agent dédié)
| Écran / parcours | Route | Statut | Preuve |
|---|---|---|---|
| Connexion + 2FA administrateur | `POST /api/auth/login`, `/api/me/2fa/*` | Partiel (écrans présents, 23 tests du back-office ; non recetté par moi) | tests BO |
| Catalogue, fiche programme, publication | `/api/admin/catalog`, `/api/admin/programs/:slug` | Partiel | idem |
| Importation vidéo (tus) et suivi | `/uploads`, `/api/admin/jobs` | Partiel · pipeline vérifié côté API avec un film de 15 min | essai du 30/10 |
| Importation Mux | `/api/admin/mux/uploads` | **Bloqué** (autorisation et clé) | — |
| Épisodes, programmation des sorties, mots-clés, repères, sous-titres, composition de la Hero | `/api/admin/*` | **Absent** côté écran · API seule | `BRIEF-BACK-OFFICE-IMPORT-PUBLICATION.md` |
| Vérifier la visibilité dans le catalogue public | — | **Non démontré** de bout en bout | — |

## 3. Dépendances entre blocs (ordre technique)
1. **Fondations** (session, erreurs, isolation) → tout le reste. ✔ fait.
2. **Hero + Ma liste** → réutilise 1. ✔ fait (mobile).
3. **Catalogue réel** (accueil, collections) → **prérequis** de : recherche, fiches, Continuer à regarder (les identifiants de lecture viennent du catalogue). Le catalogue serveur contient déjà les titres de démonstration ; il manque d'abord le branchement de l'écran.
4. **Fiches programmes** → lecture (identifiants d'épisodes) → **progression/reprise** → Continuer à regarder → espace personnel.
5. **Back-office** → alimente 3 (sans contenu réel publié, le catalogue public reste de démonstration).
Chemin critique : **catalogue réel (jalon 4) avant fiches/recherche/continuer (jalons 5–6)**.

## 4. Preuves
**E0** — branche `front/hero-immersive` (agent front), `/production/le-silence` et `/production/tout-recommencer` : lecture complète dans un navigateur réel (1920×1080, pause, reprise, saut, fin), requêtes réseau en 200.
**E1** — branche `integration/backend-hero`, front sur `http://localhost:3211`, API de recette `http://localhost:4020` (base `origin_recette` jetable, supprimée à la fin), comptes `*@origin.test` supprimés. Vue mobile (viewport 278 px) :
1. Inscription par le formulaire → `/bienvenue`. 2. Hero : visiteur qui clique « Ma liste » → `/connexion`. 3. Connecté : clic « Ma liste » sur Le Silence → bouton enfoncé, **ligne en base**. 4. Actualisation → bouton restauré (≈ 4 s en développement). 5. Changement de programme → état du bouton propre à chaque programme. 6. `/ma-liste` : « 1 titre — Le Silence ». 7. Déconnexion par l'interface → 401 serveur, sessions révoquées. 8. Mauvais mot de passe → message correct ; reconnexion → liste restaurée. 9. **Deuxième compte** : liste vide, bouton non enfoncé ; il ajoute Les Passagers ; `/ma-liste` ne montre que ce titre. 10. Reconnexion du pilote : uniquement Le Silence (rien du second). 11. Nettoyage des deux comptes (204).
Tests : back-end **280/280**, front **38/38**, typage front et back sans erreur.

## 5. Tableau de suivi (état au 30/10/2026)
### Terminé (vérifié dans MILLENIUM)
Inscription · connexion · déconnexion · session persistante · Hero « Ma liste » (mobile, par compte) · page « Ma liste » (lecture) · nom du compte · isolation de deux comptes · lecture vidéo d'un film (programmes avec média).
### Fictif ou simulé (liste exhaustive)
Données de la Hero, du Top 10, des rails, des suggestions, des univers, des créateurs, du classement · fiches programmes · recherche · Continuer à regarder · photo, appareils, préférences, historique, export · mot de passe oublié · 2FA · bande-annonce · Infos.
### Bugs et écarts connus
| # | Écart | Gravité | Responsable |
|---|---|---|---|
| 1 | ~~Pas de bouton « Ma liste » dans la Hero sur ordinateur~~ → **corrigé** (jalon 3, branche d'intégration) | — | F |
| 2 | La base de **recette** ne contient que 10 programmes : ajouter les titres du Top 10 et des rails à l'amorçage de recette avant de les tester (le catalogue de développement, lui, les contient) | Moyenne | B |
| 3 | Progression et reprise : **corrigé** (jalon 3). Restent non lus par le lecteur : ident, repères d'intro, épisode suivant (les sous-titres sont lus par le nouveau lecteur de l'agent front) | Moyenne | F |
| 4 | Après actualisation, l'état « Ma liste » met ≈ 4 s à apparaître (le clic pendant ce délai est désormais retenu et appliqué) (build de développement : hydratation + session + liste) | Faible (à re-mesurer en production) ; prévoir un état neutre pendant le chargement | F |
| 5 | « Se souvenir de moi » est ignoré : la durée de session est décidée par le serveur (30 jours) | Faible | F (retirer ou relier) |
| 6 | Soumission du formulaire avant hydratation = rechargement de la page (les champs n'ont pas d'attribut `name`, rien ne fuit dans l'URL) | Faible | F |
| 7 | Les cookies ignorent le port : deux API sur `localhost` partagent la session | Info | B (documenté) |
| 8 | Écran de langue audio présenté alors que le serveur n'a qu'une piste | Moyenne | F |
### Tâches par agent
| Agent | À faire | Transmission |
|---|---|---|
| **F (front)** | Décider de la fusion de `integration/backend-hero` ; bouton Ma liste sur ordinateur ; brancher progression/reprise/ident/sous-titres ; catalogue réel ; recherche ; `/continuer` | Messages envoyés à la session « Agent front brief » (réponse non reçue) ; **transmission à confirmer par le propriétaire** ; documents : `DEMANDES-INTEGRATION-HERO.md`, `BRIEF-FRONT-ROUTES-EXEMPLES.md`, ce fichier |
| **BO (back-office)** | Écrans composition de la Hero, repères, sous-titres, programmation, mots-clés, épisodes | Message envoyé à la session « Back-office ORIGIN phase 1 » (réponse non reçue) |
| **B (back-end)** | Amorçage complet de la recette ; tenir les tests ; film de 85 min ; Mux signé dès la clé | — |
### Prochaines actions
1. Jalon 3 : brancher la progression et la reprise dans le lecteur (branche d'intégration, même méthode : magasin + tests + preuve navigateur).
2. Jalon 4 : remplacer l'accueil statique par `GET /api/home` ; compléter l'amorçage de la base de recette avec le catalogue complet.
3. Remonter à l'agent front le point n°1 (bouton Ma liste sur ordinateur).

## 6. Jalon 3 — compte rendu (30/10/2026, soir)
**Preuve E2** — branche `integration/backend-hero` (tip `43fb5ca`, contient le dernier commit de l'agent front `666af6b` : nouveau lecteur), front `:3211`, API de recette `:4020` (base jetable supprimée à la fin), comptes `*@origin.test` jetables. **Ordinateur 1366×800 et mobile 375×812.**
- **Ordinateur, Alice** : inscription par le formulaire → Hero « Ma liste » (bouton desktop) → « Regarder maintenant » → fiche → « Regarder » → lecture HLS (900 s) → progression envoyée toutes les 12 s **sans aucune pause** → saut → **pause par le bouton du lecteur : 203,6 s en base** → « Retour au programme » → `/continuer` : « Le Silence · 23 % · Il reste 12 min » → « Regarder » : **la lecture repart à 204,6 s** → **navigation de page complète en cours de lecture : 223,1 s en base** (la page a quitté à 221,2 s) → fin du film : `completed`, 900 s, retiré de « Continuer », bouton « rewatch » → nouvelle lecture repart à 0,1 s → pause à 303,2 s → **déconnexion par l'interface → reconnexion → `/continuer` : 34 % · Il reste 10 min**.
- **Mobile, Bob** : inscription → liste, progression, « Continuer » **vides**, bouton « start » → trio « Ma liste » sur Les Passagers → **film de 85 min** : durée 85,1 min, saut à 2 500 s, pause → 2 504,6 s en base (durée serveur 5 103,3 s) → `/continuer` : « Les Passagers · 49 % · Il reste 44 min » → reprise exactement à 2 504,6 s.
- **Isolation (lue en base)** : Alice `{le-silence 303,2 s ; liste le-silence}`, Bob `{les-passagers 2 504,6 s ; liste les-passagers}` — aucune ligne croisée.
- **Session expirée pendant la lecture** (session de Bob invalidée côté serveur) : la vidéo continue sans interruption (42 s observées), aucune alerte, les envois s'arrêtent après les 401 (3 requêtes au total, pas de boucle).
- **Nouveau lecteur de l'agent front** (commandes TV, pastilles de qualité) : pause 1 814,8 s en base, reprise à 1 814,8 s — **aucune régression** après fusion.
- **Tests** : front **51/51**, typage sans erreur ; back-end **280/280**.

### Limites du jalon 3 (déclarées)
- Aucun message visible quand la session expire pendant la lecture : la progression s'arrête sans bruit jusqu'à la reconnexion (à proposer à l'agent front : toast non bloquant).
- Le bouton de la fiche programme reste « Regarder » même quand un `resume` existe (la lecture, elle, reprend bien) ; `GET /api/programs/:slug/play-target` peut fournir le libellé « Reprendre ».
- « Retirer » / « Marquer comme vu » / « Annuler » de `/continuer` : branchés et testés avec un faux serveur, non cliqués dans l'écran.
- Non branchés : ident de marque, « Passer l'intro », épisode suivant, choix audio (absent côté serveur).
- Séries (plusieurs épisodes) : non testées dans l'interface (aucun programme-série avec médias en recette).
- Navigateur : Chromium seulement ; Safari/Firefox non testés (l'envoi `keepalive` à la fermeture y est le point à surveiller).

## 7. Jalon 4 — Accueil et collections réelles (30/10/2026, soir)
**Preuve E3** — branche `integration/accueil` (tip `bfdc575`, contient le dernier commit de l'agent front `3c82ba1` : F4 et F7), front `:3211`, API de recette `:4020` (catalogue **copié** de la base de développement, comptes jetables, base supprimée à la fin). Ordinateur 1366×800 et mobile 375×812.
- **Toutes les sections de l'accueil viennent du serveur** : hero (10), Top 10 (14), suggestions (8), univers (5), PTH (4 épisodes de la dernière saison), 5 rails (Nouveautés, Suspense, Drama, Couple, Science-Fiction), 5 créateurs, 12 thématiques. **106 images, toutes servies par l'API ; 0 image embarquée**. Les 36 titres de l'API sont présents dans la page, mobile comme ordinateur.
- **Preuve que ce n'est pas du décor** : (1) l'administration modifie l'accroche et le synopsis du Silence → la Hero affiche le nouveau texte après rechargement ; (2) l'administration retire « Gladiator » → il disparaît du Top 10 ; (3) API coupée → écran d'erreur avec « Réessayer », **aucune donnée de remplacement** ; API relancée + clic → l'accueil revient.
- **Continuité entre blocs** : bouton « + » du Top 10 sur « Gladiator » → ligne en base (`my_list`) → page « Ma liste » : « Gladiator » avec son visuel serveur ; bouton Ma liste du trio mobile sur le Silence → 2 titres côté serveur ; l'explorateur de thématiques (clic « Couple ») lit les fiches serveur.
- **Correctifs** : (1) back-end : `GET /api/me/continue-watching` renvoie maintenant la fiche `program` de chaque ligne (contrat v1.11) — « Continuer à regarder » n'a plus besoin du catalogue embarqué ; (2) front : champs réels des épisodes (`id`, `durationLabel`) — repéré grâce à un avertissement React ; (3) un test de conformité s'appuie désormais sur une **vraie réponse de l'API** (fixture) pour qu'une faute de nom de champ ne passe plus inaperçue ; (4) recette : le catalogue complet est copié automatiquement (`scripts/recette/seed-catalog.ts`).
- **Tests** : front **56/56**, typage sans erreur ; back-end **280/280**.
### Limites déclarées (jalon 4)
- **Textes éditoriaux des thématiques** (sous-titre « Sens et vie intérieure », fiche « phare » de chaque thème) : restent une configuration du front (`themeShowcase`) ; ils n'existent pas côté serveur. Les 3 thèmes absents du rail (Relations, Leadership, Société) sont dans la grille « Toutes les thématiques ».
- **Palettes de couleurs** des cartes du Top 10 : toujours calculées par le front à partir de l'identifiant (le serveur n'en fournit pas).
- **Pages `/production/:slug`**, **`/classement`**, **recherche** : les 36 pages s'ouvrent (aucune en échec), mais leur contenu est celui du catalogue embarqué → jalon « fiches programmes ». La recherche réelle (F7) est faite par l'agent front : **non vérifiée par moi à ce stade**.
- Chargement : le catalogue est demandé avant l'affichage (rendu côté serveur) ; mesure de fluidité non faite (build de développement).
- Navigateur : Chromium uniquement.

## 8. Jalon 5 — Fiches programmes réelles (30/10/2026, soir)
**Preuve E4** — branche `integration/accueil` (tip `96437db`, contient le dernier commit de l'agent front `0fe9acb`), front `:3211`, API de recette `:4020` (catalogue copié ; série PTH avec 2 épisodes jouables ; base supprimée à la fin). Ordinateur 1366×800 et mobile 375×812.
- **La fiche vient du serveur** (route `/production/:slug`) : titre, synopsis, saisons et épisodes (8 épisodes de la série PTH, 2 saisons), badges, durées, visuels (0 image embarquée), rangée « Vous pourriez aussi aimer » (fiches du serveur, 7 titres pour la série, 8 pour Gladiator) et **rang au classement** (« N° 1 » sur Gladiator, lu dans `/api/collections/top-10`).
- **Cas limites** : programme inconnu → « Ce programme est introuvable. » (404) ; **API coupée → écran « Cette page n'a pas pu se charger… Réessayer », aucune fiche inventée**.
- **Série (Eve)** : le bouton principal démarre au premier épisode **jouable** (« Regarder l'épisode 7 », décidé par le serveur) → lecture → pause à 10,3 s sur 15,1 s → rechargement : **« Reprendre l'épisode 7 »**, la ligne de l'épisode affiche « 1 min restantes » avec une barre à 68 % (progression réelle de l'épisode) → « Marquer comme vu » sur l'épisode 7 : **`completed` en base**, la ligne devient « Déjà vu » et **le reste après rechargement** → le bouton principal passe à **« Regarder l'épisode 8 »** (état `next` du serveur) et « Continuer à regarder » est vide.
- **Film sur mobile** : bouton « Ma liste » de la fiche → ligne en base ; lecture → pause à 303,2 s enregistrée.
- **Correctifs** : (1) **back-end** : `GET /api/programs/:slug/play-target` renvoie maintenant l'épisode avec `key` et `seasonNumber` (contrat v1.12) — sans cela, le bouton « Reprendre l'épisode N » de l'agent front ne trouvait jamais l'épisode d'une série ; (2) front : forme réelle de `/similar` (`{items:[{program, reason}]}`) — repérée par un test sur une **vraie réponse** (fixtures) ; (3) recette : dossier vidéo propre à la recette (liens vers le stockage de développement, jamais d'écriture) et deux épisodes de test.
- **Tests** : front **63/63** (7 nouveaux), typage sans erreur ; back-end **280/280**.
### Limites déclarées (jalon 5)
- **Libellé du bouton principal non rafraîchi** quand on revient du lecteur sans recharger la page (il affiche encore « Regarder l'épisode 7 » ; après rechargement, « Reprendre l'épisode 7 ») : `usePlayTarget` (fichier de l'agent front) ne relit le serveur qu'au chargement → **demande transmise à l'agent front**.
- Le panneau « Audio et sous-titres » de la fiche liste encore des choix fixes (Français/English/Audiodescription) qui n'existent pas côté serveur (une seule piste audio) → à retirer (agent front).
- Épisodes sans média : la lecture répond « pas encore disponible » ; la fiche ne les marque pas encore comme tels (le serveur fournit `playable` par épisode).
- Titre de l'onglet « Programme introuvable » pendant une panne (le serveur coupé est vu comme une fiche absente par le titre ; la page, elle, affiche bien l'erreur).
- `/classement` et la recherche (F7, agent front) : non traités ici. Chromium seulement. Le Silence n'a pas de saison ni d'épisode « série » : un film est une saison d'un épisode (`feature`).

## 9. Recette navigateur du 31/10/2026 — sommet front local `1449774` (mode TV, Hero tablette), API réelle + PostgreSQL jetable
Environnement isolé (ports 4020/3211, base `origin_recette` supprimée ensuite), deux comptes `*@origin.test` jetables, desktop 1440×900 puis mobile 375×812. Tests front : 70/70, `tsc` propre.

| Parcours | Desktop | Mobile | Preuve |
|---|---|---|---|
| Inscription | ✅ (formulaire, case conditions) | — | compte créé, écran « Bienvenue » |
| Connexion | ✅ | ✅ (compte A, formulaire) | `/api/me` identifie le compte |
| Déconnexion | ✅ (boîte de confirmation « Se déconnecter ») | ✅ (API) | `/api/me` → 401 |
| Catalogue / collections | ✅ (Hero, Top 10, thématiques réels) | ✅ | requêtes `:4020`, aucun appel 127.0.0.1 |
| Recherche | ✅ « pasagers » → « passagers » corrigé | ✅ « silance » → « silence » | `/api/search` |
| Fiche programme | ✅ | ✅ | boutons Regarder/Reprendre/Ma liste |
| Ma liste | ✅ ajout, persistance au rechargement | ✅ liste de A visible sur un autre appareil | `/api/me/list` |
| Lecture | ✅ (85 min réel, HLS) | ✅ (reprise à ~34 s, 480p) | `video.currentTime`, pas en pause |
| Progression / reprise | ✅ envoi pendant la lecture + à la fermeture | ✅ « Reprendre » repart de la position | `continue-watching` 22,7 s puis 41,8 s |
| Continuer à regarder | ✅ (menu, page compte) | ✅ | compteur 1, « il reste 85 min » |
| Espace personnel | ✅ `/compte` (profil, ma liste, continuer) | ✅ `/ma-liste` | texte de page |
| Isolation 2 comptes | ✅ B : liste 0, reprises 0 | — | API |

**Écarts constatés (front, non bloquants)** : (1) à l'ouverture d'une fiche, les boutons affichent « Regarder / Ajouter à ma liste » pendant 4–8 s en dev avant de passer à « Reprendre / Retirer » (session + liste chargées après coup) ; (2) la recherche ne tolère pas une faute DANS un mot incomplet (« passagr » → rien ; « pasagers » ou « passag » → ok) — amélioration back possible ; (3) le lecteur n'envoie pas encore la mesure de lecture (jeton v1.15 à brancher) ; (4) 5 commits front (mode TV, Hero tablette) existent seulement en local chez l'agent front : l'agent attend l'accord de son utilisateur pour pousser.

## 10. Recette du 31/10/2026 (suite) — classement, catégories, Tendances (API v1.17, front `integration/classement-themes` `71a5a86`)
Parcours réel Accueil → Classement → fiche (Les Passagers) → Ma liste → lecture (12 s, progression `les-passagers`) → retour accueil → recherche « passagers » → même fiche avec « Reprendre » + « Retirer de ma liste » : ✅ desktop. Depuis une catégorie (Identité → La Reine guerrière en phare de repli ; Foi → Le Trône) et depuis Tendances (→ Les Passagers, bon slug, lecture ✅) : ✅ desktop. Mobile 375 px : classement (36 cartes, pas de défilement horizontal), fiche, Ma liste, lecture du Silence, catégorie Identité ✅ ; « Tendances » n'existe pas en mobile.
États : API arrêtée → « momentanément indisponible » + Réessayer ✅ ; programme sans média → message explicite ✅ ; compte neuf → listes vides ✅.
**Défaut corrigé pendant la recette** : le phare configuré `tout-recommencer` n'appartenait à aucune thématique serveur, donc absent de sa liste → le phare doit désormais être membre de la thématique (sinon repli).
**Données à compléter** : `demo-b4` (reliquat de test, publié) et `tout-recommencer` sont publiés sans visuel ni catégorie.

## 11. Jalon du 31/10/2026 (suite) — remontée de lecture, consolidation, états de chargement
**Branche consolidée isolée** : `consolidation/millenium` (dépôt `app/`, commit `8cf0dbd`) = `front/integration-hero` de l'agent front (9011d2a : mode TV, « Qui regarde ? ») **+** `integration/classement-themes` (classement, thématiques, Tendances, mesure de lecture, états de chargement). Fusion **sans aucun conflit** ; la branche de l'agent front n'a pas été modifiée. `tsc` propre, 85 tests, `vite build` OK.
**Validé dans le navigateur sur cette branche (API réelle + PostgreSQL jetable, 3 comptes jetables : A, B, visiteur)** : connexion par formulaire → « Qui regarde ? » → accueil → recherche (« silance » corrigé) → fiche → Ma liste → lecture → progression → fin de programme → rejouer (« Revoir ») → classement. Données en base : 8 lectures = 8 lignes `playback_sessions` (une par lecture, aucun doublon ; temps regardé cohérent ; qualités 480/720/1080 ; appareil `mobile` sur l'émulation Android) ; `watch_progress` par compte ; fin de programme `completed = true` puis repassé en cours après « Revoir » ; visiteur : mesure oui, progression non ; compte B isolé de A ; tendances « Populaire en ce moment » pour les deux programmes réellement lus.
**Séparation** : mesure anonyme (`playback-stats.ts` → `POST /api/playback-sessions`, jeton v1.15, cumulative toutes les 15 s si changement, `sendBeacon` à la fermeture) ≠ progression personnelle (`progress-reporter.ts` → `PUT /api/me/progress/…`, comptes connectés, toutes les 12 s). Un seul système de statistiques.
**États de chargement** : bouton principal « Chargement… » (indicateur discret, largeur constante, `aria-busy`) tant que session/reprise sont inconnues ; connexion lente simulée (+4 s sur `play-target`) : pas de faux libellé, pas de décalage ; visiteur : « Regarder » immédiat ; échec réseau : libellé local.
**À noter** : une requête `/playback` est émise deux fois à ~10 ms (effet relancé en développement ; non reproduit comme problème en production, à confirmer sur un build) ; une session navigateur a disparu une fois sans cause identifiée (non reproduite en 3 essais).
