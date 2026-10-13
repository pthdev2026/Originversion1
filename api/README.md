# API ORIGIN

Service Node.js (Hono, TypeScript exécuté nativement par Node ≥ 22.18) + PostgreSQL 17.
**Architecture et principes : [../docs/ARCHITECTURE-BACKEND.md](../docs/ARCHITECTURE-BACKEND.md).**
Contrat avec le front : [../docs/API-CONTRACT.md](../docs/API-CONTRACT.md).

## Démarrage local

```bash
npm install
npm run db:start      # terminal 1 : PostgreSQL local (127.0.0.1:5433)
npm run dev           # terminal 2 : API sur http://127.0.0.1:4000 (applique les migrations)
npm run typecheck     # types stricts
npm test              # tests (schéma PostgreSQL jetable)
```

## Ajouter un programme lisible

```bash
node ../video-pipeline/encode-hls.mjs source.mp4 mon-film --out ../storage/videos/hls
npm run ingest -- mon-film --kind film --title "Mon film"       # --demo pour un contenu de démonstration
```

## Configuration

Voir `.env.example`. En production, `DATABASE_URL`, `MEDIA_SECRET` (32 caractères min.) et `CORS_ORIGINS` sont obligatoires :
le démarrage est refusé s'ils manquent.

## Ce qui n'existe pas encore
Comptes et droits, reprise de lecture, mesure de lecture, limitation de débit, catalogue éditorial, sauvegardes.
