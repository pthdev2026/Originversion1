# Fiches par compartiment

Un agent reçoit **une** fiche : son périmètre, ses fichiers, ses invariants, ses commandes, sa définition de « terminé » et ce qu'il ne doit pas toucher.
Lecture commune préalable : `../README.md`, `../01-…`, `../03-…`, `../11-…`, `../10-…`.

| Fiche | Compartiment | Modules / zones |
|---|---|---|
| [AGENT-catalogue-reco.md](AGENT-catalogue-reco.md) | Catalogue éditorial, recherche, recommandations | `catalog`, `recommendation`, `mylist`, `progress` |
| [AGENT-pipeline-video.md](AGENT-pipeline-video.md) | Envoi, encodage, QC, publication, CDN, sous-titres, ident | `ingest`, `playback`, `media`, `subtitles`, `platform/storage` |
| [AGENT-comptes-securite.md](AGENT-comptes-securite.md) | Identité, sessions, 2FA, RGPD, protections | `identity`, `privacy`, `platform/http` |
| [AGENT-exploitation-deploiement.md](AGENT-exploitation-deploiement.md) | Déploiement, sauvegardes, supervision, charge | `ops`, `analytics`, `deploy/`, `scripts/`, `platform/backup` |
| [AGENT-back-office.md](AGENT-back-office.md) | Application d'administration réservée au propriétaire (`admin/`) | consomme l'API ; cahier des charges `docs/CAHIER-DES-CHARGES-BACK-OFFICE.md` |
| [AGENT-qualite-tests.md](AGENT-qualite-tests.md) | Tests, garde-fous, contrat, documentation | `*.test.ts`, `architecture/contract/context-docs tests`, `docs/` |

**Chevauchements** : un changement qui traverse deux compartiments (ex. une nouvelle colonne de catalogue utilisée par la recherche) se déclare dans la fiche du compartiment propriétaire de la **table** ; l'autre agent est informé via `docs/DECISIONS.md`.
