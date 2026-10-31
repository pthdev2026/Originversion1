#!/bin/sh
# Fabrique un film de TEST sans aucun droit d'auteur (mire vidéo + tonalité générées par FFmpeg) : idéal pour valider la chaîne
# d'envoi → encodage → lecture sur un serveur, sans utiliser un vrai film.
#   ./deploy/make-test-video.sh [secondes=120] [fichier=test-film.mp4]
# FFMPEG_PATH peut désigner un ffmpeg précis. Le fichier produit n'est jamais versionné (.gitignore : *.mp4).
set -eu
SECONDS_LONG="${1:-120}"
OUT="${2:-test-film.mp4}"
FFMPEG="${FFMPEG_PATH:-ffmpeg}"
"$FFMPEG" -y -loglevel error \
  -f lavfi -i "testsrc2=size=1280x720:rate=25:duration=${SECONDS_LONG}" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=${SECONDS_LONG}" \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -g 100 -c:a aac -b:a 128k -shortest "$OUT"
echo "Contenu de test créé : $OUT ($(du -h "$OUT" | cut -f1), ${SECONDS_LONG} s, sans droits)"
