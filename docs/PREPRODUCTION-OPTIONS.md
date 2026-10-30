# ORIGIN — Options d'infrastructure de préproduction (30/10/2026)

**Statut : comparaison, pas décision.** Aucun prix n'est cité : ils changent et je ne peux pas les vérifier d'ici. Pour chaque option, la colonne « À vérifier » dit quoi relever sur la grille du fournisseur **à la date de la décision**.

## 1. Ce que notre architecture impose (faits du dépôt)
| Contrainte | Source | Conséquence pour l'hébergement |
|---|---|---|
| **Une tâche interne toute les 30 s** (sorties/retraits planifiés, porte de publication) + entretien horaire + interrogation Mux 10 s, **dans le processus de l'API** | `src/main.ts` | L'API doit tourner **en continu** : un hébergement qui endort ou réduit à zéro les instances **retarde** les sorties |
| **Fichiers sur disque** : images du catalogue, sous-titres, **photos de profil**, sources et rendus vidéo (voie `self`) | `STORAGE_ROOT` | Il faut un **disque persistant** ; sur un disque éphémère, ces fichiers disparaissent à chaque redéploiement (ou il faut du code pour passer à un stockage objet) |
| PostgreSQL 17, migrations au démarrage, `statement_timeout` 15 s | `migrate.ts` | Tout PostgreSQL ≥ 17 convient ; **pas de dépendance à une extension** (volontaire) |
| **Worker FFmpeg** (voie `self`) : lourd en processeur, séparé de l'API | `deploy/docker-compose.yml` | **Inutile avec Mux seul** ; indispensable seulement si on garde notre propre encodage |
| Sauvegarde chiffrée quotidienne + chien de garde | `scripts/backup.ts`, `watchdog.ts` | À héberger là où un processus long tourne (ou à remplacer par les outils du fournisseur) |
| Cookie de session : même site front/API | contrat | Front et API sous le **même domaine enregistrable** |
| Charge mesurée (local) : 10 000 comptes = 41 Mo en base, requêtes ≈ 0,1 ms | `docs/TEST-DE-CHARGE.md` | La base n'est pas le facteur limitant ; avec Mux, la **vidéo n'est pas servie par nous** |

## 2. Les trois options
### A. VPS + Docker Compose (ce qui est déjà écrit et testé en CI)
- **Composants** : une machine, `caddy` (HTTPS automatique), `postgres`, `api` (+ `worker`, `backup`, `watchdog`) — `deploy/`.
- **Exploitation** : vous administrez la machine (mises à jour du système, pare-feu, disque, surveillance). Le plan : script d'installation, alertes du chien de garde.
- **Montée en charge** : verticale (machine plus grosse) ; une seule machine = **pas de bascule automatique** (restauration estimée ≈ 1 h avec sauvegarde externe).
- **Sécurité** : surface maîtrisée (un seul port exposé, base jamais publiée) mais **vous** êtes responsable des correctifs.
- **Sauvegardes** : déjà codées (chiffrées, vérifiées) ; **à externaliser** (voir `docs/SAUVEGARDE-EXTERNE.md`).
- **Déploiement** : `git pull` + `docker compose up -d --build` ; retour arrière = commit précédent.
- **Tâches automatiques** : ✔ natives (processus long).
- **Mux / pipeline local** : ✔ les deux ; le worker FFmpeg tourne sur la même machine si on garde la voie `self`.
- **À vérifier** : prix mensuel de la machine (4 cœurs / 8 Go / ≥ 80 Go), trafic sortant inclus, localisation UE, prix et conservation des sauvegardes/instantanés.

### B. Plateforme managée (type « PaaS » : conteneur + base gérée)
- **Composants** : un service conteneur pour l'API, un PostgreSQL géré, éventuellement un second service pour le worker.
- **Exploitation** : moindre (système, certificats, redémarrages gérés) ; mais **adaptation** nécessaire.
- **Contraintes bloquantes à lever avant de choisir** : (1) **instance toujours allumée** (sinon les sorties planifiées dérivent) ; (2) **disque persistant** ou **stockage objet** — aujourd'hui les photos de profil, sous-titres et images sont écrits sur le disque local : sur disque éphémère, **chaque redéploiement les perd** (adaptation de code nécessaire) ; (3) tâches en arrière-plan autorisées dans l'instance.
- **Montée en charge** : horizontale possible, mais notre planificateur (30 s) est sûr à plusieurs instances (vérifié par test : aucune sortie en double) ; le stockage disque, non.
- **Sauvegardes** : sauvegardes/point-in-time de la base fournis par la plateforme ; nos fichiers restent à sauvegarder à part.
- **Mux / pipeline local** : Mux ✔ ; le worker FFmpeg est un service lourd à part (coût, disque).
- **À vérifier** : mise en veille éventuelle, volumes persistants et leur prix, version PostgreSQL ≥ 17, région UE, limites de durée de requête (envois tus de plusieurs Go).

### C. API hébergée + PostgreSQL hébergé + vidéo Mux (C = B sans worker)
- C'est B, dimensionné pour la voie Mux seule : **pas de FFmpeg, pas de disque vidéo**. Reste le disque pour images/sous-titres/photos (ou stockage objet).
- Le plus léger à exploiter, **le plus dépendant de fournisseurs** (API, base, Mux) ; chaque service a sa facture et ses limites.
- **À vérifier** : prix de la minute stockée et regardée chez Mux **pour votre scénario** (1 000 personnes × 2 h × plusieurs séances par mois) — c'est le poste dominant, quelle que soit l'option.

## 3. Recommandation
**Préproduction : option A (VPS + Docker Compose)**, avec Mux pour la vidéo, parce que :
1. tout est déjà écrit, testé et vérifiable dans un environnement jetable (job CI `deploy-smoke`) ;
2. le planificateur et la sauvegarde sont natifs ;
3. aucune adaptation de code (stockage objet) n'est nécessaire pour la première validation ;
4. le coût mensuel est **fixe et prévisible** (une machine) — seul le coût Mux varie.

**Trajectoire vers ≈ 1 000 utilisateurs** (sans promesse de performance non mesurée) : (1) préproduction A, bêta fermée de 20 à 50 personnes ; (2) mesurer sur le vrai serveur (`docs/TEST-DE-CHARGE.md`, scénarios api/browse) ; (3) **externaliser les sauvegardes** avant d'ouvrir ; (4) si la machine devient limitante ou si l'exploitation pèse : passer la base en **PostgreSQL géré** (changer `DATABASE_URL`), puis, si besoin, déplacer images/sous-titres/photos vers un stockage objet (le seul vrai chantier de code) et envisager l'option B/C.
La bascule A → B/C est un chantier **identifié et borné** (stockage), pas une réécriture.

## 4. Colima / Docker sur le Mac : nécessaire ?
**Non pour valider le déploiement** : le job CI `deploy-smoke` (`.github/workflows/api.yml`) construit l'image, démarre PostgreSQL + API, applique les migrations, vérifie `/ready` et FFmpeg, puis fait une **sauvegarde chiffrée suivie d'une restauration d'essai**, dans un environnement propre et jetable — sans rien installer sur votre Mac. Il tourne dès que le dépôt sera sur GitHub.
Colima n'est utile que pour **construire et lancer la pile en local**. Prérequis avant toute installation (non lancée) : Homebrew, ~ 10 Go de disque et ~ 4 Go de mémoire pour la machine virtuelle, `brew install colima docker docker-compose`, puis `colima start`. **Ma recommandation : ne rien installer sur le Mac et s'appuyer sur la CI.**
