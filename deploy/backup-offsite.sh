#!/bin/sh
# Copie EXTERNE des sauvegardes (PRÉPARÉ, JAMAIS EXÉCUTÉ : nécessite un stockage S3 et rclone configuré par le propriétaire).
# Les archives sont DÉJÀ chiffrées (AES-256-GCM) par scripts/backup.ts : rien de lisible ne quitte la machine.
# Variables : OFFSITE_REMOTE (ex. « externe:origin-backups ») ; la configuration rclone est fournie par l'environnement (RCLONE_CONFIG_*), jamais écrite dans le dépôt.
set -eu
: "${OFFSITE_REMOTE:?OFFSITE_REMOTE est requis (ex. externe:origin-backups)}"
SRC="${BACKUP_DIR:-/data/backups}"
[ -d "$SRC" ] || { echo "Dossier de sauvegarde introuvable : $SRC" >&2; exit 1; }
# Copie sans suppression côté distant (une sauvegarde locale effacée par erreur ne détruit pas la copie externe).
rclone copy "$SRC" "$OFFSITE_REMOTE" --checksum --transfers 2 --log-level INFO
# Rétention côté distant : supprime les archives de plus de 180 jours (à ajuster à la stratégie 14/8/6).
rclone delete "$OFFSITE_REMOTE" --min-age 180d --log-level INFO
# Contrôle : la plus récente archive locale existe bien à distance.
LATEST="$(ls -1 "$SRC" | sort | tail -n 1)"
rclone lsf "$OFFSITE_REMOTE" | grep -q "^$LATEST" && echo "Copie externe vérifiée : $LATEST" || { echo "ALERTE : $LATEST absente de la copie externe" >&2; exit 2; }
