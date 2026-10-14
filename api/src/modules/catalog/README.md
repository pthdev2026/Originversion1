# Module « catalog » — le catalogue éditorial

**Rôle :** tout ce que le spectateur voit AVANT de lire : programmes, saisons/épisodes, collections ordonnées (Hero, Top 10, rails),
thématiques, créateurs, visuels, recherche. L'équipe éditoriale le pilote par l'API d'administration, sans redéployer le front.

| Fichier | Rôle |
|---|---|
| `repository.ts` | Liste des programmes lisibles (contrat historique `GET /api/programs`) |
| `content.ts` | Lectures publiques : fiche, accueil, collections, thèmes, créateurs, recherche (SQL + mise en forme JSON) |
| `admin.ts` | Écritures éditoriales, en transaction, par document complet |
| `schemas.ts` | Validation stricte des documents d'administration (zod) |
| `routes.ts` | Routes HTTP (public + `/api/admin/*`), cache public de 30 s |
| `images.ts` | Distribution publique des visuels `storage/images/<slug>/…` (images + mp4 avec Range, pas de SVG) |

## Règles
- Un contenu est un **brouillon** (`published = false`) tant que l'administrateur ne le publie pas ; les contenus de marque (`kind = brand`) ne sont jamais publics.
- `playable` vient des médias réellement prêts : on ne promet jamais une lecture inexistante.
- Identifiant de lecture : film = `<slug>` ; épisode = `<slug>-<clé>` (clé du type `s1-e2`).
- L'encodage n'écrase jamais la fiche éditoriale d'un programme existant.
- Les adresses d'image sont `https://…` ou `/images/…` (jamais d'autre schéma).
- Recherche : colonne `search_text` tenue par un trigger SQL (sans extension), plis des accents par `origin_fold()`.

## Importer / exporter
- `npm run catalog:import -- fichier.json` : thèmes → programmes → créateurs → collections, même validation que l'API, idempotent.
- `npm run catalog:export-front` : lit le catalogue de démonstration du front et produit `seed/catalog-demo.json` (+ `--copy` pour les visuels).
