# Image du front MILLENIUM (TanStack Start, rendu côté serveur) pour l'ORIGINE UNIQUE.
# Contexte de construction = le dépôt du front (hero-stream-magic), voir deploy/docker-compose.yml.
# Le front n'intègre AUCUN secret : seule l'adresse publique de l'API (VITE_API_URL) est figée dans le code envoyé au navigateur.
FROM oven/bun:1 AS build
WORKDIR /src
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
ARG VITE_API_URL
ARG VITE_SUPPORT_EMAIL=
# `node-server` : sortie autonome exécutable par Node (le réglage par défaut du dépôt cible Cloudflare, utile à Lovable).
ENV NITRO_PRESET=node-server VITE_API_URL=$VITE_API_URL VITE_SUPPORT_EMAIL=$VITE_SUPPORT_EMAIL
RUN bun run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=build /src/.output ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
