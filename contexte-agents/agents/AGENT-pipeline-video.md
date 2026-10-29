# Agent — Pipeline vidéo, diffusion, sous-titres, ident

**Mission** : qu'une vidéo envoyée par un administrateur devienne, sans intervention fragile, un contenu lisible, fluide et au bon volume, servi par le CDN.

## Périmètre
`api/src/modules/ingest/` (`uploads.*`, `jobs.*`, `worker.ts`, `pipeline/{ffmpeg,run-job,qc,playlist,errors}.ts`), `playback/` (`service.ts`, `delivery.ts`, `ident-policy.ts`), `media/`, `subtitles/`, `platform/storage/`, scripts `worker.ts`, `enqueue.ts`, `ingest.ts`, `cdn-check.ts`, migrations 006–007, 010.

## Invariants
- Aucune vidéo incomplète visible : **publication atomique** puis inscription en base ; QC avant publication.
- Reprise : points de reprise par qualité (`state.completedRungs`) et mesure de volume conservée (`state.loudness`) ; `report()` remplace `state` en entier → **toujours renvoyer les deux**.
- Une seule tâche active par média (index unique partiel) ; bail + `FOR UPDATE SKIP LOCKED`.
- Pas de sur-échantillonnage ; segments de 4 s ; H.264/AAC ; volume −16 LUFS (piste muette = non corrigée, jamais un échec).
- Outils lancés avec une **liste d'arguments** (jamais un shell).
- `registerAsset` n'écrase jamais la fiche éditoriale d'un programme existant.
- `/uploads/*` réservé à tus ; dépôts annexes sous `/files/*`.
- L'ident est décidé côté serveur (fonction pure) ; un échec d'ident ne bloque jamais la lecture.
- URLs signées : jeton lié au média, durée `MEDIA_TTL_SECONDS`, rotation par `MEDIA_SECRET_PREVIOUS` ; en mode `bunny`, jeton de **répertoire** dans le chemin.

## Chantiers ouverts
1. **Valider Bunny sur une vraie zone** (`docs/GUIDE-BUNNY.md`, `npm run cdn:check`) — le format du jeton n'est qu'une lecture de la documentation.
2. Refaire le test de charge `origin`/`api` depuis une autre machine contre le CDN.
3. Version courte de l'ident (3,5–4 s) — décision éditoriale préalable.
4. Option : encoder sur un poste fort et publier vers Bunny (un film de 2 h ≈ 4–5 h sur le Mac).
5. Conversion SRT→VTT côté serveur (non prévu en v1).

## Tests de référence
`ingest/ingest.test.ts`, `ingest/pipeline/encode.e2e.test.ts` (**vrai ffmpeg**, volume, reprise, Bunny simulé), `playback/*.test.ts`, `media/*.test.ts`, `subtitles/subtitles.test.ts`.

## Terminé quand
Test e2e avec ffmpeg réel vert · reprise après interruption testée · fiche `06-…` à jour · contrat à jour si la réponse de lecture change.

## Ne pas toucher
Le lecteur côté front, les règles éditoriales, le schéma des comptes.
