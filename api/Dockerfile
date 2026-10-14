# Image unique de l'API ORIGIN : sert à la fois l'API, le travailleur d'encodage, les sauvegardes et le chien de garde.
# Node 24 exécute le TypeScript directement : pas d'étape de compilation.
FROM node:24-bookworm-slim

# ffmpeg/ffprobe : nécessaires au travailleur d'encodage (B4).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# Dépendances d'abord (couche mise en cache tant que package*.json ne change pas).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY migrations ./migrations
COPY src ./src
COPY scripts ./scripts
COPY tsconfig.json ./

# Données persistantes (montées en volume) : stockage vidéo et sauvegardes. Utilisateur non privilégié.
RUN mkdir -p /data/storage /data/backups && chown -R node:node /data /app
USER node
ENV STORAGE_ROOT=/data/storage BACKUP_DIR=/data/backups HOST=0.0.0.0 PORT=4000 UV_THREADPOOL_SIZE=16

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "src/main.ts"]
