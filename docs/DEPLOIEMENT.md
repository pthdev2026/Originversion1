# ORIGIN — Déploiement (B8)

Statut : **préparé et vérifié hors conteneur** (installation de production réelle, API + migrations + sauvegarde OK).
Les images Docker n'ont **pas encore été construites** : Docker n'est pas installé sur le Mac de développement ; le build est
vérifié par la CI (job `docker`) et par le premier déploiement.

## 1. Architecture de production (une machine)

```
Internet ──443──▶ Caddy (HTTPS auto) ──▶ api ──▶ postgres
                                          │         ▲
                           worker (ffmpeg)┘         │
                           backup (nuit) ───────────┤
                           watchdog (5 min) ────────┘
Spectateurs ──▶ CDN Bunny (vidéo, jetons)      [DELIVERY_MODE=bunny]
```

- **Un seul service exposé** : Caddy (ports 80/443). La base n'a aucun port publié.
- **Une seule image** (`api/Dockerfile`) pour api, worker, backup, watchdog : même code, commandes différentes.
- Volumes : `pgdata` (base), `data` (sources, images, sauvegardes), `caddy_data` (certificats).
- Dossier : `deploy/` (`docker-compose.yml`, `Caddyfile`, `.env.production.example`).

## 2. Ce qu'il faut

| Élément | Recommandation | Ordre de coût |
|---|---|---|
| Serveur (VPS) Europe | 4 vCPU, 8 Go RAM, 160 Go SSD (Hetzner, OVH…) | ~10–20 €/mois |
| Nom de domaine | `origin.xxx` (site) + `api.origin.xxx` (API) : **même domaine enregistrable**, sinon le cookie de session ne passe pas | ~10 €/an |
| CDN + stockage | Bunny (voir `GUIDE-BUNNY.md`) | quelques € |
| Sauvegarde hors site | second lieu (autre fournisseur / disque) | variable |

Le travailleur d'encodage est gourmand : sur 4 vCPU, un film de 2 h prend plusieurs heures. Acceptable (tâche de fond).
Option plus tard : encoder sur ton Mac et publier directement vers Bunny, le serveur ne fait alors qu'API + base.

## 3. Première mise en ligne (pas à pas)

1. **Serveur** : Ubuntu LTS à jour, utilisateur non-root, connexion par clé SSH uniquement, pare-feu : seuls 22, 80, 443 ouverts.
2. **Docker** : installer Docker Engine + plugin Compose (documentation officielle Docker).
3. **DNS** : enregistrement `A` de `api.origin.xxx` vers l'IP du serveur (attendre la propagation).
4. **Code** : `git clone` du dépôt sur le serveur (le dossier `deploy/` suffit avec `api/`).
5. **Secrets** : `cp deploy/.env.production.example deploy/.env.production`, puis remplir avec `openssl rand -hex 32`
   (POSTGRES_PASSWORD, MEDIA_SECRET, METRICS_TOKEN, BACKUP_PASSPHRASE). **Copier BACKUP_PASSPHRASE dans un gestionnaire de
   mots de passe : sans elle, les sauvegardes sont illisibles.**
6. **Lancer** : `cd deploy && docker compose --env-file .env.production up -d --build`.
7. **Vérifier** : `curl https://api.origin.xxx/health` → `{"status":"ok"}` ; `docker compose ps` : tout « running/healthy ».
8. **Premier administrateur** : `docker compose exec api node scripts/create-admin.ts` (voir `README.md` pour les arguments).
9. **Brancher le front** : variable d'API du front = `https://api.origin.xxx`, `CORS_ORIGINS` et `PUBLIC_APP_URL` côté API = adresse du site.
10. **CDN** : après `GUIDE-BUNNY.md` + `npm run cdn:check`, passer `DELIVERY_MODE=bunny` puis `docker compose up -d`.

## 4. Mises à jour (sans coupure longue)

```bash
git pull && cd deploy && docker compose --env-file .env.production up -d --build
```
Les migrations s'appliquent au démarrage de l'API. **Retour arrière** : `git checkout <commit précédent>` puis même commande
(les migrations sont additives : ne jamais supprimer de colonne dans la même livraison).
Avant toute migration risquée : `docker compose exec backup node scripts/backup.ts`.

## 5. Exploitation courante

| Besoin | Commande |
|---|---|
| Journaux | `docker compose logs -f api` (JSON, filtrer par `requestId`) |
| État | `docker compose ps` ; `curl -H "Authorization: Bearer $METRICS_TOKEN" https://api.origin.xxx/metrics` |
| Sauvegarde manuelle | `docker compose exec backup node scripts/backup.ts` |
| Test de restauration | `docker compose exec backup node scripts/backup-verify.ts` |
| Publier une vidéo | voir `EXPLOITATION.md` (envoi tus, worker automatique) |

La sauvegarde (chaque nuit) et le chien de garde (5 min) sont déjà des services du compose : **rien à planifier à la main**.
Reste à faire par toi : copie **hors site** du volume `data` (dossier `backups`) et choix du webhook d'alerte.

## 6. Limites connues (honnêtes)

- **Une seule machine** : une panne du serveur coupe tout jusqu'à restauration (compter ~1 h avec les sauvegardes). Acceptable à 1 000 utilisateurs.
- **Pas de redéploiement sans interruption** : quelques secondes de coupure à chaque mise à jour de l'API.
- **E-mails** : toujours journalisés, pas envoyés (réinitialisation de mot de passe inutilisable en ligne tant que l'envoi n'est pas branché).
- **Images Docker non encore construites** ni testées sur un vrai serveur ; premier déploiement = première validation.
- **Test de charge** à refaire depuis une autre machine contre le vrai CDN (voir `TEST-DE-CHARGE.md`).
