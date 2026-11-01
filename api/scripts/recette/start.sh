#!/bin/bash
# Environnement de RECETTE JETABLE : base `origin_recette` + API :4020 + page de test :4021.
# Ne touche JAMAIS à la base de développement ni à ses comptes. Les identifiants d'administration sont
# générés au hasard et gardés dans $RECETTE_DIR (droits 600), jamais affichés.
set -euo pipefail
API_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ROOT="$(cd "$API_DIR/.." && pwd)"
RECETTE_DIR="${RECETTE_DIR:-/tmp/origin-recette}"
API_PORT=4020; BENCH_PORT=4021
FRONT_ORIGINS="${FRONT_ORIGINS:-http://localhost:3211,http://localhost:$BENCH_PORT}"
cd "$API_DIR"

[ -f "$RECETTE_DIR/api.pid" ] && "$API_DIR/scripts/recette/stop.sh" >/dev/null 2>&1 || true
mkdir -p "$RECETTE_DIR/storage" && umask 077

BASE=$(node -e "import('./src/config/env.ts').then(m=>console.log(m.DEV_DATABASE_URL))")
RECETTE_URL=$(node -e "const u=new URL(process.argv[1]);u.pathname='/origin_recette';console.log(u.toString())" "$BASE")
sqlrun() { node -e "import('./src/platform/database/client.ts').then(async m=>{const s=m.connect(process.argv[1],{max:1});const r=await s.unsafe(process.argv[2]);console.log(JSON.stringify(r));await s.end()})" "$1" "$2"; }
sqlrun "$BASE" "DROP DATABASE IF EXISTS origin_recette" >/dev/null
sqlrun "$BASE" "CREATE DATABASE origin_recette" >/dev/null

# Médias de test : liens en LECTURE vers le stockage de développement (rien n'y est écrit : pas de worker en recette).
# Vidéos : un dossier PROPRE à la recette dont chaque entrée est un lien vers le stockage de développement (jamais d'écriture dans celui-ci).
mkdir -p "$RECETTE_DIR/storage/videos/hls" "$RECETTE_DIR/storage/videos/sources" "$RECETTE_DIR/storage/videos/work"
for d in "$ROOT"/storage/videos/hls/*; do ln -sfn "$d" "$RECETTE_DIR/storage/videos/hls/$(basename "$d")"; done
# Deux épisodes de recette pour la série PTH (série de test des états « En cours / Vu »), alimentés par le clip de 15 s.
for ep in s2-e8 s2-e7; do ln -sfn "$ROOT/storage/videos/hls/tout-recommencer" "$RECETTE_DIR/storage/videos/hls/les-secrets-du-ministere-$ep"; done
ln -sfn "$ROOT/storage/images" "$RECETTE_DIR/storage/images"

ADMIN_EMAIL="recette-admin@origin.test"
ADMIN_PW="Rc-$(openssl rand -hex 12)-Z9!"
printf '%s\n%s\n' "$ADMIN_EMAIL" "$ADMIN_PW" > "$RECETTE_DIR/admin.cred"

export DATABASE_URL="$RECETTE_URL" STORAGE_ROOT="$RECETTE_DIR/storage" HOST=127.0.0.1 PORT=$API_PORT CORS_ORIGINS="$FRONT_ORIGINS" \
       PUBLIC_APP_URL="${RECETTE_PUBLIC_URL:-http://localhost:3211}" NODE_ENV=development LOG_LEVEL=warn MAIL_PROVIDER=log MEDIA_SECRET="recette-secret-recette-secret-1234567890"
nohup node ${RECETTE_ENV_FILE:+--env-file=$RECETTE_ENV_FILE} src/main.ts > "$RECETTE_DIR/api.log" 2>&1 < /dev/null & echo $! > "$RECETTE_DIR/api.pid"
for i in $(seq 1 60); do curl -s -m 1 localhost:$API_PORT/health >/dev/null && break; sleep 0.5; done
curl -s -m 2 localhost:$API_PORT/health | grep -q '"ok"' || { echo "API de recette non démarrée"; tail -5 "$RECETTE_DIR/api.log"; exit 1; }

ADMIN_PASSWORD="$ADMIN_PW" node scripts/create-admin.ts "$ADMIN_EMAIL" >/dev/null
JAR="$RECETTE_DIR/admin.jar"
curl -s -c "$JAR" -H 'content-type: application/json' -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PW\"}" localhost:$API_PORT/api/auth/login >/dev/null
# Catalogue de recette : COPIE du catalogue de développement (programmes, saisons, épisodes, thèmes, collections, créateurs) et de ses médias prêts.
# Aucun compte, aucune session, aucune progression ni liste n'est copié.
node scripts/recette/seed-catalog.ts "$BASE" "$RECETTE_URL"
for ep in s2-e8 s2-e7; do
  sqlrun "$RECETTE_URL" "INSERT INTO media_assets (playback_id, program_slug, status, storage_path, duration_seconds, source_width, source_height, renditions) VALUES ('les-secrets-du-ministere-$ep','les-secrets-du-ministere','ready','les-secrets-du-ministere-$ep',15.083,1920,1080,'[]'::jsonb)" >/dev/null
done

# Page de test (origine DIFFÉRENTE de l'API, même site : comme le vrai front) + hls.js (copie du front, lecture seule).
mkdir -p "$RECETTE_DIR/bench"; cp "$API_DIR/scripts/recette/bench.html" "$RECETTE_DIR/bench/index.html"
cp "$ROOT/app/node_modules/hls.js/dist/hls.min.js" "$RECETTE_DIR/bench/hls.min.js" 2>/dev/null || echo "(hls.js introuvable : la lecture ne sera pas testée)"
(cd "$RECETTE_DIR/bench" && nohup python3 -m http.server $BENCH_PORT --bind 127.0.0.1 > "$RECETTE_DIR/bench.log" 2>&1 < /dev/null & echo $! > "$RECETTE_DIR/bench.pid")
sleep 1
echo "Recette prête : API http://localhost:$API_PORT · page de test http://localhost:$BENCH_PORT/ · base origin_recette (jetable)"
