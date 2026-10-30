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
| `origin-hero` | Afficher les 10 programmes | (`GET /api/collections/hero`) | titre, synopsis, visuels | non | programs, collections | F | **Simulé** (fichier local ; les 10 identifiants sont identiques à ceux du serveur) | comparaison d'identifiants |
| `origin-hero` | Sélectionner un autre programme | — (état local) | `active.id` | — | — | F | **VÉRIFIÉ MILLENIUM** (le bouton Ma liste suit le programme actif) | E1 : Silence ↔ Passagers, état du bouton correct à chaque fois |
| `origin-hero` (mobile) | **Ma liste** | `PUT/DELETE /api/me/list/:slug`, `GET /api/me/list` | slug | oui | my_list | F + B | **VÉRIFIÉ MILLENIUM** | E1 : ajout → ligne en base ; actualisation → bouton restauré ; retrait possible |
| `origin-hero` (visiteur) | Ma liste sans compte | — | — | non | — | F | **VÉRIFIÉ MILLENIUM** (renvoi vers `/connexion`) | E1 |
| `origin-hero` (ordinateur) | Ma liste | — | — | — | — | F | **Absent** : le bouton « Ma liste » n'existe que dans la disposition mobile (`hero-trio`) ; sur ordinateur seuls « Regarder maintenant » et « Voir la bande-annonce » apparaissent | lecture du code |
| `origin-hero` | **Regarder** | navigation `/production/$slug` | `active.id` | non | — | F | **VÉRIFIÉ MILLENIUM** pour la navigation et la lecture des programmes ayant un média (voir 2.5) | E0 (essai du 30/10, branche de l'agent front) |
| `origin-hero` | Infos | — (fiche locale) | titre, synopsis | non | — | F | **Simulé** (données locales) | — |
| `origin-hero` | Bande-annonce | `heroVideoUrl` local | vidéo d'ambiance | non | programs | F + BO | **Simulé** · gestion serveur **Absente** (seul `heroVideoUrl`) | — |

### 2.3 Accueil, catalogue, recherche, fiches
| Page / composant | Action | Route · méthode | Auth | Tables | Resp. | Statut | Preuve |
|---|---|---|---|---|---|---|---|
| Accueil : Top 10, rails, suggestions, thématiques, créateurs, univers | Afficher les collections | `GET /api/home`, `/api/collections/:slug`, `/api/themes` | non | collections, programs, themes, creators | F | **Simulé** (modules `origin-*.ts`) · API seule. Vérifié : les titres du Top 10 (`gladiator`, `damnes`, `acteurs`, `au-dela`) **existent** dans le catalogue du serveur de développement (200) ; la base de **recette** ne contient que les 10 programmes de la Hero, donc leur ajout y serait refusé (404) — à compléter avant de recetter le Top 10 | vérification d'identifiants |
| Accueil | « Pour vous » | `GET /api/recommendations` | facultative | watch_progress, user_themes | F | **Simulé** · API seule | API testée |
| Accueil / `/continuer` | Continuer à regarder | `GET /api/me/continue-watching` | oui | watch_progress | F | **Simulé** (`demo-space.progress`) · Recette indépendante | recette 28/28 |
| `search-overlay` | Rechercher, suggestions, correction de fautes | `GET /api/search`, `/api/search/suggestions` | non | programs | F | **Simulé** (`searchCatalog` local) · API seule | API testée |
| `/production/$slug` | Fiche, saisons, épisodes | `GET /api/programs/:slug` | non | programs, seasons, episodes | F | **Simulé** (`productions.ts`, `watch-catalog.ts`) · API seule | — |
| `/production/$slug` | Ma liste (bouton de la fiche) | idem 2.2 | oui | my_list | F | Partiel (même magasin que la Hero, non démontré sur cette page) | tests faux serveur |
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
| idem | Progression périodique et à la fermeture | `PUT /api/me/progress/:playbackId` | oui | watch_progress | F | **Non branché** · Recette indépendante (28/28 dont fermeture de page) | recette |
| idem | Reprise (`resume`) | champ de `/playback` | oui | watch_progress | F | **Non branché** · Recette indépendante | recette |
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
| 1 | Pas de bouton « Ma liste » dans la Hero **sur ordinateur** | Élevée (le cahier le demande) | F |
| 2 | La base de **recette** ne contient que 10 programmes : ajouter les titres du Top 10 et des rails à l'amorçage de recette avant de les tester (le catalogue de développement, lui, les contient) | Moyenne | B |
| 3 | Progression/reprise/ident/sous-titres/suivant non lus par le lecteur | Élevée | F |
| 4 | Après actualisation, l'état « Ma liste » met ≈ 4 s à apparaître (build de développement : hydratation + session + liste) | Faible (à re-mesurer en production) ; prévoir un état neutre pendant le chargement | F |
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
