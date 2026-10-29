# ORIGIN — Audit d'architecture cible (30/10/2026)

**Statut** : audit d'aide à la décision. **Aucune intégration de Supabase ni de Mux n'a été commencée**, et rien n'a été modifié dans la vidéo, le CDN, l'authentification ou l'infrastructure.
**Périmètre** : trois questions posées par le propriétaire (§1, §2, §3), puis une recommandation (§4) et ce qu'il faut pour décider (§5).

## Niveaux de certitude (utilisés partout)
| Marque | Signification |
|---|---|
| ✅ code | Vérifié dans le code ou les tests du dépôt |
| 📄 doc | Lu dans la documentation officielle du fournisseur le 30/10/2026 (URL indiquée) |
| ⚠️ inféré | Raisonnement à partir de ce qui précède, **à tester** avant de s'y fier |
| ❓ inconnu | Non trouvé / non vérifié : à demander au fournisseur ou à tester |

---

## 1. Notre PostgreSQL peut-il être hébergé sur Supabase sans toucher à l'authentification ?

**Réponse : oui en principe, sans rien changer à nos comptes — mais avec trois précautions obligatoires, dont une de sécurité.** Et ce n'est pas nécessaire pour le pilote.

### 1.1 Ce que notre application demande à PostgreSQL (✅ code)
| Besoin | Où | Remarque |
|---|---|---|
| PostgreSQL standard, **aucune extension** (`CREATE EXTENSION` absent des 11 migrations) | `migrations/` | Pas de dépendance à `unaccent`, `pg_trgm`, etc. |
| Fonctions et déclencheurs PL/pgSQL, `jsonb`, `text[]`, `percentile_cont` | 008, 009 | Standard |
| Verrous consultatifs **de transaction** (`pg_advisory_xact_lock`) | migrations, écritures éditoriales | Perdus à la fin de la transaction : compatibles avec un pooler en mode transaction ⚠️ |
| `FOR UPDATE SKIP LOCKED` (file d'encodage) | `jobs.repository.ts:121` | Instruction unique |
| Paramètres de connexion `statement_timeout` (15 s) et `idle_in_transaction_session_timeout` (30 s), passés **au démarrage de la connexion** | `main.ts:47` | Point sensible, voir §1.3 |
| Authentification **propre** (tables `users`, `sessions`…), aucune dépendance à Supabase Auth | module `identity` | Rien à changer ; ajouter Supabase Auth créerait un second système (à éviter, comme tu l'as décidé) |
| Pilote `postgres` (porsager) | `platform/database/client.ts` | Requêtes préparées et « pipelining » par défaut |

### 1.2 Ce que dit Supabase (📄 doc, 30/10/2026)
- **Trois façons de se connecter** (https://supabase.com/docs/guides/database/connecting-to-postgres) : connexion **directe** (port 5432, IPv6 par défaut, IPv4 avec un supplément payant), **pooler en mode session** (port 5432, IPv4), **pooler en mode transaction** (port 6543).
- La documentation recommande la connexion directe pour « des serveurs persistants : machines virtuelles, conteneurs de longue durée » — **c'est notre cas**. Le mode transaction est présenté pour le « serverless ».
- En **mode transaction** : pas de requêtes préparées (pour `postgres.js` : `prepare: false`), l'état de session est perdu (`SET`, verrous de **session**, `LISTEN`), et le « pipelining » de `postgres.js` « peut bloquer des requêtes ou renvoyer des lignes mélangées ».
- Offres (https://supabase.com/pricing) : **Gratuit** = base de 500 Mo, **projet mis en pause après 1 semaine d'inactivité**, **aucune sauvegarde automatique**. **Pro** = à partir de 25 $/mois, 8 Go, sauvegardes quotidiennes sur 7 jours. Restauration à la seconde (PITR) : supplément ≈ 100 $/mois pour 7 jours.
- Régions européennes : ❓ non vérifié.

### 1.3 Les trois précautions
1. **Sécurité — l'API de données (PostgREST)** 📄 : sur un projet Supabase, les tables créées en SQL brut dans le schéma `public` reçoivent par défaut des droits pour les rôles `anon`/`authenticated` **sans protection par ligne (RLS)** : « une table d'un schéma exposé sans RLS est lisible et modifiable par tout rôle qui a un droit dessus » (https://supabase.com/docs/guides/api/securing-your-api). **Nos tables `users` (empreintes de mots de passe), `sessions`, `user_totp` seraient potentiellement lisibles avec la clé publique du projet.** Il faut, avant de mettre quoi que ce soit dedans : **désactiver l'API de données**, ou révoquer les droits par défaut et activer la RLS sur *toutes* nos tables, ou créer nos tables dans un schéma non exposé. Cette vérification est un **préalable bloquant**.
2. **Mode de connexion** : utiliser la **connexion directe** (ou le pooler en mode **session**), jamais le mode transaction sans adaptation (`prepare: false`, pipelining à vérifier). Le conteneur doit pouvoir joindre l'adresse (IPv6, ou supplément IPv4).
3. **Paramètres de démarrage** ❓ : la doc ne dit pas si `statement_timeout` et `idle_in_transaction_session_timeout` passés au démarrage sont acceptés via le pooler. En connexion directe, ils le sont (⚠️). À tester ; alternative : les fixer côté base (`ALTER ROLE … SET statement_timeout`).

### 1.4 Ce que ça changerait en pratique
| Sujet | PostgreSQL dans le conteneur (plan actuel) | Supabase Pro |
|---|---|---|
| Coût | 0 € de plus | ≥ 25 $/mois |
| Latence base ↔ API | Locale (≈ 0 ms) | Réseau (quelques ms à dizaines de ms par requête ; l'accueil fait plusieurs requêtes → le cache serveur de 30 s absorbe) ⚠️ |
| Sauvegardes | Nos sauvegardes **chiffrées + restauration d'essai vérifiée** (copie hors site à faire) | Quotidiennes 7 jours incluses ; PITR payant ; **nos sauvegardes restent utiles** (elles fonctionnent à distance) |
| Disponibilité | Une machine | Base gérée, mais l'API reste sur une machine |
| Exploitation | Nous | Fournisseur |
| Risque ajouté | — | Dépendance, exposition PostgREST (§1.3), pause du plan gratuit |
| Changements de code | — | Chaîne de connexion ; `prepare`/mode ; verrouillage de l'API de données ; **aucun changement de l'authentification** |

**Verdict §1** : compatible, sans toucher aux comptes. **Pas recommandé pour le pilote** : coût et dépendance supplémentaires pour un gain (sauvegardes gérées) que nous avons déjà. À réexaminer quand la disponibilité de la base devient un enjeu.

---

## 2. FFmpeg + Bunny peuvent-ils coexister avec Mux derrière une interface commune ?

**Réponse : oui, par média, avec un chantier de taille moyenne — mais Mux ne remplace pas seulement le « CDN » : il remplace l'encodage, le stockage ET la diffusion à la fois. L'interface existante couvre un tiers du besoin.**

### 2.1 Où est la couture aujourd'hui (✅ code)
| Fonction | Interface existante | Implémentations |
|---|---|---|
| Fabriquer l'URL de lecture | `DeliverySigner.sign(asset)` (`playback/delivery.ts`) | `origin` (jeton HMAC dans le chemin), `bunny` (jeton de répertoire) |
| Publier les fichiers encodés | `MediaStore.publishHls(...)` (`platform/storage/media-store.ts`) | Local, Bunny Storage |
| Encoder | **Aucune interface** : `pipeline/run-job.ts` appelle FFmpeg directement (analyse → qualités → QC → publication atomique → `registerAsset`) | FFmpeg uniquement |
| Représenter un média prêt | Table `media_assets` (`storage_path`, `renditions`, durée, statut) | — |

### 2.2 Ce que Mux apporte et impose (📄 doc, https://www.mux.com/docs/…)
| Sujet | Constat |
|---|---|
| Ajout d'une vidéo | `POST /video/v1/assets` depuis une **URL** (Mux va chercher le fichier : il doit être joignable depuis Internet), ou **envoi direct** reprenable. Taille maximale, formats d'entrée, durée d'encodage d'un film de 2 h : ❓ non documentés dans les pages lues |
| Qualité | 3 niveaux : **basic** (échelle réduite, encodage **gratuit**, on-demand), **plus** (encodage « par titre » assisté par IA), **premium**. 1080p disponible partout, 4K possible |
| Lecture | HLS `https://stream.mux.com/{playback-id}.m3u8` ; **lecture signée** par jeton **JWT RS256** (clé privée chez nous, publique chez Mux ; la durée doit couvrir au moins la durée du film) ; affiches via `image.mux.com`. Compatibilité hls.js : ❓ non confirmée explicitement (HLS standard : probable ⚠️) |
| Sous-titres | WebVTT/SRT en pistes ; **génération automatique incluse (Whisper), sans surcoût**, langues « stables » dont le français ; pas de traduction |
| Volume sonore | **Normalisation possible mais désactivée par défaut, cible −24 LUFS, à choisir à la création** (non modifiable ensuite). **Notre cible est −16 LUFS** : mélanger les deux fournisseurs créerait des écarts de volume, y compris avec **notre ident ORIGIN** (servi par nous) |
| Pistes audio multiples | Oui |
| Webhooks | `video.asset.ready`, etc. ; signature HMAC-SHA256 (`mux-signature`) ; **exige une adresse publique en HTTPS** → impossible avant le déploiement |
| Résidence des données (UE), CGU sur le contenu | ❓ non lus — **à vérifier avant de confier des contenus à Mux** |
| Limites d'API | Création d'assets : environ 1 requête/s en rythme soutenu ; sans limite sur le nombre de spectateurs |

### 2.3 Conception proposée (non réalisée) : un fournisseur **par média**
```
                     ┌── provider = 'self' ──▶ FFmpeg → publication (Local | Bunny) → DeliverySigner (origin | bunny)
 media_assets ──────┤
   (provider)        └── provider = 'mux'  ──▶ Mux (encodage+stockage+CDN) ───────────▶ DeliverySigner (mux : JWT RS256)
```
Changements nécessaires (taille : **moyenne**, additifs, sans casser l'existant) :
1. **Migration** : `media_assets.provider` (`'self'` par défaut), `provider_asset_id`, `provider_playback_id`.
2. **Interface d'ingestion** `VideoPipeline` : `self` = le code actuel (inchangé) ; `mux` = « créer l'asset, attendre le webhook, inscrire le média prêt avec sa durée ».
3. **Route webhook** `POST /webhooks/mux` : vérification de signature, tolérance d'horloge, idempotence.
4. **Signataire Mux** (JWT RS256 avec `node:crypto`, aucune dépendance) ajouté à côté de `origin`/`bunny` ; `createPlaybackSession` choisit le signataire selon `asset.provider`.
5. **Ce qui est perdu avec `mux`** : notre contrôle qualité, notre normalisation à −16 LUFS (sauf à accepter −24), l'échelle de qualités maîtrisée, la publication atomique versionnée ; **ce qui est conservé** : catalogue, comptes, reprise, ident (décision serveur), sous-titres (nos pistes WebVTT restent servies par nous, indépendantes du fournisseur), recommandations, mesure de lecture (côté lecteur).
6. **Tests** : simulateur de l'API et des webhooks Mux (comme le faux Bunny existant).
Aucune de ces étapes n'est utile avant d'avoir **un serveur public** (webhooks) et **un compte Mux**.

### 2.4 Le coût réellement en jeu (calculs, hypothèses explicites)
| Scénario | Hypothèses | Résultat |
|---|---|---|
| Stockage de nos rendus (nous) | Échelle 1080/720/480/360 ≈ 10,45 Mb/s au total ⇒ ≈ 4,7 Go par heure | **≈ 9,4 Go pour un film de 2 h** ; 10 productions de ~1 h ≈ 47 Go (⚠️ estimation) |
| Diffusion de 1 000 spectateurs × 2 h | 720p ≈ 2,8 Mb/s ⇒ 2,5 Go par spectateur ; 1080p ≈ 5 Mb/s ⇒ 4,5 Go | **≈ 2,5 à 4,5 To** |
| Bunny (réseau Standard ≈ 0,01 $/Go, `DECISIONS.md`) | 2,5–4,5 To | **≈ 25 à 45 $** pour cet événement |
| Mux « basic » 1080p, tarifs publiés lus le 30/10 | 10 h stockées = 600 min ; 120 000 min livrées (plancher : le tampon de segments compte en plus) | stockage 600 × 0,003 = **1,80 $/mois** ; diffusion (120 000 − 100 000 gratuites) × 0,001 = **20 $** ; encodage **0 $** ⇒ **≈ 21,80 $ bruts** (≈ 1,80 $ nets si le crédit mensuel de 20 $ s'applique à tout — ❓) |
| Mux « plus » | idem | + encodage 600 × 0,03125 = **18,75 $ une fois** |
| Encodage chez nous | Mesuré ≈ 2,1 × la durée du contenu sur le Mac : 10 h de contenu ≈ **21 h de calcul** (⚠️ non mesuré sur un VPS, probablement plus lent) | Pas de coût direct si fait sur le Mac, mais du temps |

**Lecture honnête** : à l'échelle du pilote, **les coûts sont du même ordre (quelques dizaines de dollars) et ne doivent pas décider**. Ce qui décide : le temps (21 h de calcul contre quelques minutes), le risque (Bunny jamais validé ; Mux jamais testé), la maîtrise (volume, qualités, QC) et les ❓ de Mux (données UE, CGU).

**Verdict §2** : la coexistence est réalisable et saine **si Mux reste un fournisseur *par média*** et non un remplacement. Elle ne doit pas être construite avant un test réel d'un seul contenu sur chaque voie (§5).

---

## 3. Quels composants faut-il réellement déployer en ligne ?

### 3.1 Inventaire
| Composant | Rôle | Doit être public ? | Charge | État / stockage | Où (pilote) |
|---|---|---|---|---|---|
| **Reverse proxy (Caddy)** | HTTPS, certificats automatiques | **Oui** (80/443) | Négligeable | Certificats | VPS |
| **API (Hono)** | Comptes, catalogue, lecture, administration | Oui (derrière Caddy) | ≈ 200 Mo de mémoire à 1 000 spectateurs (mesuré, ✅) ; marge ≥ 10× | Sans état (sessions en base) | VPS |
| **PostgreSQL** | Toutes les données | **Non** | Faible : base de quelques dizaines de Mo à ce stade | **Oui — à sauvegarder** | VPS (conteneur) |
| **Travailleur d'encodage** | FFmpeg | Non | **CPU lourd** (2,1 × la durée du contenu), seulement quand on publie | Dossier de travail temporaire | VPS **ou** poste fort (Mac) qui publie vers Bunny et accède à la base |
| **Stockage des sources** | Vidéos d'origine | Non | Disque | **Non régénérables — sauvegarde obligatoire** | Disque VPS + copie hors site |
| **Stockage des rendus HLS** | Ce que lisent les spectateurs | Via CDN | 9–10 Go / film de 2 h | Régénérables depuis les sources | **Bunny Storage** (ou Mux) |
| **CDN** | Diffusion de masse | Oui | 2,5–4,5 To pour l'événement test | — | **Bunny** (ou Mux) |
| **Sauvegarde nocturne** | Base chiffrée + fichiers | Non | Courte | Dossier de sauvegardes | VPS → **copie hors site** |
| **Chien de garde** | Alertes (5 min) | Non | Négligeable | Fichier d'état | VPS |
| **Entretien horaire** | Purge des données périmées | — | Négligeable | — | **Dans le processus de l'API** (aucune tâche externe) |
| **E-mails** | Réinitialisation, vérification | — | — | — | Resend (service externe) |
| **Front** | Interface | Oui | — | — | Hors de ce périmètre (Lovable/GitHub), voir §3.3 |

### 3.2 Trois topologies possibles
| | **T1 — Tout sur un VPS** (déjà préparée dans `deploy/`) | **T2 — Base gérée** (ex. Supabase Pro) | **T3 — Mux pour la vidéo** |
|---|---|---|---|
| Composants en ligne | Caddy, API, PostgreSQL, travailleur, sauvegarde, chien de garde + Bunny + Resend | T1 sans le conteneur PostgreSQL ; + base gérée | T1 sans travailleur ni Bunny ; + Mux (webhook public) |
| Coût mensuel indicatif | ≈ 10–20 € + Bunny (quelques €) | + 25 $ | VPS + Mux (usage) |
| Complexité d'exploitation | Moyenne (une machine) | Moyenne + précautions §1.3 | Plus faible côté vidéo, plus de code d'intégration |
| Ce qui reste non éprouvé | Docker, HTTPS, Bunny, e-mails | idem + sécurité PostgREST | Mux, webhooks, données UE |
| Adapté au pilote ? | **Oui (référence)** | Non (gain faible) | À tester sur 1 contenu |

### 3.3 Contrainte critique sur le front (déjà dans `docs/DEPLOIEMENT.md`, mais décisive ici)
Le cookie de session exige que **front et API soient sur le même « site »** (même domaine enregistrable). Si le front reste sur l'adresse Lovable (`*.lovable.app`) alors que l'API est sur `api.origin.xxx`, **la connexion ne fonctionnera pas** (cookie jamais transmis). Il faut donc un **domaine personnalisé** pour le front (`origin.xxx`) en plus de `api.origin.xxx`. À décider avec l'agent front et le propriétaire **avant** de réserver le domaine.

### 3.4 Les tâches planifiées, précisément
| Tâche | Fréquence | Où elle tourne | Dépendance externe |
|---|---|---|---|
| Sauvegarde chiffrée | 24 h | Conteneur `backup` | Aucune (copie hors site à ajouter) |
| Contrôle de santé + alertes | 5 min | Conteneur `watchdog` | `ALERT_WEBHOOK_URL` |
| Entretien (sessions, jetons, mesures, journal) | 1 h | **Dans l'API** | Aucune |
| Test de restauration | Hebdomadaire (à planifier) | `backup:verify` | Aucune |

---

## 4. Recommandation

1. **Conserver Hono + PostgreSQL + l'authentification actuelle.** Ne pas ajouter Supabase Auth (second système) et **ne pas** migrer vers Supabase pour le pilote (§1.4).
2. **Déployer T1** (tout sur un VPS) : c'est le plus petit nombre de pièces mobiles, et tout est déjà préparé.
3. **Ne pas construire l'intégration Mux maintenant.** Faire d'abord un **essai comparatif à petit coût** (§5) ; la coexistence est possible par média (§2.3) et ne sera construite qu'après ce test.
4. **Trancher le domaine du front** (§3.3) avant d'acheter quoi que ce soit.
5. **Refaire le test de charge après déploiement** : l'API et la base ont ≥ 10× de marge *sur le Mac* ; le CDN décharge la vidéo mais **ne dit rien** de la base, des comptes ni de l'API en conditions réelles.

## 5. Ce qu'il faut pour décider (essai « 1 vidéo, 2 voies »)
| Étape | Avec qui | Mesure à relever |
|---|---|---|
| 1. VPS + domaines `origin.xxx` / `api.origin.xxx` | Propriétaire | HTTPS en service, `/ready` vert |
| 2. Compte Bunny → `npm run cdn:check` | Propriétaire + back-end | Jeton validé sur une vraie zone |
| 3. Publier **une** vidéo test (≈ 10 min) par la voie FFmpeg → Bunny | Back-end | Durée d'encodage sur le VPS, temps de démarrage du lecteur |
| 4. Créer un compte Mux (offre d'essai) et envoyer **la même** vidéo en niveau « basic » à la main | Propriétaire | Délai jusqu'à « ready », démarrage du lecteur avec hls.js, qualité visuelle, volume |
| 5. Lire les CGU/confidentialité de Mux (résidence UE, contenu religieux) | Propriétaire | Feu vert juridique |
| 6. Comparer sur grille : temps, démarrage, qualité, maîtrise, coût | Back-end | Décision datée dans `DECISIONS.md` |

## 6. Limites de cet audit
- Les informations Supabase et Mux proviennent de **pages officielles lues le 30/10/2026** ; elles évoluent (tarifs, défauts de sécurité). Les revérifier le jour de la décision.
- Le comportement exact de `postgres.js` derrière le pooler Supabase, le format de jeton Bunny et la compatibilité hls.js/Mux sont **à tester**, pas démontrés.
- Les estimations de stockage et de calcul supposent des fichiers sources ordinaires ; à recalculer avec les vraies productions.
