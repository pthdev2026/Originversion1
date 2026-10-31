# ORIGIN / MILLENIUM — Préproduction en ligne : architecture, coûts, procédure, recette (31/10/2026)

**Statut : préparé et validé en simulation locale. Rien n'a été commandé, déployé ni publié.** Docker n'est pas installé sur le Mac : les images n'ont jamais été construites ici (la CI `deploy-smoke` les construira, et le premier déploiement fera foi).

## 1. Architecture recommandée : UN serveur, UN domaine
```
Internet ──HTTPS──▶ Caddy (80/443, certificat automatique)
                     ├─ /api /media /images /files /avatars /subtitles /uploads /health /ready ─▶ api  (Hono, Node 24)  ─▶ PostgreSQL 17
                     └─ tout le reste (pages, scripts, styles)                                  ─▶ web  (MILLENIUM, rendu serveur Node)
                    + worker (FFmpeg) · backup (nuit, chiffré) · watchdog (5 min)   — tous dans le même Docker Compose
```
- **Pourquoi l'origine unique** : le cookie de session est « first-party » (Safari/ITP sans surprise), **aucune règle CORS à maintenir**, un seul certificat, un seul domaine à acheter. Le cookie de production est `__Host-origin_session` (Secure, HttpOnly, sans `Domain`) : il n'existe que sur ce domaine en HTTPS.
- **Le front ne contient aucun secret** : seul `VITE_API_URL` (adresse publique) est figé dans le code envoyé au navigateur ; vérifié par recherche dans le bundle (aucun jeton, clé ni secret).
- **Séparation stockage / distribution vidéo** : le **stockage persistant** (fichiers HLS, envois, sauvegardes) est un volume Docker du serveur ; la **distribution** passe par l'API (`/media`, liens signés à durée limitée) en préproduction. Mesure : l'origine seule sature vers 100–160 spectateurs simultanés ; **au-delà, la distribution doit passer par Mux ou un CDN** (le stockage reste inchangé).
- **Fichiers ajoutés** : `deploy/Caddyfile` (routage), `deploy/web.Dockerfile` (front), `deploy/docker-compose.yml` (service `web`), `deploy/.env.production.example` (`APP_DOMAIN`), `deploy/local-same-origin.mjs` (simulation locale du routage, sans Docker), `deploy/make-test-video.sh` (contenu de test sans droits).
- **Garde-fou de configuration** : l'adresse publique (`PUBLIC_APP_URL`) est toujours considérée de confiance par la protection anti-CSRF, même si `CORS_ORIGINS` l'oublie (testé).

## 2. Comparatif (prix relevés le 31/10/2026, hors taxes, à reconfirmer au moment de commander)
| | **A. VPS + Docker (recommandé)** | B. Plateforme managée (ex. Render) |
|---|---|---|
| Coût mensuel | **Hetzner CX33 (8 Go) ≈ 8,49 €** (CX23 4 Go ≈ 5,49 €) — [grille juin 2026](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/). Hostinger KVM 2 (8 Go, déjà un compte) : ≈ 8,79 $ la 1ʳᵉ période prépayée 24 mois, **renouvellement annoncé ≈ 14,99 $** (pages en désaccord) — [Hostinger](https://www.hostinger.com/vps-hosting) | Service web ≈ 7 $ (512 Mo) à 25 $ (2 Go) + Postgres ≈ 7–20 $ + disque persistant + worker/cron facturés à part : **≈ 25–60 $/mois** selon taille — [Render](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses) (les pages ne concordent pas : à vérifier sur render.com/pricing) |
| Disponibilité permanente | Oui (un point de défaillance unique) | Oui, redémarrages gérés |
| Tâches automatiques (sauvegarde, planification, watchdog, worker) | Natives (conteneurs) | Cron/worker payants séparés |
| Encodage FFmpeg + disque vidéo | Disque local (≈ 80 Go inclus Hetzner) | Disque persistant payant, CPU limité |
| Sauvegardes | Script chiffré existant + copie externe à brancher | Sauvegardes de base incluses selon plan ; fichiers vidéo à gérer |
| Sécurité | À maintenir par nous (pare-feu, mises à jour) | Plus géré, moins de contrôle |
| Mux | Compatible (clés dans `.env.production`) | Compatible |
| Vers 1 000 utilisateurs | API/base : marge ≈ 10× mesurée en local ; vidéo → Mux/CDN | Idem, montée en gamme payante |
- **Recommandation** : **A (Hetzner CX33 ou, si vous préférez votre compte existant, Hostinger KVM 2)** — tout le dispositif est déjà écrit pour Docker Compose, le coût est le plus bas et prévisible.
- **Mux** ([tarifs](https://www.mux.com/pricing)) : entrée gratuite en qualité « basic » ; stockage ≈ 0,0024 $/min/mois (≤ 720p) ; diffusion : **100 000 min offertes par mois**, puis ≈ 0,0008 $/min (≤ 720p). Exemple *indicatif* : 1 000 personnes × 3 séances de 2 h = 360 000 min → (360 000 − 100 000) × 0,0008 ≈ **208 $/mois** de diffusion + ≈ 1,5 $ de stockage pour 10 h de catalogue. À recalculer avec vos vraies hypothèses ; **rien n'est envoyé à Mux sans autorisation**.
- **Non chiffré ici (à demander/vérifier)** : nom de domaine (chez le registraire), compte e-mail transactionnel (Resend), destination de la sauvegarde externe.

## 3. Procédure de déploiement (reproductible)
1. **Serveur** : Ubuntu LTS, Docker + plugin Compose, pare-feu `ufw allow 22,80,443`, connexion SSH par clé uniquement, mises à jour automatiques de sécurité.
2. **DNS** : un enregistrement `A` (et `AAAA`) `app.<domaine>` → IP du serveur.
3. **Code** : `mkdir ~/origin && cd ~/origin` ; cloner **côte à côte** `ORIGIN-plateforme` (dépôt privé) et `hero-stream-magic` (front, branche à déployer, par défaut la consolidée).
4. **Secrets** : `cd ORIGIN-plateforme/deploy && cp .env.production.example .env.production`, puis remplir `APP_DOMAIN`, `PUBLIC_APP_URL=https://<APP_DOMAIN>`, `CORS_ORIGINS=https://<APP_DOMAIN>`, et générer **sur le serveur** `POSTGRES_PASSWORD`, `MEDIA_SECRET`, `BACKUP_PASSPHRASE`, `METRICS_TOKEN`, `AUTH_ENCRYPTION_KEY` avec `openssl rand -hex 32`. `VIDEO_PROVIDER=self`, `DELIVERY_MODE=origin`. **Aucun secret n'est copié dans le chat ni dans Git.**
5. **Démarrage** : `docker compose --env-file .env.production up -d --build` (les migrations s'appliquent seules, sous verrou).
6. **Administrateur** : `docker compose exec api npm run user:create-admin -- <adresse>` puis connexion à `/connexion` et activation de la double authentification.
7. **Contenu de test** : `./deploy/make-test-video.sh 120 test-film.mp4` (sans droits), puis envoi par le back-office, ou `docker compose exec api npm run media:enqueue -- /data/test-film.mp4 --id film-test --kind film --title "Film de test"` ; **le programme reste en brouillon** jusqu'à la publication éditoriale.
8. **Sauvegarde** : `docker compose exec api node scripts/backup.ts && node scripts/backup-verify.ts`, **puis un essai de restauration sur une base jetable** (jamais fait à ce jour), puis brancher la copie externe (`docs/SAUVEGARDE-EXTERNE.md`).
9. **Contrôles** : `https://<APP_DOMAIN>/health` et `/ready` → 200 ; journal Caddy ; espace disque ; alertes `ALERT_WEBHOOK_URL`.

## 4. Configuration front / back vérifiée
| Sujet | État |
|---|---|
| Adresse publique de l'API | = `https://<APP_DOMAIN>` (même origine) ; `VITE_API_URL` injecté à la construction (argument `VITE_API_URL` de `web`) |
| Build front pour Node | `NITRO_PRESET=node-server` (le dépôt cible Cloudflare par défaut pour Lovable) — **construit et exécuté en local** |
| HTTPS, cookie `__Host-` | Imposés par la configuration de production (testés) ; **jamais éprouvés sur un vrai HTTPS** |
| CORS / CSRF | Origine unique : l'`Origin` publique est de confiance ; origine étrangère → 403 (**vérifié** en navigateur et par test) |
| Session persistante | Cookie 30 jours, serveur ; reconnexion et reprise vérifiées en navigateur (origine unique, HTTP local) |
| Erreurs / indisponibilité | Écrans « indisponible » + Réessayer (vérifiés) ; limite de débit (429) vérifiée |
| Défaut corrigé pendant cette recette | « Mon compte » renvoyait un utilisateur connecté vers la connexion avec un **build de production** (décision avant la réponse du serveur) ; corrigé et testé |
| Défaut corrigé | Un envoi vidéo créait un programme **publié** automatiquement ; désormais **brouillon** (la publication reste éditoriale) |

## 5. Interventions minimales du propriétaire (isolées ; tout le reste est prêt)
1. **Choisir et commander le serveur** (Hetzner ou Hostinger) — dépense ; me donner l'IP et un accès SSH par clé, ou suivre la procédure §3.
2. **Nom de domaine + enregistrement DNS** `app.<domaine>` → IP.
3. **Créer deux dépôts GitHub privés vides** (`origin-backend`, `origin-back-office`) et me donner les adresses SSH + autorisation de pousser (contrôle des secrets refait : propre).
4. **Lovable** : indiquer quel projet/branche est lié à `hero-stream-magic` (voir §6) et autoriser (ou non) une fusion dans `main`.
5. **Compte e-mail transactionnel** (Resend) : la clé se saisit directement sur le serveur.
6. **Mux** (plus tard) : régénérer le jeton, créer la clé de signature, la saisir sur le serveur ; autoriser expressément tout envoi.

## 6. GitHub et Lovable (constats du 31/10)
- `origin/main` = `d0d8fa1` ; la ligne consolidée `front/integration-hero` (`959ec8c`) a **84 commits d'avance** et **3 commits de moins** : trois commits du robot Lovable du 30/10 (« galerie créateurs mobile » : `origin-creators.tsx`, `styles.css`, `bun.lock`). Un essai de fusion à blanc donne **un seul conflit, `bun.lock`** (fichier généré, sans changement de `package.json`).
- Branche locale prête, **non poussée** : `consolidation/avec-main` (`1db2f8f`, dépôt `app/`) = consolidée + ces 3 commits + le correctif de « Mon compte » ; `tsc`, 88 tests et build verts. Elle conserve toute la direction artistique + la galerie mobile de Lovable.
- **Quel projet Lovable est branché ?** Impossible à établir avec mon accès : le seul projet ORIGIN visible (« Story Canvas », dernière édition 21/09) pointe vers un commit (`3bce08a`) **absent** du dépôt `hero-stream-magic`, alors que des commits du robot Lovable y existent à la date du 30/10. Le projet lié doit appartenir à un autre compte/espace. **À vérifier dans Lovable → Paramètres → GitHub** (dépôt et branche). En général Lovable ne suit que `main` : pousser une autre branche ne change rien à l'aperçu, et **une fusion dans `main` le met à jour (avec le risque d'un aperçu sans API : écran « indisponible »)**.
- **Risque de conflit entre agents** : Lovable (robot) écrit sur `main` ; l'agent front écrit sur `front/integration-hero` ; moi sur des branches d'intégration. Règle : une seule branche « source de vérité » par période, les autres en retard se rebasent/fusionnent dans celle-ci, jamais l'inverse sans accord.
- Branches obsolètes à archiver (entièrement incluses dans l'intégration) : `front/hero-immersive`, `hero-mobile`, `lecture-reelle`, `menu-bas-mobile`, `millenium-base`, `page-film-*`, `reco-accueil-mobile`, `catalogue-*`, `comptes-*`, `experience`, `fiabilite-lecture`, `sync-lovable`. `maj-top10-et-classement` contient le Top 10 immersif déjà repris.

## 7. Recette complète (à exécuter sur le serveur réel, ordinateur + mobile ; Chrome fait ; Safari et Firefox restent à faire)
**Parcours spectateur, deux comptes indépendants A et B** : inscription → connexion → accueil → recherche (avec faute) → fiche → Ma liste → lecture → progression (≥ 30 s) → fermer l'onglet → reprise (« Reprendre ») → déconnexion → reconnexion → vérifier que B ne voit rien de A.
**Parcours administrateur** : connexion + 2FA → création du programme (brouillon, invisible) → envoi vidéo → préparation (suivi du job) → programme toujours en brouillon → publication → visible dans MILLENIUM → lecture.
**Mesures** : codes HTTP ≠ 2xx/3xx, délai de chargement de l'accueil, délai de 1ʳᵉ image (`startupMs`), coupures (`rebufferCount`), console sans erreur, cookie `__Host-` Secure, aucune requête vers `localhost`, `Origin` étrangère refusée, limite de débit.
**Sécurité/exploitation** : `/metrics` refusé sans jeton, sauvegarde + restauration d'essai, redémarrage du serveur (les services reviennent), renouvellement du certificat.

## 8. État
| | |
|---|---|
| **Prêt et vérifié (local, origine unique simulée)** | inscription, connexion, déconnexion, reconnexion, accueil, recherche, fiche, Ma liste, lecture HLS (50 segments, 0 erreur, ≤ 182 ms), progression, reprise bureau→mobile, isolation de 2 comptes, parcours administratif (création brouillon → envoi → encodage FFmpeg 30 s → publication → manifeste + segments) |
| **Prêt, jamais exécuté** | construction Docker, Caddy, HTTPS réel, cookie `__Host-` réel, sauvegarde/restauration, job CI de déploiement |
| **Bloqué (action du propriétaire)** | serveur + domaine, dépôts privés GitHub, identification du projet Lovable, e-mail transactionnel, clés Mux |
| **Reste à valider** | Safari et Firefox, mobile réel, charge sur le serveur réel, restauration, 2FA admin en conditions réelles |
