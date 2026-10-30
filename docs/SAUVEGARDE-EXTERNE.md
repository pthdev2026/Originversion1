# ORIGIN — Stratégie de sauvegarde externalisée, chiffrée et restaurable (30/10/2026)

## 1. État actuel (vérifié)
`scripts/backup.ts` : base **logique** (CSV+gzip) **chiffrée AES-256-GCM** (phrase `BACKUP_PASSPHRASE`) + manifeste et empreintes SHA-256 + copie incrémentale des fichiers non régénérables (sources, images, sous-titres, photos de profil) + rotation. `scripts/backup-verify.ts` fait une **restauration d'essai** dans un schéma temporaire (mesuré le 30/10 : 32 tables, 235 lignes, une mauvaise phrase est refusée). `restore.ts` restaure.
**Faiblesse** : les sauvegardes sont écrites sur **le même volume** (`/data/backups`) que la base. Une perte de la machine = perte des deux.

## 2. Objectif
| Mesure | Cible proposée |
|---|---|
| Perte de données maximale (RPO) | ≤ 24 h (sauvegarde nocturne) ; à resserrer plus tard par archivage continu des journaux de PostgreSQL |
| Temps de reprise (RTO) | ≈ 1 h sur une machine neuve (à **prouver** par un exercice) |
| Où | **Hors de la machine ET chez un autre fournisseur** |
| Confidentialité | Archives **déjà chiffrées avant l'envoi** : le fournisseur de stockage ne voit rien |

## 3. Architecture
1. **Niveau 1 — sur la machine** : la sauvegarde nocturne existante (inchangée).
2. **Niveau 2 — copie externe chiffrée** : un second conteneur (`deploy/backup-offsite.sh`, **préparé, non exécuté**) copie chaque nuit les nouvelles archives `db-*` et les fichiers vers un stockage compatible S3 d'**un autre fournisseur** avec `rclone` ; conservation : 14 quotidiennes + 8 hebdomadaires + 6 mensuelles (à ajuster).
3. **Niveau 3 — instantané de la machine** (option du fournisseur) : filet de sécurité, **pas** la sauvegarde principale.
4. **Hors ligne** : la phrase de chiffrement et la clé `AUTH_ENCRYPTION_KEY` dans un **gestionnaire de mots de passe** (jamais sur la machine seule : sans elles, les sauvegardes et les secrets 2FA sont **irrécupérables**).

## 4. Procédure de restauration (à répéter chaque mois)
1. Machine vierge, Docker installé, dépôt cloné (voir `docs/PUBLICATION-GITHUB-PRIVEE.md`).
2. Recréer `deploy/.env.production` depuis le gestionnaire de mots de passe.
3. `rclone copy <stockage-externe>:origin-backups ./restore/` (dernière archive `db-*`).
4. `docker compose up -d postgres` puis `docker compose run --rm api node scripts/restore.ts` (voir `docs/EXPLOITATION.md` §6).
5. Démarrer l'API, vérifier `/ready`, se connecter avec un compte connu, lire un programme.
6. **Consigner** la durée réelle (c'est le RTO mesuré) et tout écart.

## 5. Ce qui reste à faire
- Choisir le stockage externe (autre fournisseur) et créer ses identifiants **par vous** (jamais dans le chat ni Git).
- Tester `backup-offsite.sh` avec un vrai stockage ; premier exercice de restauration complet.
- Alerte si la dernière copie externe a plus de 26 h (le chien de garde surveille déjà l'âge de la sauvegarde locale).
