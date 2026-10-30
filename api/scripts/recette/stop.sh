#!/bin/bash
# Arrête la recette et SUPPRIME la base jetable et ses fichiers temporaires.
API_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RECETTE_DIR="${RECETTE_DIR:-/tmp/origin-recette}"
cd "$API_DIR"
for f in api bench; do [ -f "$RECETTE_DIR/$f.pid" ] && kill "$(cat "$RECETTE_DIR/$f.pid")" 2>/dev/null; done
sleep 1
BASE=$(node -e "import('./src/config/env.ts').then(m=>console.log(m.DEV_DATABASE_URL))")
node -e "import('./src/platform/database/client.ts').then(async m=>{const s=m.connect(process.argv[1],{max:1});await s.unsafe('DROP DATABASE IF EXISTS origin_recette');await s.end()})" "$BASE"
rm -rf "$RECETTE_DIR"
echo "Recette supprimée (base origin_recette, comptes de test, fichiers temporaires)."
