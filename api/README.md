# API ORIGIN (lecture vidéo)

Service Node.js (Hono, TypeScript exécuté nativement par Node ≥ 22.18). Étape 3 du plan : distribution locale des rendus HLS et autorisation de lecture.

```bash
npm install
npm run dev     # http://127.0.0.1:4000
npm test
```

| Route | Rôle |
|---|---|
| `GET /health` | Santé du service |
| `GET /api/programs/:id/playback` | URL signée du manifeste HLS, poster, durée, paliers. `404` si aucune vidéo n'est encodée |
| `GET /media/:token/:id/*` | Fichiers HLS (Range supporté). Jeton HMAC dans le chemin, expiration 4 h, lié au programme |

Configuration : voir `.env.example`. En production, `MEDIA_SECRET` est obligatoire.

## Ce qui n'existe pas encore
- Pas de base de données : un programme est « disponible » s'il existe un dossier encodé avec `meta.json`.
- Pas de comptes ni de droits (qualité, accès).
- Pas de mesure de lecture côté serveur.
