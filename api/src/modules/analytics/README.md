# Module « analytics » — mesure de la qualité de lecture (étape B3)

**Rôle :** mesurer l'expérience réelle pour piloter l'objectif « hyper fluide ».

- Le navigateur envoie un rapport **cumulatif** de session toutes les ~15 s (`POST /api/playback-sessions`, anonyme mais **autorisé par un jeton signé** délivré avec la lecture : voir `session-token.ts`).
- On garde le maximum de chaque compteur : les envois peuvent arriver dans le désordre.
- `GET /api/admin/metrics/playback` : synthèse p50/p75/p95 de démarrage, ratio de coupures, erreurs, qualités, objectifs.

Vie privée : aucune adresse IP, aucun identifiant de compte, aucun user-agent brut.
Fichiers : `metrics.ts` (validation, enregistrement, synthèse), `routes.ts`.
