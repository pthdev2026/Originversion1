# ORIGIN — Analyse globale front ↔ back-end (30/10/2026)

Méthode : lecture du dépôt front `app/` (branche `front/page-film-reco`, dernier commit du 30/10/2026), comparaison avec la branche connectée `front/comptes-securite` (21/10/2026) et avec les routes réelles de l'API (contrat v1.4). Rien n'est supposé : chaque ligne vient d'un fichier lu.

## 1. Verdict en cinq lignes
1. **Le nouveau front « Millenium » (Lovable + refonte du 30/10) n'est connecté à rien.** Aucun appel réseau, aucun lecteur vidéo, aucune authentification réelle : tout est en données de démonstration (comptes, listes, progression, appareils, préférences) stockées dans le navigateur.
2. **Le travail de branchement existe, mais sur d'autres branches** (`front/catalogue-*`, `front/comptes-*`) **qui n'ont pas été fusionnées** dans la ligne Millenium. C'est de la **dette d'intégration**, pas un manque du back-end.
3. **Le back-end couvre déjà environ les deux tiers** de ce que le front affiche (catalogue, recherche, similaires, comptes, e-mail, 2FA, liste, reprise, export, suppression, lecture, sous-titres, ident, statistiques).
4. **Il manque au back-end** l'« espace compte » de Millenium (photo, appareils, préférences, historique, thématiques préférées, changement d'e-mail, nom affiché) et le **modèle des univers de créateurs** (nouveau).
5. **Hors de portée aujourd'hui** (décisions à prendre) : connexion Google/Apple, direct (« live »), versions audio multiples, interface en anglais pour les contenus, vraies notifications.

---

## 2. Deux lignes de front qui ne se parlent pas
| | Ligne **Millenium** (courante) | Ligne **connectée** (`front/comptes-securite`) |
|---|---|---|
| Origine | `origin/main` (Lovable) + refonte du 30/10 | Travail de l'agent front du 15 au 21/10 |
| Design | Nouveau (accueil immersif, Top 10, page programme plein écran, classement, espace compte, univers de créateur, recherche plein écran, menu flottant, pied de page, FR/EN) | Ancien design |
| Appels à l'API | **Aucun** | Catalogue, accueil, fiche, recherche, similaires, comptes (connexion, inscription, mot de passe, e-mail, export) |
| Lecteur vidéo | **Absent** (aucun `hls.js`, aucune balise `<video>` de lecture ; seules des vidéos d'aperçu) | Présent (`use-hls.ts`, reprise après erreur) |
| Comptes | **Faux** : `demo-accounts`, `demo-session` (navigateur seulement ; un mot de passe de démo figure dans le code) | Réels (`auth-api`, `auth-context`, pages `reinitialiser`, `verifier-email`) |
| Données de l'espace | **Faux** : `demo-space` (liste, progression, appareils, préférences) | — |

**Fichiers de la ligne connectée absents de la ligne Millenium** (à porter) : `auth-api.ts`, `auth-context.tsx`, `catalog-api.ts`, `home-data.ts`, `origin-api.ts`, `program-data.ts`, `use-catalog-search.ts`, `use-hls.ts`, `playback-recovery.ts`, `env.ts`, `brand.ts` ; pages `reinitialiser`, `verifier-email` ; composants `account-security`, `account-panel`, `account-fields`, `origin-intro`.
Aucune des deux lignes ne branche : la **reprise de lecture**, **« Ma liste »** réelle, l'**ident**, la **mesure de lecture**, les **sous-titres**, la **double authentification**.

---

## 3. Inventaire fonction par fonction
Légende back-end : ✅ prêt · 🟡 partiel · ❌ absent. Légende front : 🔌 branché sur l'API · 🎭 démonstration · — sans objet.

### 3.1 Accueil, catalogue, recherche
| Fonction (front Millenium) | Back-end | Front | Écart |
|---|---|---|---|
| Hero, Top 10, suggestions, univers, rails, thématiques | ✅ `GET /api/home` | 🎭 | Front : brancher |
| Classement complet (filtre par famille, pages de 20) | ✅ une collection de 100 titres suffit (`PUT /api/admin/collections/ranking`) ; famille = `category` | 🎭 | Front : brancher ; éditorial : remplir la collection |
| Recherche plein écran, filtres par type | ✅ `GET /api/search` (le type = `kind`) | 🎭 | Front : brancher |
| Aperçus vidéo au survol (hero, rangées) | ✅ `heroVideoUrl` + `/images/…mp4` | 🎭 (assets locaux) | Front : brancher |
| Rangée « films recommandés » sur la page film | ✅ `GET /api/programs/:slug/similar` | 🎭 | Front : brancher |
| « Pour vous » | ✅ `GET /api/recommendations` | absent | Front : brancher |

### 3.2 Page programme et lecture
| Fonction | Back-end | Front | Écart |
|---|---|---|---|
| Fiche, saisons, épisodes, `playable` | ✅ `GET /api/programs/:slug` | 🎭 | Front |
| **Lecture vidéo** | ✅ `GET /api/programs/:id/playback` (origine, Bunny, **Mux**) | **❌ aucun lecteur** | **Front : porter `use-hls`** (bloquant) |
| Choix de sous-titres (Aucun / Français / English) | ✅ pistes WebVTT par langue | 🎭 | Front + contenus : déposer les fichiers |
| **Choix de la langue audio** | ❌ une seule piste audio (notre pipeline ne produit pas d'audio multiple ; Mux le permettrait) | 🎭 | **Décision** (voir §5) |
| Ident ORIGIN, reprise, mesure de lecture | ✅ | absent | Front |

### 3.3 Authentification
| Fonction | Back-end | Front | Écart |
|---|---|---|---|
| Inscription, connexion, déconnexion | ✅ | 🎭 (comptes de démonstration) | Front : porter `auth-api` |
| Mot de passe oublié / réinitialisation | ✅ + e-mail (Resend, non validé en réel) | 🎭 (la page réelle existe sur l'autre ligne) | Front |
| Vérification d'adresse e-mail | ✅ | page sur l'autre ligne | Front |
| Double authentification (écran) | ✅ | absent | Front |
| **Connexion Google / Apple** (bascule visible dans « Connexion & sécurité ») | ❌ | 🎭 | **Décision** : demande des comptes développeur Google/Apple |
| Page « Bienvenue » → « Choisir mes thématiques préférées » | ❌ thématiques préférées non stockées | 🎭 | **Back-end : à construire** |

### 3.4 Espace compte (« Votre espace ») — la plus grosse lacune
| Fonction | Back-end | Front | Écart |
|---|---|---|---|
| Nom affiché, modifier | ❌ (à l'inscription seulement) | 🎭 | **Back-end : `PATCH /api/me`** |
| Date d'inscription (« membre depuis ») | 🟡 en base, non exposée | 🎭 | **Back-end : exposer** |
| **Photo de profil** (import, recadrage, avatars prédéfinis, retrait) | ❌ | 🎭 | **Back-end : à construire** |
| **Changement d'adresse e-mail par code à 6 chiffres** (avertit l'ancienne adresse) | ❌ | 🎭 | **Back-end : à construire** |
| Changement de mot de passe | ✅ `POST /api/me/password` (déconnecte les autres appareils) | 🎭 | Front |
| **Appareils connectés** (liste, déconnecter, « déconnecter tous les autres ») | ❌ les sessions existent mais ne sont ni listées ni nommées | 🎭 | **Back-end : à construire** (nom d'appareil approximatif, jamais d'adresse IP) |
| Ré-authentification pour changements sensibles (« si connexion de plus de 15 min ») | 🟡 mot de passe actuel déjà exigé pour changer le mot de passe | 🎭 | Règle à préciser |
| **Historique de visionnage** (activer/désactiver) | ❌ | 🎭 | **Back-end : à construire** |
| **Préférences** (aperçus auto, épisode suivant, qualité, sous-titres, taille, animations, e-mails…) | ❌ | 🎭 | **Back-end : à construire** |
| Ma liste (ajout/retrait/affichage) | ✅ (+ fiches) | 🎭 | Front |
| Continuer à regarder (reprise, retirer, « marquer comme vu ») | ✅ ; 🟡 le libellé « Épisode 6 · Saison 2 » n'est pas fourni | 🎭 | **Back-end : ajouter l'épisode** |
| **Mes données** (« Demander une copie ») | ✅ `GET /api/me/export` | 🎭 | Front |
| **Supprimer mon compte** (le front demande de taper SUPPRIMER) | ✅ mais **exige le mot de passe** | 🎭 | **Incohérence** : l'écran ne demande pas le mot de passe |
| Langue de l'interface FR/EN | ❌ préférence non stockée ; contenus uniquement en français | 🎭 (menus seulement) | Back-end : stocker la préférence ; contenus EN = décision |
| Notifications (nouveaux épisodes, nouveautés, e-mails) | ❌ ni envoi ni préférence | 🎭 | Préférence à stocker ; **envoi = chantier à part** |

### 3.5 Univers des créateurs (nouveau)
Page `/createur/:slug` : alias, domaine, accroche, **couleur d'ambiance**, **chapitres éditoriaux**, contenus par type (**message, conférence, série, direct**), mise à la une, indication « En direct » avec créneau.
| Fonction | Back-end | Écart |
|---|---|---|
| Liste des créateurs (nom, photo, thèmes, ambiance) | ✅ `GET /api/creators` | — |
| **Page d'un créateur** (alias, domaine, accroche, couleur, chapitres) | ❌ le modèle n'a que nom, titre d'émission, présentation, thèmes, ambiance, photo | **Back-end : à construire** |
| **Contenus rattachés à un créateur**, classés par type, avec mise en avant | ❌ aucun lien créateur ↔ programmes | **Back-end : à construire** |
| **Direct (« live »)** : annonce d'un créneau | ❌ ; et **diffusion en direct** absente (Mux la propose, non intégré) | Annonce : à construire ; diffusion : **décision** |

### 3.6 Pied de page, aide, contact
| Fonction | Back-end | Écart |
|---|---|---|
| Pages légales (conditions, confidentialité, cookies, mentions) | — | À rédiger par le propriétaire (juridique) ; le front les marque « provisoires » |
| « Nous contacter », centre d'aide | ❌ aucune route de contact | **Back-end : formulaire de contact** (petit) |

---

## 4. Ce qui ne fonctionne pas côté back-end (à faire, par priorité)
| # | Chantier | Pourquoi d'abord |
|---|---|---|
| **A** | **Espace compte** : `PATCH /api/me`, date d'inscription, préférences, appareils, historique (activer/effacer), thématiques préférées (et recommandations dès l'inscription), photo/avatar, changement d'e-mail par code, épisode dans « Continuer à regarder » | Page la plus visible du nouveau design, entièrement simulée |
| **B** | **Univers de créateur** : modèle (alias, domaine, accroche, couleur, chapitres), contenus par type, annonce de direct, route publique et administration | Fonction nouvelle, sans aucune base côté serveur |
| **C** | Formulaire de contact | Petit, indépendant |
| **D** | Journal des modifications (B3 du back-office) | Déjà prévu |
| — | Connexion Google/Apple, direct, audio multiple, EN des contenus, notifications | **Décisions du propriétaire**, voir §5 |

## 5. Décisions que seul le propriétaire peut prendre
1. **Connexion Google/Apple** : oui ou non ? (Il faut un compte développeur pour chacun ; Apple est payant. Le bouton est déjà dans l'écran.)
2. **Direct** : annoncer seulement un créneau (simple) ou diffuser réellement en direct (chantier complet, via Mux) ?
3. **Audio en plusieurs langues** (VF/VO) : nécessaire à court terme ? (Mux le permet ; notre pipeline FFmpeg demande un développement.)
4. **Interface et contenus en anglais** : l'interface seule ou aussi les titres/résumés (traduction éditoriale) ?
5. **Notifications par e-mail** (nouveaux épisodes, nouveautés) : à construire plus tard ; que veut-on promettre dans l'écran « Préférences » d'ici là ?
6. **Pages légales** : à rédiger avant l'ouverture.

## 6. Ce qui revient à l'agent front (hors du périmètre back-end)
1. **Fusionner les deux lignes** : porter dans la ligne Millenium les clients API et le lecteur (liste du §2), puis remplacer `demo-session` et `demo-space` par `/api/me/*`. **Sans cela, le nouveau design reste une maquette.**
2. Faire demander le **mot de passe** à la suppression du compte (ou demander au back-end une autre confirmation).
3. Retirer le **mot de passe de démonstration** du code livré.
4. Brancher : recherche, similaires, « Pour vous », reprise, ident, mesure de lecture, sous-titres, double authentification.

## 7. Exécution
Les chantiers **A** puis **B** puis **C** sont engagés côté back-end ; chacun est livré avec tests, contrat d'API versionné (v1.5…) et mise à jour du dossier de contexte. Voir `docs/DECISIONS.md` pour le détail livré.
