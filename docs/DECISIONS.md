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
