# Hero Stream Magic

on va coder une platform de streaming, suis le brief fais uniquement la hero

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://hero-stream-magic.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9b584903-24be-4bc2-9ae2-64e136052858).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```


## Voir le site sans back-end (aperçu hors connexion)
Le back-end ORIGIN n'est pas dans ce dépôt. Sans lui, le site s'ouvre sur des **contenus de démonstration** (bandeau « Aperçu hors connexion ») : accueil, fiches, classement, recherche, univers des créateurs. La **lecture vidéo, les comptes, Ma liste et la progression** demandent l'API.
```bash
bun install
bun run dev            # sans API : aperçu hors connexion automatique (et si l'API locale est arrêtée)
```
Avec l'API : lancer le back-end (`http://localhost:4000`) puis `bun run dev` ; en production, renseigner `VITE_API_URL` (voir `.env.example`). Avec `VITE_API_URL` renseignée dans un build de production, une panne de l'API affiche l'écran « Réessayer » : l'aperçu de démonstration n'y est jamais utilisé.
