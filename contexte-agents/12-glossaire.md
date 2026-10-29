# 12 — Glossaire

Vérifié le : 30/10/2026. Chaque terme est expliqué pour un lecteur débutant.

| Terme | Explication |
|---|---|
| **API** | Interface par laquelle le front demande des choses au back-end (« donne-moi l'accueil »). Un ensemble de **routes** (adresses). |
| **Back-end** | La partie invisible : base de données, comptes, vidéos, règles. Le **front-end** est ce que l'utilisateur voit. |
| **Monolithe modulaire** | Une seule application, rangée en modules indépendants (contraire des microservices). |
| **Module** | Un dossier qui gère un domaine (comptes, catalogue, lecture…). |
| **Couches (route / service / repository)** | Route = reçoit la demande ; service = décide ; repository = parle à la base. Chacune ne fait que son travail. |
| **Middleware** | Petit programme exécuté avant les routes (identifiant de requête, limites, sécurité…). |
| **Migration** | Modification versionnée de la structure de la base de données (ajouter une table…). |
| **PostgreSQL** | La base de données. **Schéma jetable** : base temporaire créée par un test puis supprimée. |
| **Transaction** | Un ensemble d'opérations en base « tout ou rien ». **Verrou consultatif** : un cadenas pour qu'un seul processus fasse une chose à la fois. |
| **zod** | Bibliothèque qui vérifie qu'une donnée a la bonne forme. |
| **HLS** | Technique de diffusion vidéo : la vidéo est coupée en petits morceaux (**segments**, 4 s chez nous) et le lecteur choisit la qualité selon la connexion. **Manifeste/playlist** : la liste des morceaux. |
| **fMP4, H.264, AAC** | Formats de conteneur/vidéo/audio très répandus et compatibles partout. |
| **Qualités (rungs)** | 1080p, 720p, 480p, 360p. **Sur-échantillonnage** : agrandir artificiellement une vidéo (interdit chez nous). |
| **Encodage** | Convertir la vidéo brute en HLS multi-qualités (FFmpeg). Long : ≈ 2× la durée du film. |
| **Worker (travailleur)** | Processus séparé qui exécute les tâches lourdes (encodage) sans ralentir l'API. **File de tâches** : liste d'attente ; **bail** : réservation temporaire d'une tâche par un worker. |
| **Point de reprise** | Sauvegarde intermédiaire pour ne pas tout refaire après une interruption. |
| **tus** | Protocole d'envoi de gros fichiers reprenable (si la connexion coupe à 80 %, on reprend à 80 %). |
| **QC (contrôle qualité)** | Vérification automatique des segments/durée avant publication. **Publication atomique** : la vidéo apparaît d'un bloc ou pas du tout. |
| **CDN** | Réseau de serveurs répartis qui gardent des copies des vidéos près des spectateurs (Bunny). **Origine** : le serveur source. **Pull Zone** : la zone CDN qui « tire » les fichiers depuis le stockage. |
| **URL signée / jeton** | Adresse temporaire contenant une signature cryptographique : sans elle ou une fois expirée, l'accès est refusé. **HMAC** : méthode de signature. |
| **DRM** | Verrouillage cryptographique empêchant la copie (non utilisé en v1). |
| **LUFS / EBU R128** | Mesure du volume *perçu* et norme pour l'uniformiser entre contenus (cible −16 LUFS). |
| **Ident** | Courte vidéo de marque « ORIGIN » jouée avant un titre. |
| **QoE** | « Qualité d'expérience » : démarrage, coupures, erreurs mesurés chez le spectateur (anonymement). **p50/p75/p95/p99** : valeur sous laquelle se trouvent 50/75/95/99 % des mesures. |
| **argon2id** | Méthode d'enregistrement des mots de passe : on stocke une empreinte volontairement lente à calculer. |
| **Cookie httpOnly** | Petit jeton de connexion que le JavaScript de la page ne peut pas lire. **SameSite** : empêche l'envoi depuis un autre site. |
| **CSRF** | Attaque où un autre site force une action à votre insu ; bloquée en vérifiant l'origine. |
| **2FA / TOTP** | Second facteur : un code à 6 chiffres qui change toutes les 30 s (application d'authentification). **Codes de secours** : codes à usage unique si on perd son téléphone. |
| **RGPD** | Règlement européen sur les données personnelles (accès, effacement, minimisation). |
| **Audit log** | Journal des événements de sécurité (qui a fait quoi, sans adresse IP). |
| **Rate limit** | Limite du nombre de requêtes par minute et par adresse, contre les abus. |
| **Cache (TTL)** | Mémoire temporaire d'une réponse pour éviter de la recalculer (durée de vie = TTL). **Regroupement** : plusieurs demandes simultanées partagent une seule lecture. |
| **503 / 500 / 404** | 503 = service momentanément indisponible (réessayer) ; 500 = bug ; 404 = introuvable. |
| **Test de charge** | Simuler beaucoup de spectateurs pour voir si le système tient. |
| **Observabilité** | Journaux, métriques, alertes permettant de savoir ce qui se passe. **Chien de garde (watchdog)** : contrôleur automatique qui alerte en cas de problème. |
| **Docker / Compose** | Docker empaquette l'application dans une « boîte » ; Compose lance plusieurs boîtes ensemble. **Caddy** : serveur qui gère HTTPS automatiquement. |
| **Reverse proxy** | Serveur placé devant l'API qui reçoit le trafic Internet et le transmet. |
| **MCP** | Protocole standard qui permet à un agent d'utiliser des outils externes. **REA** : outil de rétro-ingénierie via MCP. **Graphify** : transforme un dossier en graphe de connaissances interrogeable. |
| **Fenêtre de contexte** | Quantité de texte qu'un agent peut « garder en tête » à un instant donné ; **context engineering** : l'art de décider quoi y mettre. |
| **Lovable** | Outil de conception front relié à GitHub. **PR (pull request)** : proposition de fusion d'une branche, relue avant d'être intégrée. |
| **playbackId / slug** | Identifiants : `slug` = nom court d'un programme ; `playbackId` = identifiant de lecture (film : le slug ; épisode : `slug-s1-e2`). |
| **isDemo / playable / personalized** | Indicateurs d'honnêteté : contenu de démonstration / lisible réellement / recommandation réellement personnalisée. |
