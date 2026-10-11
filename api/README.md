# API ORIGIN (lecture vidéo)

Service Node.js (Hono, TypeScript exécuté nativement par Node ≥ 22.18) + PostgreSQL 17.

## Démarrage local

```bash
npm install
npm run db:start      # terminal 1 : PostgreSQL local (127.0.0.1:5433), données dans ../storage/pgdata
npm run dev           # terminal 2 : API sur http://127.0.0.1:4000 (applique les migrations au démarrage)
npm test              # tests (schéma PostgreSQL jetable ; la base de dev n'est pas touchée)
```

PostgreSQL est fourni par le paquet `embedded-postgres` (vrais binaires PostgreSQL 17, aucune installation système).
En production, on pointe `DATABASE_URL` vers un PostgreSQL géré ; le SQL est identique.

## Ajouter un programme lisible

```bash
# 1. encoder (voir ../video-pipeline)
node ../video-pipeline/encode-hls.mjs source.mp4 mon-film --out ../storage/hls
# 2. l'enregistrer en base
npm run ingest -- mon-film --kind film --title "Mon film"       # ajouter --demo pour un contenu de démonstration
```

L'identifiant de lecture suit la convention du front : `<slug>` pour un film, `<slug>-<épisode>` pour un épisode.

## Routes

| Route | Rôle |
|---|---|
| `GET /health` | Santé du service et de la base |
| `GET /api/programs` | Programmes ayant au moins un média prêt |
| `GET /api/programs/:id/playback` | URL signée du manifeste HLS, poster, durée, paliers. `404` si le média n'est pas prêt |
| `GET /media/:token/:id/*` | Fichiers HLS (Range supporté). Jeton HMAC dans le chemin, 4 h, lié au programme |

## Schéma (`migrations/001_init.sql`)

- `programs` : slug, type (film / série / documentaire), titre, drapeau `is_demo`.
- `media_assets` : un média encodé par identifiant de lecture, avec statut (`processing` / `ready` / `failed`), durée, paliers, chemin de stockage.
- Un média n'est lisible que s'il est `ready` et possède une durée (contrainte en base).

Les migrations sont des fichiers SQL numérotés, appliquées dans une transaction, tracées dans `schema_migrations`.

## Ce qui n'existe pas encore
- Le catalogue éditorial (visuels, synopsis, saisons) vit toujours dans le front ; la base ne porte que ce qui conditionne la lecture.
- Pas de comptes, de droits ni de profils.
- Pas de mesure de lecture (démarrage, coupures) : table à ajouter avec les métriques.
- Pas de sauvegarde automatique de `storage/pgdata`.
