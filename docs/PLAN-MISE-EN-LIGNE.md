# ORIGIN — Plan de mise en ligne (30/10/2026)

Objectif : passer de « tout marche en local » à **1 000 personnes réelles qui regardent de vraies vidéos**, sans mauvaise surprise. Principe : **on ouvre par cercles de plus en plus larges, et on ne passe au cercle suivant que si les critères de sortie sont verts.** Détail technique pas à pas : `docs/DEPLOIEMENT.md` · exploitation : `docs/EXPLOITATION.md` · variables : `contexte-agents/09-exploitation-et-deploiement.md`.

## 0. Ce qui n'a jamais été vérifié (donc ce que ce plan doit prouver)
1. Les **images Docker n'ont jamais été construites** (pas de Docker sur le poste de développement).
2. **Aucun e-mail réel** n'a été envoyé (fournisseur Resend non branché).
3. **Aucun HTTPS / nom de domaine / cookie `__Host-`** réel : le comportement du cookie de session entre le front et l'API en production n'est testé qu'en local.
4. **Mux** : essayé sur une vidéo de 4 secondes seulement ; lecture « signée » jamais essayée ; conditions d'utilisation et résidence des données non lues.
5. **Bunny** : intégration écrite et testée contre un faux, jamais contre un vrai compte.
6. Le front « Millenium » **n'est branché sur rien** (brief : `docs/BRIEF-AGENT-FRONT-BRANCHEMENT.md`).
7. Charge testée en local uniquement (0 % d'échec, mais sur une seule machine qui fait aussi tourner le test).

## 1. Décisions à prendre AVANT de commencer (vous)
| # | Décision | Ma recommandation |
|---|---|---|
| 1 | **Voie vidéo** : Mux seul, ou notre chaîne (FFmpeg + Bunny), ou les deux ? | **Mux d'abord** pour la bêta (zéro serveur vidéo à gérer). Notre chaîne reste prête si les coûts Mux deviennent trop élevés. |
| 2 | **Nom de domaine** (ex. `origin.xxx`) | À acheter maintenant ; front et API doivent partager le même domaine (`origin.xxx` + `api.origin.xxx`) pour le cookie de session |
| 3 | **Hébergeur du serveur** (Europe) | Un VPS 4 vCPU / 8 Go / 160 Go (≈ 10–20 €/mois) chez un hébergeur européen (Hetzner, OVH, Scaleway) |
| 4 | **Hébergement du front** | Là où Lovable le publie, rattaché au même domaine ; à confirmer avec l'agent front |
| 5 | **Inscription** : ouverte ou sur invitation pendant la bêta | **Sur invitation** (`REGISTRATION_MODE=invite`) jusqu'à la phase 5 |
| 6 | **Pages légales** (conditions, confidentialité, cookies, mentions) | À rédiger/faire valider **avant la phase 5** (données personnelles réelles collectées) |

## 2. Comptes à créer (vous, une fois les décisions prises)
Je ne peux pas les créer ni saisir vos mots de passe. Pour chacun, vous me donnez seulement ce qui va dans `deploy/.env.production` (jamais dans le chat si possible : dépôt direct sur le serveur).
| Compte | Pour quoi | Remarque |
|---|---|---|
| Registrar de domaine | Nom de domaine | DNS : enregistrements `A` vers le serveur |
| Hébergeur (VPS) | Machine unique | Clé SSH, pare-feu 22/80/443 |
| **Resend** (e-mail) | Vérification d'adresse, mot de passe oublié, alerte de connexion, contact | Vérifier le domaine d'envoi (SPF, DKIM) sinon les e-mails finissent en spam |
| **Mux** | Vidéo (voie recommandée) | **Régénérer le jeton** : l'ancien est passé par une conversation. Créer une **clé de signature** pour la lecture `signed`. |
| Bunny (si voie n°2) | CDN | Pas nécessaire si Mux seul |
| GitHub | Déjà en place | — |

## 3. Les phases

### Phase 1 — Serveur nu et sécurisé (½ journée)
Faire : VPS, pare-feu (22/80/443), utilisateur non-root, mises à jour automatiques, Docker, DNS `api.origin.xxx`.
**Sortie verte :** connexion SSH par clé uniquement ; `docker run hello-world` OK ; le nom de domaine pointe sur le serveur.

### Phase 2 — API en ligne (pré-production) (1 journée)
Faire : `deploy/.env.production` (secrets générés sur le serveur, `BACKUP_PASSPHRASE` et `AUTH_ENCRYPTION_KEY` **copiés hors du serveur** — leur perte est irrécupérable), `docker compose up -d --build`, premier administrateur, `REQUIRE_ADMIN_2FA=true`, `REGISTRATION_MODE=invite`, `TRUST_PROXY=true` (derrière Caddy seulement).
**Sortie verte :**
- l'image se construit ; `https://api…/health` et `/ready` répondent en `200` avec certificat valide
- l'administrateur se connecte avec sa 2FA
- `/metrics` refuse sans jeton ; la base n'a aucun port ouvert vers Internet
- tous les tests automatiques passent aussi **dans l'image**

### Phase 3 — E-mails, sauvegardes, alertes (½ journée)
Faire : Resend branché ; **un vrai cycle** inscription → e-mail → vérification ; mot de passe oublié ; alerte de nouvelle connexion ; formulaire de contact (`SUPPORT_EMAIL`).
Faire : sauvegarde manuelle, `backup:verify` (restauration d'essai), copie de la sauvegarde **hors du serveur**, test du chien de garde (couper la base 6 min → alerte reçue → remettre).
**Sortie verte :** les e-mails arrivent en boîte de réception (pas en spam) ; une restauration complète a été rejouée sur une machine vierge ; l'alerte arrive sur votre téléphone/canal.

### Phase 4 — Vidéo réelle (1 à 2 jours)
Faire : envoyer **un vrai film (≥ 1 h)** par le back-office via Mux ; lecture publique d'abord, puis `MUX_PLAYBACK_POLICY=signed` avec la clé de signature ; lire sur ordinateur, iPhone, Android, TV si possible ; couper/relancer le réseau pendant la lecture.
Vérifier aussi : coût réel affiché par Mux pour ce film ; conditions d'utilisation ; **résidence des données** (Europe ?) ; sous-titres déposés.
**Sortie verte :** démarrage < 3 s sur connexion normale ; aucune coupure sur 1 h ; lecture signée refusée sans jeton ; coût par heure de visionnage connu et accepté. *Si Mux ne convient pas (coût, données hors UE) : bascule sur notre chaîne + Bunny (guide : `docs/GUIDE-BUNNY.md`, test : `npm run cdn:check`).*

### Phase 5 — Front branché (dépend de l'agent front) 
Faire : l'agent front suit son brief, publie sur le même domaine ; recette de 10 vérifications du brief, **exécutée sur le serveur de pré-production** (pas en local).
**Sortie verte :** la recette passe en entier sur Chrome et Safari, ordinateur et téléphone ; aucun appel vers `127.0.0.1` ; aucune erreur dans la console ; le cookie `__Host-origin_session` est bien posé et envoyé (c'est le point le plus fragile).

### Phase 6 — Épreuve de charge sur le vrai serveur (½ journée)
Faire : depuis une autre machine, `load:run` sur les scénarios api, startup, browse (catalogue de plusieurs milliers de titres) ; surveiller CPU, mémoire, disque, base.
**Sortie verte :** 0 % d'erreur à 5× l'audience visée en navigation ; temps de réponse stable ; le serveur reste sous 70 % de CPU. Si la vidéo passe par Mux/Bunny, le serveur ne porte pas le trafic vidéo : le test de charge vidéo porte alors sur eux, pas sur vous.

### Phase 7 — Bêta fermée : 20 à 50 personnes (1 à 2 semaines)
Faire : invitations (`POST /api/admin/invitations`) à des proches et des créateurs ; formulaire de contact actif ; pages légales publiées ; consigne : « cassez tout ».
Surveiller chaque jour : tableau de bord (`/api/admin/system`, mesures de lecture), journal d'audit, messages de contact, erreurs 5xx.
**Sortie verte :** aucun incident bloquant non résolu ; taux de lectures qui démarrent > 95 % ; aucune plainte de perte de compte ; au moins un incident simulé (coupure) géré avec la procédure écrite.

### Phase 8 — Ouverture progressive jusqu'à 1 000
Faire : 100 → 300 → 1 000 personnes par paliers de plusieurs jours (invitations en plus grand nombre, puis `REGISTRATION_MODE=open` si souhaité). À chaque palier : relire les métriques, le coût vidéo, l'espace disque, la taille de la base.
**Sortie verte (pour chaque palier) :** mêmes critères que la phase 7 + coûts conformes au budget.

## 4. Sécurité : liste à cocher avant l'ouverture (phase 7)
- [ ] Jeton Mux **régénéré** ; aucun secret dans Git, dans les journaux ni dans le front
- [ ] `REQUIRE_ADMIN_2FA=true`, au moins deux administrateurs, codes de secours stockés hors du serveur
- [ ] `CORS_ORIGINS` limité aux domaines du front ; `TRUST_PROXY=true` seulement derrière Caddy
- [ ] Cookie de session `__Host-` en HTTPS uniquement ; en-têtes de sécurité présents
- [ ] Sauvegardes chiffrées quotidiennes **et** copiées hors du serveur ; restauration rejouée
- [ ] `METRICS_TOKEN` posé ; port de la base fermé ; pare-feu 22/80/443 seulement
- [ ] Contrat de sous-traitance (RGPD) avec l'hébergeur, Resend, Mux/Bunny ; mention des durées de conservation (180 j mesures, 365 j audit)
- [ ] Pages légales publiées ; bandeau cookies si des traceurs non essentiels sont ajoutés par le front
- [ ] Une personne extérieure a tenté de forcer l'inscription/la connexion (test d'intrusion léger)

## 5. Retour arrière (si ça tourne mal)
| Situation | Action |
|---|---|
| Mauvaise mise à jour | Revenir au commit précédent puis `docker compose up -d --build` (les migrations sont additives : sans danger pour le retour) |
| Vidéo Mux défaillante | Basculer l'asset concerné sur la voie « self » ou masquer le titre |
| Front cassé | Republier la version précédente du front (l'API reste compatible : le contrat est versionné) |
| Fuite ou compromission d'un secret | Régénérer le secret (`MEDIA_SECRET` gérable sans coupure via `MEDIA_SECRET_PREVIOUS`), invalider les sessions |
| Perte du serveur | Nouveau VPS + restauration (≈ 1 h avec les sauvegardes hors serveur) |

## 6. Budget indicatif (à confirmer sur les grilles tarifaires actuelles)
| Poste | Ordre de grandeur |
|---|---|
| Serveur | 10–20 € / mois |
| Domaine | ~10–15 € / an |
| E-mails (Resend) | gratuit au démarrage, puis selon le volume |
| **Vidéo (Mux)** | **le poste variable** : facturé au stockage et aux minutes regardées → 1 000 personnes × 2 h × plusieurs séances par mois peut représenter plusieurs centaines d'euros. **À chiffrer en phase 4 avec le tarif réel** avant d'ouvrir. |
| Vidéo (Bunny) | souvent moins cher au volume ; à comparer en phase 4 |

## 7. Qui fait quoi
| Moi (back-end) | Vous | Agent front | Agent back-office |
|---|---|---|---|
| Préparer et vérifier le déploiement, corriger ce que la pré-production révèle, recette API, charge, procédures | Décisions §1, comptes §2, pages légales, invitations de bêta | Branchement + recette front | Interface d'administration (vidéos Mux, catalogue, utilisateurs) |

## 8. Chemin le plus court (si vous voulez avancer dès maintenant)
1. Vous : choisir le domaine, l'hébergeur, la voie vidéo (§1) et créer les comptes (§2).
2. Moi : phases 1–3 dès que le serveur existe (je guide chaque commande ; je ne tape jamais vos mots de passe).
3. En parallèle : l'agent front branche le front (phases 5).
4. Phase 4 dès que le compte Mux est régénéré.
