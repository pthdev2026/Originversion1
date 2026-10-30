# ORIGIN — Décisions

Légende : ✅ validé · 🟡 ouvert · 💡 recommandation

## Identité
- ✅ Noir profond #050505 en fond, argent comme signature (typo, contours de sélection, icônes)
- ✅ Rouge réduit : bordeaux #541D20, rouge désaturé #853B3B, dégradés très subtils
- ✅ Champagne #D6BE8A réservé aux CTA (bouton « Regarder »)
- ✅ Ivoire #EEEAE4 pour les textes principaux
- 🟡 Typographie : Manrope (nav, titres, boutons) + Plus Jakarta Sans (métadonnées)
- ✅ Logos-titres des productions conservés tels quels

## Homepage (ordre à valider)
- ✅ 01 Hero · 02 Top 10 · 03 Ce qui pourrait vous plaire · 04 À découvrir sur ORIGIN
- 🟡 05 PTH Originals · 06 Explorer par format · 07 Explorer par thématique · 08 Reprendre la lecture (conditionnelle) · 09 Bientôt sur ORIGIN

## Motion
- ✅ Hero : 450–700 ms · Cards : 180–250 ms
- ✅ Respect de prefers-reduced-motion

## Règles
- Pas de fausse personnalisation, pas de faux historique, pas de faux backend
- Données de démo clairement identifiées
- Les maquettes finales priment sur le document de contexte

## Points ouverts
- Dépôt GitHub et branche de référence
- Stack de la V1 Lovable
- Périmètre de la première livraison (desktop / mobile / TV)
- Maquettes finales à fournir

## Lecture vidéo (mission 1, réalisée le 11/10/2026)
- ✅ Format : HLS, segments fMP4 de 4 s, H.264 + AAC, paliers 1080/720/480/360p sans sur-échantillonnage
- ✅ Encodage hors ligne avec FFmpeg (`video-pipeline/`), preset `slow` par défaut
- ✅ Lecteur : hls.js (natif sous Safari) avec contrôles ORIGIN, sans lecteur tiers
- ✅ Protection V1 : jeton HMAC dans le chemin, 4 h, lié au programme (pas de DRM)
- ✅ API : Node + Hono, un seul service ; pas de base de données à ce stade
- ✅ Front : design Lovable (106 commits) récupéré le 11/10/2026 ; lecture réelle intégrée dans son lecteur sur la branche locale `integration/lovable-design-video`, **non poussée** (la branche `feature/video-playback`, antérieure au design, est obsolète)
- ✅ Police : Manrope (choix de Lovable), la question Michroma est close
- 🟡 4K : réservée plus tard aux Originals / comptes autorisés ; champ « droit de qualité » à prévoir
- 🟡 Hébergement : Bunny Storage + CDN visé, selon la géographie de l'audience
- 🟡 Design Lovable à intégrer (attendu), puis fusion avec `feature/video-playback`

## Base de données (mission 2, réalisée le 11/10/2026)
- ✅ PostgreSQL 17 en local via `embedded-postgres` (vrais binaires, port 5433, données dans `storage/pgdata`)
- ✅ Driver `postgres` (porsager), migrations SQL numérotées maison, tests sur schéma jetable
- ✅ Tables `programs` et `media_assets` ; la lecture exige un média `ready` avec durée
- ✅ L'API ne dépend plus du dossier de fichiers pour savoir si un programme est lisible
- ✅ Ingestion par `npm run ingest` après encodage
- 🟡 Le catalogue éditorial reste dans le front : à migrer vers l'API si on veut le piloter sans redéployer
- 🟡 Production : PostgreSQL géré (ou VPS) + sauvegardes à prévoir ; `DATABASE_URL` obligatoire

## Décisions du 13/10/2026
- ✅ Audience principale : **France et Belgique**, puis Europe du Sud (Espagne) → CDN Europe (Bunny Standard ≈ 0,01 $/Go)
- ✅ Accès : **gratuit et ouvert à tous** pour la première version ; passage à l'invitation prévu plus tard (champ prévu dans le module identity)
- ✅ Objectif : 1 000 personnes, jusqu'à 2 h de lecture chacune
- ✅ Deux agents : back-end (cet agent) et front-end (autre agent), contrat dans `docs/API-CONTRACT.md`
- ✅ Architecture back-end : monolithe modulaire, couches routes → service → repository, socle `platform/`
- ✅ Rangement des fichiers : par type puis par identifiant (`storage/videos/hls/<id>`), thèmes dans la base
- ✅ Étape B0 (hygiène) réalisée : configuration validée, journaux structurés, erreurs cohérentes, types stricts, CI
- ✅ Étape B1 (sécurité) réalisée : limitation de débit, délai et taille maximaux, rotation de secret, `no-store`, en-têtes, audit propre
- ✅ Étape B2 (comptes maison) réalisée : argon2id, sessions en cookie httpOnly, verrouillage, réinitialisation, suppression (RGPD), invitations, rôles, CSRF
- ✅ Lecture : ouverte par défaut ; exiger un compte = un réglage (`PLAYBACK_REQUIRES_LOGIN`)
- 🟡 À faire avant l'ouverture : envoi réel des e-mails, vérification de l'adresse, double authentification (plus tard)
- ✅ Étape B3 réalisée : reprise de lecture (durée de référence côté serveur, fin à 95 %/30 s, envois hors ordre ignorés), « Ma liste », mesure de lecture anonyme + synthèse administrateur
- ✅ Étape B4 réalisée : envoi reprenable (tus), file de tâches PostgreSQL avec bail, travailleur séparé, encodage par qualité avec points de reprise, contrôle qualité avant publication atomique
- ✅ Mesure : 15 s de 1440p encodés en ~32 s (4 qualités, preset medium) → ≈ 2,1× la durée ; film de 2 h ≈ 4 à 5 h sur ce Mac
- 🟡 Reprise à la granularité d'une qualité ; une reprise par tranches de 10 min est possible plus tard si les films de 2 h sont fréquents
- 🟡 Espace disque libre non vérifié avant un envoi (B6)
- ✅ Étape B5 réalisée côté code : abstraction `DeliverySigner`/`MediaStore`, publication vers Bunny Storage (versionnée, contrôle d'intégrité, reprise), jetons CDN de répertoire, script de vérification `cdn:check`
- 🟡 En attente du propriétaire : création du compte Bunny, de la zone de stockage et de la Pull Zone (voir `docs/GUIDE-BUNNY.md`) ; le format du jeton CDN reste à valider sur la vraie zone
- ✅ Région de stockage : Falkenstein (Europe) ; réseau Standard
- ✅ Étape B6 réalisée : sauvegarde logique chiffrée + rotation + test de restauration, /ready, /metrics (jeton), tableau de bord administrateur, garde-fou d'espace disque, chien de garde avec alertes, runbooks (`docs/EXPLOITATION.md`)
- 🟡 Sauvegarde hors site à prévoir (second lieu) ; planification réelle (cron) à activer par le propriétaire ; webhook d'alerte à choisir

## Ident de marque (14/10/2026)
- ✅ Vidéo « ORIGIN » (6 s) jouée avant la première lecture d'un titre : décision côté serveur (`ident.show`), le front exécute
- ✅ Règle par défaut : une fois par titre (film ou série), jamais à la reprise, jamais à l'enchaînement automatique ; réglable (`IDENT_POLICY`)
- ✅ Passable après 2 s ; le programme se précharge pendant que l'ident joue (consigne au front)
- ✅ Ident publié par le pipeline normal (`--kind brand`), exclu du catalogue
- 🟡 Version courte (3,5–4 s) à envisager ; normalisation du volume de l'ident et des programmes à une même cible
- 🟡 Le comportement exact de Netflix (répétition par épisode, insertion technique) n'a pas pu être vérifié par des sources fiables

## Test de charge (14/10/2026, B7)
- ✅ L'API tient ≥ 10× le trafic réel de 1 000 spectateurs sans erreur (voir `docs/TEST-DE-CHARGE.md`)
- ✅ Le CDN est **obligatoire** : l'origine sature vers 100–160 spectateurs simultanés
- ✅ Hachage argon2 limité à 2 simultanés + `UV_THREADPOOL_SIZE=16` pour qu'une rafale de connexions ne bloque pas la lecture
- 🟡 Test à refaire depuis une machine distincte contre le vrai CDN après B5/B8

## Déploiement (14/10/2026, B8)
- ✅ Une machine (VPS Europe), Docker Compose : caddy (HTTPS auto) · api · worker · backup · watchdog · postgres 17
- ✅ Une seule image pour tous les rôles ; PostgreSQL officiel en production (embedded-postgres reste réservé au développement)
- ✅ Sauvegarde nocturne et chien de garde intégrés au compose ; base non exposée
- ✅ Front et API sur le même domaine enregistrable (cookie de session SameSite=Lax)
- 🟡 Images non construites localement (pas de Docker sur le Mac) : validées par la CI et le premier déploiement
- 🟡 Choix du fournisseur VPS, du domaine, copie hors site, envoi d'e-mails : à ta décision

## Catalogue, recherche, recommandations, e-mails (15/10/2026)
- ✅ Catalogue éditorial en base : programmes enrichis, saisons/épisodes (fiche propre par épisode), collections ordonnées avec `layout`, thématiques, créateurs, visuels servis par l'API (`/images/…`)
- ✅ Tout est brouillon par défaut ; l'administration est une API de documents complets validés (zod) ; import/export JSON
- ✅ `playable` vient des médias prêts ; l'encodage n'écrase jamais la fiche éditoriale
- ✅ Recherche sans extension PostgreSQL (`search_text` + trigger, accents/casse ignorés, tous les mots requis)
- ✅ Recommandations par règles explicables (palier 2) : similaires, tendances réelles, « pour vous » seulement si historique ; chaque élément porte sa raison ; jamais de faux « pour vous »
- ✅ Cache public 30 s du catalogue ; `no-store` conservé partout ailleurs
- ✅ E-mails : fournisseur Resend par HTTP (sans dépendance) ; réponses de « mot de passe oublié » uniformes même en cas de panne ; corps des e-mails non journalisés en production
- ✅ Garde-fous d'architecture en test (pas de cycle, socle indépendant, SQL localisé)
- 🟡 Compte Resend, domaine d'envoi vérifié (SPF/DKIM) et page front `/reinitialiser` à fournir

## Sous-titres (15/10/2026)
- ✅ Une piste WebVTT par (média, langue), fichier dans `storage/subtitles/<playbackId>/<lang>.vtt`, métadonnées en base, incluse dans les sauvegardes (vérifié par restauration d'essai)
- ✅ Exposée dans la réponse de lecture (`subtitles`) ; dépôt administrateur sous `/files/subtitles/…` (limite de 1 Mo, validation WebVTT)
- 🟡 Pas de conversion SRT→VTT côté serveur (le fichier doit déjà être en WebVTT)

## Robustesse (15/10/2026)
- ✅ Migrations sérialisées par verrou consultatif (deux instances simultanées : chaque migration appliquée une fois) — un vrai défaut trouvé et corrigé par test (création concurrente de `schema_migrations`)
- ✅ Pannes de base traduites en 503 + `Retry-After` (doublon 409, référence 400) au lieu de 500
- ✅ Délai maximal de 15 s par requête SQL et coupure des transactions oubliées (30 s) sur la connexion de l'API ; migrations sur une connexion séparée sans délai
- ✅ Écritures éditoriales simultanées sérialisées par verrou (programme, collection) ; `uncaughtException` → arrêt propre et relance
- ✅ Tests de robustesse : concurrence, entrées hostiles (injection, chemins, Unicode, JSON malformé), panne de base en cours de service
- ✅ Tableau de bord éditorial : audience, achèvement, qualité par programme, santé du catalogue

## Comptes renforcés (16/10/2026)
- ✅ Vérification d'adresse e-mail (lien 24 h, usage unique) ; non bloquante pour regarder ; la réinitialisation de mot de passe vaut preuve
- ✅ Double authentification TOTP (RFC 6238, sans dépendance, vecteurs officiels testés) : codes de secours à usage unique, rejeu impossible, secret chiffré AES-256-GCM avec une clé hors base (`AUTH_ENCRYPTION_KEY`)
- ✅ `REQUIRE_ADMIN_2FA=true` impose la double authentification aux administrateurs (recommandé dès la mise en ligne)
- 🟡 Perte du téléphone ET des codes de secours : réinitialisation par l'exploitant en base (procédure à documenter dans EXPLOITATION.md)

## Données personnelles et volume sonore (16/10/2026)
- ✅ Droit d'accès/portabilité : `GET /api/me/export` (JSON, sans secret, uniquement les données du compte) ; effacement déjà en place
- ✅ Minimisation : entretien horaire automatique — sessions et jetons périmés, mesures de lecture > 180 j (`RETENTION_TELEMETRY_DAYS`), journal d'audit > 365 j (`RETENTION_AUDIT_DAYS`)
- ✅ Normalisation du volume à l'encodage (EBU R128, deux passes, correction linéaire) vers -16 LUFS, crête -1,5 dBTP (`LOUDNESS_TARGET_LUFS`, `off` pour désactiver) : vérifiée avec un vrai ffmpeg (source à ≈ -40 LUFS ramenée à ±1,5 LU de la cible) ; piste muette = pas de correction, pas d'échec ; l'ident ORIGIN passe par le même pipeline, donc le même volume
- 🟡 Les médias encodés AVANT cette date ne sont pas normalisés (à ré-encoder si besoin)
- 🟡 Version courte de l'ident (3,5–4 s) : décision éditoriale, non technique

## Passage à l'échelle du catalogue (16/10/2026)
- ✅ Test de charge « parcours du catalogue » (scénario `browse`, catalogue synthétique jusqu'à 5 000 programmes) : une erreur d'estimation corrigée (27,7 % d'échecs → 0 %)
- ✅ Cache serveur du catalogue public (`CATALOG_CACHE_SECONDS`, défaut 30 s), borné, avec regroupement des chargements simultanés, vidé à chaque écriture éditoriale ; cache des caractéristiques de recommandation et des tendances
- ✅ Calcul de proximité allégé (genres normalisés une seule fois)
- 🟡 Au-delà de ~20 000 titres : pré-calculer les recommandations

## Dossier de contexte des agents (30/10/2026)
- ✅ `contexte-agents/` : 13 fiches thématiques + 5 fiches par compartiment (catalogue/reco, pipeline vidéo, comptes/sécurité, exploitation, qualité) + README de routage ; hiérarchie de vérité : code et tests > contrat d'API > décisions > documents thématiques > ce dossier
- ✅ Garde-fou `context-docs.test.ts` : le dossier doit mentionner chaque migration, module, table et variable d'environnement, porter une date de vérification et ne contenir aucun lien cassé (couverture vérifiée, pas le sens)
- 🟡 Demandes du front du 16/10 (`docs/API-REQUESTS.md`) restées sans réponse du back-end : liste de « Ma liste » enrichie, progression par programme ; à traiter en priorité
- 🟡 SagePlus et Angels : applications de référence citées par le propriétaire, non documentées à ce jour

## Demandes du front traitées (30/10/2026)
- ✅ `GET /api/me/list` renvoie une fiche résumée (`program`, ou `null` si non publié/inconnu) par élément — champs historiques inchangés (additif). Dépendance `mylist → catalog` (sans cycle, vérifiée par `architecture.test.ts`)
- ✅ `GET /api/me/progress?program=<slug>` : progression de chaque contenu d'un programme, terminés inclus ; paramètre obligatoire (jamais tout l'historique) ; programme retrouvé par `program_slug` ou par le média
- ✅ Aucune modification de la vidéo, du CDN, de l'authentification, de l'infrastructure ; Supabase et Mux **non intégrés** (audit d'architecture d'abord : `docs/AUDIT-ARCHITECTURE-CIBLE-2026-10-30.md`)

## Audit d'architecture cible (30/10/2026)
- ✅ Conserver Hono + PostgreSQL + authentification maison ; **pas de Supabase Auth** ; **pas de migration vers Supabase pour le pilote** (compatible mais coûteux/dépendant ; l'API de données doit être verrouillée si on y vient)
- ✅ Déploiement de référence du pilote : **tout sur un VPS** (Caddy, API, PostgreSQL, travailleur, sauvegarde, chien de garde) + Bunny + Resend
- ✅ Mux : **coexistence par média** envisageable (colonne `provider`), **rien construit** ; décision après un essai « 1 vidéo, 2 voies » ; vérifier d'abord les CGU et la résidence des données de Mux
- 🟡 Domaine personnalisé du front à trancher avant d'acheter le domaine (cookie de session : même site que l'API)

## Back-office (30/10/2026)
- ✅ Le back-office est **nécessaire** (ajouter/publier des vidéos sans terminal, observer la performance) mais **n'est pas un préalable à la vérification du CDN** (commande `cdn:check`, à faire en parallèle)
- ✅ Application **à part** (`admin/`, `admin.origin.xxx`), non reliée à Lovable ; la sécurité est côté API (rôle admin + 2FA) ; construction **par phases** (1 minimum utile, 2 éditorial, 3 observation)
- ✅ Agent **dédié** recommandé ; cahier des charges et prompt rédigés (`docs/CAHIER-DES-CHARGES-BACK-OFFICE.md`, `docs/PROMPT-AGENT-BACK-OFFICE.md`)
- 🟡 Ajouts back-end prévus : B1 envoi d'images, B2 fiche admin, B3 journal des modifications, B4 filtre des tâches, B5 fournisseur Mux (si retenu)
- 🟡 À trancher : domaine `admin.origin.xxx`, restriction par IP, voie vidéo (Bunny/Mux), qui est l'agent

## Ajouts back-office livrés (30/10/2026)
- ✅ B1 `PUT /files/images/:slug/:file` (type vérifié sur le contenu, ≤ 10 Mo, SVG refusé), B2 `GET /api/admin/programs/:slug` (fiche admin aller-retour avec `PUT`, médias, tâches), B4 filtres `?playbackId=`/`?program=` sur les tâches — contrat v1.3
- ✅ Emplacement du back-office : dossier à part sur le Bureau (`~/Desktop/ORIGIN-back-office/`), dépôt Git séparé ; connexion à l'API **uniquement par son adresse** et par la session de l'administrateur (aucune clé d'API partagée)
- 🟡 B3 (journal des modifications) et B5 (Mux) à venir

## Voie Mux construite et validée (30/10/2026)
- ✅ B5 phase 1 : client Mux (HTTP Basic, champs confirmés seulement, réessais 429/5xx), envoi direct navigateur→Mux (adresse à usage limité, non conservée), suivi par poller + consultation, inscription en base à `ready`, lecture `public` ou `signed` (JWT RS256 sans dépendance), signataire choisi **média par média** (Mux et Bunny/origine cohabitent), migration 013 (`provider*` sur `media_assets`, table `mux_uploads`)
- ✅ **Validation réelle** avec le compte du propriétaire (environnement « MVP », Development) : accès, création/annulation d'envoi, envoi d'une vidéo de test (HTTP 200), prête en ~2 s, durée lue, manifeste HLS valide (360p + 270p, échelle « basic » réduite), suppression ; aucune limite constatée sur une vidéo de 4 s
- ✅ Les jetons Mux sont **uniquement** dans `api/.env` (ignoré par Git, droits 600) ; ils ont transité par une conversation : **les régénérer avant la production**
- 🟡 À faire : lecture `signed` (créer une clé de signature chez Mux), webhooks (remplaceraient le poller une fois le serveur public), conditions d'utilisation et résidence des données de Mux, essai avec un vrai film (durée, taille, qualités), écran du back-office

## Espace compte livré (30/10/2026)
- ✅ Analyse front ↔ back-end : `docs/ANALYSE-FRONT-VS-BACKEND-2026-10-30.md` (le front « Millenium » n'est branché sur rien ; le branchement existe sur d'autres branches non fusionnées)
- ✅ Contrat v1.5 : profil (`PATCH /api/me`, date d'inscription, langue), préférences, appareils (nom approximatif, jamais d'IP), thématiques préférées → « Pour vous » dès l'inscription, photo de profil (jpg/png/webp, 5 Mo, supprimée avec le compte, sauvegardée), changement d'e-mail par code, historique désactivable et effaçable, épisode dans « Continuer à regarder », export enrichi
- ✅ Migration 014 ; module `account` ; `afterAccountDeleted` (nettoyage hors base) branché sur la suppression de compte
- 🟡 Inchangé : connexion Google/Apple, direct (live), audio multiple, contenus en anglais, envoi des notifications (seul le choix est enregistré)

## Univers de créateur et contact livrés (30/10/2026)
- ✅ Migration 015 : alias, domaine, accroche, couleur d'accent, chapitres, contenus par rubrique avec « à la une » ; routes publiques et d'administration (contrat v1.6)
- ✅ Migration 016 : formulaire « Nous contacter » (limité à 5/h/IP, piège anti-robot, conservé + e-mail à `SUPPORT_EMAIL`, purgé avec l'audit)
- 🟡 Le « direct » n'est qu'une annonce datée : pas de diffusion en direct (décision propriétaire requise)
- ✅ Journal d'audit du catalogue (B3) : chaque écriture réussie sur programmes/thèmes/créateurs/collections est tracée (qui, quoi, quand — jamais le contenu), lisible via `GET /api/admin/audit`, purgée selon `RETENTION_AUDIT_DAYS`

## Recherche intelligente et alerte de connexion (30/10/2026)
- ✅ Migration 017 : `programs.keywords` (synonymes cherchés comme le titre), `search_history`, `login_devices`
- ✅ Recherche tolérante aux fautes (distance d'édition 1–2 selon la longueur, uniquement si rien n'est trouvé ; `correctedQuery`), suggestions à la frappe, recherches récentes liées au réglage « historique »
- ✅ E-mail d'alerte à la connexion depuis un nouvel appareil
- 🟡 Non fait, décision propriétaire : profils multiples façon Netflix, connexion Google/Apple, code par e-mail sans mot de passe, passkeys

## Décisions de mise en ligne (30/10/2026)
- ✅ **Voie vidéo : Mux** pour la bêta (notre chaîne FFmpeg + Bunny reste prête en secours)
- ✅ **Hébergement : un VPS européen** (machine unique, Docker Compose)
- 🟡 À fixer : nom de domaine, hébergeur précis, hébergement du front, pages légales — voir `docs/PLAN-MISE-EN-LIGNE.md` §1

## Lecture vidéo finalisée côté API (30/10/2026)
- ✅ Migration 018 : repères d'intro et de générique par média, saisis au back-office (`PUT /api/admin/media/:id/markers`)
- ✅ Réponse de lecture enrichie : `content`, `resume` (respecte « historique »), `markers`, `next` ; nouvelle route `GET /api/programs/:slug/play-target` (Lecture / Reprendre / Épisode suivant en un appel)
- 🟡 Reste : lecture Mux `signed` avec une vraie clé, vrai film, audio multiple (décision), miniatures de la barre de lecture (storyboard Mux)

## Programmation des sorties (30/10/2026)
- ✅ Migration 019 : sortie planifiée, retrait planifié, annonce « Prochainement ». `published` reste l'unique interrupteur lu par tout le catalogue (accueil, recherche, lecture, recommandations) ; une tâche de 30 s le bascule aux dates prévues → aucune requête du catalogue n'a changé, donc aucun risque d'oubli
- ✅ `GET /api/coming-soon` (public), `GET /api/admin/schedule` (calendrier), traces `catalog.program.release|expire` dans le journal
- 🟡 Le fuseau horaire vient de la date saisie (ISO avec décalage) ; le back-office devra proposer le fuseau de Paris par défaut

## Cycle complet d'un film long en local (30/10/2026)
- ✅ Vidéo de test de 15 min (1080p, 1,1 Go) : envoi tus → encodage (4 qualités) → disponible → lecture dans un navigateur réel (pause, reprise, saut au milieu, saut en fin, fin de lecture, aucune erreur) ; côté API : reprise à 7 min, bouton « Reprendre », « Continuer à regarder », film terminé → « rewatch »
- 🟡 Le front n'envoie pas encore la progression : la reprise fonctionne côté API, pas encore dans l'interface
- 🟡 Film réel de 85 min en cours d'encodage local ; même cycle à rejouer à la fin

## Intégration de la Hero Section — côté back-end (30/10/2026)
- ✅ `PUT /api/me/list/:slug` refuse un contenu inconnu/brouillon (404) ; plafond de 500 atomique (verrou par compte)
- ✅ Isolation, idempotence, concurrence et persistance vérifiées par 9 tests et, en navigateur réel, par un parcours pilote + deuxième compte (CORS et cookies entre `localhost:3210` et `localhost:4000`)
- ✅ Demandes d'intégration documentées : `docs/DEMANDES-INTEGRATION-HERO.md` (agent front F1–F9, agent back-office B1–B3)
- 🟡 Aucun écran MILLENIUM n'est encore branché à ces routes : la Hero reste simulée tant que le front n'a pas traité F1–F5

## Banc de recette isolé (30/10/2026)
- ✅ `api/scripts/recette/` : base jetable `origin_recette`, API :4020, page de test :4021, comptes `@origin.test` supprimés à la fin — remplace tout test sur la base ou les comptes de développement (leçon de l'incident `admin-test@origin.local`)
- ✅ Parcours multi-comptes dans un navigateur réel : 28/28 (inscription, liste, double clic, actualisation, fermeture de page avec `keepalive`, reprise, déconnexion/reconnexion, second compte, nettoyage)
- ✅ Tests ajoutés : session expirée en cours de lecture ; pré-requête CORS d'un `PUT` avec cookies

## Bogue corrigé : le worker d'encodage s'arrêtait sur une panne passagère de la base (30/10/2026)
- Découvert pendant l'encodage du film de 85 min : un `CONNECT_TIMEOUT` vers PostgreSQL pendant un rapport de progression (`run-job.ts`, appel non attendu) provoquait une promesse rejetée non gérée, donc l'arrêt du processus à 63 %. La reprise par bail/points de contrôle a permis de relancer sans perdre les qualités terminées
- ✅ Correctif : le rapport de confort est désormais non bloquant (erreur journalisée) ; test de non-régression (échoue sans le correctif, réussi avec)
- 🟡 En production, Docker (`restart: unless-stopped`) relancerait aussi le worker ; le correctif évite surtout de perdre la qualité en cours

## Intégration MILLENIUM — jalons 1 et 2 (30/10/2026)
- ✅ Authentification réelle et « Ma liste » persistée par l'API, **vérifiées dans l'interface MILLENIUM** (branche locale `integration/backend-hero` du dépôt front, non fusionnée, non publiée) ; deux comptes isolés ; base de recette jetable
- ✅ Matrice et tableau de suivi : `docs/MATRICE-INTEGRATION-MILLENIUM.md`
- 🟡 Reste simulé dans MILLENIUM : accueil/rails, fiches, recherche, Continuer à regarder, espace (photo, appareils, préférences), progression et reprise du lecteur ; bouton « Ma liste » absent de la Hero sur ordinateur

## Jalon 3 — lecture, progression et reprise dans MILLENIUM (30/10/2026)
- ✅ Progression et reprise **réelles** dans le lecteur de MILLENIUM, vérifiées sur ordinateur et mobile, deux comptes isolés, film de 15 min et film de 85 min, y compris fin de programme, sortie du lecteur, fermeture de page (`keepalive`), session expirée en cours de lecture, déconnexion/reconnexion
- ✅ « Continuer à regarder » issu du serveur ; bouton « Ma liste » de la Hero sur ordinateur ; clic retenu pendant le chargement de la session
- ✅ Film réel de 85 min encodé **en local uniquement** : 4 qualités, 1 276 fichiers par qualité, durée 5 103,3 s partout, 6,0 Go ; tâche 13:57 → 17:24 (3 h 27, deux tentatives après un plantage du worker corrigé, machine partagée avec d'autres calculs)
- ✅ Consolidation : la branche d'intégration contient le dernier commit de l'agent front (avance rapide possible) — procédure : `docs/CONSOLIDATION-FRONT-INTEGRATION.md`
- 🟡 Pas encore dans la branche principale du front : en attente de la fusion par l'agent front

## Jalon 4 — Accueil et collections réelles (30/10/2026)
- ✅ L'accueil de MILLENIUM lit `GET /api/home` (12 sections, 106 images servies par l'API, 0 donnée embarquée) ; modification et retrait côté administration visibles ; panne API = écran d'erreur « Réessayer », jamais de données inventées
- ✅ Contrat v1.11 : `GET /api/me/continue-watching` renvoie la fiche `program` de chaque ligne
- ✅ Recette : catalogue complet copié automatiquement (`api/scripts/recette/seed-catalog.ts`, refuse toute cible autre que `origin_recette`)
- 🟡 Reste embarqué côté front : textes éditoriaux des thématiques, palettes du Top 10, contenu des pages `/production/:slug`, `/classement`

## Jalon 5 — Fiches programmes réelles (30/10/2026)
- ✅ `/production/:slug` lit le serveur (fiche, saisons, épisodes, similaires, rang), états « En cours / Déjà vu » des épisodes issus de la progression du compte, « Marquer comme vu » enregistré, 404 et panne gérées sans fiche inventée ; vérifié ordinateur et mobile
- ✅ Contrat v1.12 : `play-target.episode` = `{key, season, seasonNumber, number, title}` (`key` = identifiant d'épisode de la fiche)
- 🟡 À la charge de l'agent front : rafraîchir le libellé du bouton au retour du lecteur ; retirer les choix audio/sous-titres fictifs ; `/classement`

## Porte de publication (30/10/2026) — règle validée par le propriétaire
- ✅ Une sortie planifiée n'est publiée automatiquement que si **tous les médias obligatoires sont prêts** ; sinon : blocage, trace (journal d'audit), alerte e-mail aux administrateurs, visible dans le calendrier, **aucune publication tardive non contrôlée** ; reprise par validation éditoriale (`POST /api/admin/programs/:slug/release`) ou nouvelle date. Migration 020. 6 tests.
- 🟡 Le back-office n'a pas encore d'écran pour valider une sortie bloquée (demande à lui adresser) ; l'e-mail d'alerte n'a jamais été envoyé en réel (Resend non branché).

## Revue de sécurité ciblée (30/10/2026)
- Matrice d'autorisations et CSRF testées sur les routes réellement enregistrées (`api/src/security.test.ts`) ; toute nouvelle route doit être classée publique/protégée sinon le test échoue.
- Corrigé : session vérifiée avant la validation du corps sur 3 routes `/api/me`. Risque accepté : `POST /api/playback-sessions` anonyme (limitation de débit globale seulement).

## Protection des statistiques de lecture (31/10/2026)
- Risque démontré : `POST /api/playback-sessions` était ouvert à tous et `loadTrending` (Top 10 dynamique) compte les sessions de plus de 10 s ; 500 rapports fabriqués suffisaient à fausser le classement (test d'attaque dans `session-authorization.test.ts`).
- Correction : jeton HMAC (lié à session + média + heure d'émission) délivré avec la lecture, renvoyé dans le corps du rapport ; temps regardé plafonné au temps écoulé ; un jeton = une session (renvois idempotents) ; rotation de secret supportée ; contrat v1.15.
- Risque résiduel : une personne qui lance réellement une lecture et attend peut encore produire une vue par lecture, limitée par le temps réel et la limitation de débit (`metricsPerMinute`) ; une vue par compte (pondération des sessions connectées) pourra être ajoutée si le Top 10 devient un enjeu.
