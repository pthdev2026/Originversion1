# Module « progress » — reprise de lecture (étape B3)

**Rôle :** retenir où chaque compte s'est arrêté, pour une vidéo de 2 h comme pour 15 s.

| Fichier | Rôle |
|---|---|
| `routes.ts` | HTTP : valide, appelle le service |
| `service.ts` | Règles : durée de référence du média, fin à 95 % / 30 s, position bornée |
| `repository.ts` | SQL : `watch_progress`, avec protection contre les envois dans le désordre (`client_ts`) |

Données propres à chaque compte, supprimées avec lui. Voir `docs/API-CONTRACT.md`.
