# 04 — Données et modules

Vérifié le : 30/10/2026 · Sources : `api/migrations/*.sql` (font foi), `api/src/modules/*/README.md`, `docs/ARCHITECTURE-BACKEND.md`

## 1. Règles de la base de données
- **Migrations** : fichiers `NNN_nom.sql` dans `api/migrations/`, appliquées dans l'ordre au démarrage de l'API, chacune dans une transaction, **sous verrou** (deux instances ne s'entrecroisent pas). Suivi : table `schema_migrations`. La numérotation saute la 002 (volontaire, ne pas « combler »).
- **Additives seulement** : on ajoute, on ne supprime pas de colonne dans la livraison qui la rend inutile (retour arrière possible). Jamais modifier une migration déjà appliquée : en créer une nouvelle.
- **Contraintes en base** (CHECK, UNIQUE, clés étrangères) : la base est la dernière ligne de défense, pas seulement le code.
- **Identifiants** : `slug` et `playback_id` suivent `^[a-z0-9][a-z0-9-]*$` (≤ 120 car.). Les adresses e-mail sont stockées normalisées (minuscules).
- **Jamais de secret en clair** : mots de passe (argon2id), jetons de session / réinitialisation / vérification (empreinte SHA-256), secrets TOTP (AES-256-GCM, clé hors base), codes de secours (empreinte).
- **Test** : chaque test d'intégration crée un schéma jetable (`test_<hex>`) et le supprime ; il se **saute** si PostgreSQL est injoignable.

## 2. Les tables (28), par domaine
| Domaine | Table | Rôle et points clés | Migration |
|---|---|---|---|
| Catalogue | `programs` | Un programme (film/série/documentaire/`brand`). `slug` PK ; `published` (brouillon = false), `is_demo`, présentation (tagline, category, genres[], badges[], visuels `*_url`, `title_style`), `search_text` (maintenu par trigger) | 001, 007, 008, 009 |
| Catalogue | `seasons`, `episodes` | Saisons/épisodes d'une série. `episodes.key` (ex. `s1-e2`) → `playbackId = <slug>-<key>` | 008 |
| Catalogue | `themes`, `program_themes` | Thématiques (foi, famille, pardon…) et liens N-N | 008 |
| Catalogue | `creators` | Créateurs affichés (nom, ambiance, photo, `published`) | 008 |
| Catalogue | `collections`, `collection_items` | Listes ordonnées (`layout` ∈ hero, ranked, rail, portrait, panels, universes ; `home_position`) ; position unique par collection | 008 |
| Vidéo | `media_assets` | Un média encodé. `playback_id` PK ; `status` processing/ready/failed ; une ligne `ready` **doit** avoir une durée (CHECK) ; `storage_path`, `renditions` (jsonb) | 001 |
| Vidéo | `mux_uploads` | Suivi des envois vers **Mux** (statut waiting/processing/ready/failed/canceled) ; **un seul envoi actif par média** ; l'adresse d'envoi n'est jamais conservée. `media_assets` gagne `provider` (`self`\|`mux`), `provider_asset_id`, `provider_playback_id`, `provider_policy` | 013 |
| Vidéo | `uploads` | Envois reprenables (protocole tus) : offset, statut, métadonnées | 006 |
| Vidéo | `media_jobs` | File d'encodage avec **bail** (`locked_until`), `state` (points de reprise, mesure de volume), 3 tentatives ; **une seule tâche active par média** (index unique partiel) | 006, 007 |
| Vidéo | `subtitle_tracks` | Piste WebVTT par (média, langue) ; une seule `is_default` | 010 |
| Comptes | `users` | Compte : rôle viewer/admin, statut, verrouillage, `email_verified_at`, `two_factor_enabled` | 003, 011, 012 |
| Comptes | `sessions` | Sessions (empreinte du jeton seulement), expiration, révocation | 003 |
| Comptes | `password_resets`, `email_verifications` | Jetons à usage unique, durée limitée (1 h / 24 h) | 003, 011 |
| Comptes | `invitations` | Codes d'invitation (empreinte, usages max) | 003 |
| Comptes | `user_preferences`, `user_themes`, `email_changes` | Préférences (document validé, valeurs par défaut dans le code), thématiques préférées, changement d'adresse par code (empreinte, 5 essais, 15 min). `users` gagne `locale` et la photo ; `sessions` gagne `public_id` et `device` (libellé approximatif, jamais d'IP) | 014 |
| Univers de créateur | `creator_contents` | Contenus rattachés à un créateur par rubrique (message, conférence, série, direct), 1 « à la une » ; `creators` gagne alias, domaine, accroche, accent, chapitres | 015 |
| Recherche et appareils | `search_history`, `login_devices` | Dernières recherches d'un compte (20 max) ; appareils déjà vus (alerte de nouvelle connexion). `programs` gagne `keywords` | 017 |
| Programmation | _(colonnes de `programs`)_ | `publish_at`, `unpublish_at`, `announced` : sortie/retrait planifiés (tâche toutes les 30 s dans `main.ts`) et annonce « Prochainement » | 019 |
| Porte de publication | _(colonnes de `programs`)_ | `release_blocked_at`, `release_blocked_missing` : sortie planifiée bloquée tant que les médias obligatoires ne sont pas prêts | 020 |
| Cadrage éditorial des thématiques | _(colonnes de `themes`)_ | `subtitle` (promesse en une ligne), `featured_slug` (programme « phare » affiché en premier) | 021 |
| Repères de lecture | _(colonnes de `media_assets`)_ | `intro_start_seconds`, `intro_end_seconds`, `credits_start_seconds` : « Passer l'intro » et « Épisode suivant » | 018 |
| Contact | `contact_messages` | Messages du formulaire « Nous contacter », purgés avec l'audit | 016 |
| Comptes | `user_totp`, `user_recovery_codes` | Double authentification : secret chiffré, `last_step` anti-rejeu, codes de secours à usage unique | 012 |
| Comptes | `audit_log` | Qui a fait quoi, quand (sans IP) ; `user_id` → NULL à la suppression du compte | 003 |
| Spectateur | `watch_progress` | Reprise : (compte, playbackId) → position ; `client_ts` ignore les envois en retard | 004 |
| Spectateur | `my_list` | « Ma liste » (≤ 500 par compte) | 004 |
| Mesure | `playback_sessions` | Qualité de lecture **anonyme** (démarrage, coupures, erreurs, appareil) | 005 |
| Système | `schema_migrations` | Migrations appliquées | (auto) |

Suppression d'un compte (RGPD) : `ON DELETE CASCADE` sur sessions, progression, liste, jetons, 2FA ; `uploads`/`media_jobs`/`invitations` passent à `NULL` ; le journal d'audit est anonymisé.

## 3. Les modules (`api/src/modules/`)
| Module | Responsabilité | Fichiers clés | Détails |
|---|---|---|---|
| `health` | Le service est-il vivant ? | `routes.ts` | `/health` |
| `ops` | Prêt (`/ready`), supervision (`/metrics`), tableau de bord admin, **entretien horaire** | `routes.ts`, `maintenance.repository.ts` | 09 |
| `contact` | Formulaire « Nous contacter » : dépôt public limité, lecture et traitement par l'administration | `routes.ts`, `repository.ts` | 05, 08 |
| `account` | Espace personnel : profil, préférences, appareils connectés, thématiques préférées, photo de profil, changement d'e-mail par code | `service.ts`, `repository.ts`, `routes.ts`, `preferences.ts` | 05, 08 |
| `identity` | Comptes, sessions, rôles, invitations, e-mail vérifié, 2FA TOTP, audit | `service.ts`, `repository.ts`, `routes.ts`, `middleware.ts`, `password.ts`, `totp.ts`, `session-cookie.ts` | 08 |
| `catalog` | Catalogue éditorial : lecture publique, administration, recherche, visuels | `content.ts` (lectures), `admin.ts` (écritures), `schemas.ts` (zod), `routes.ts`, `images.ts` | 05 |
| `playback` | « Je veux regarder » → URL signée, ident, sous-titres | `service.ts`, `delivery.ts`, `ident-policy.ts`, `routes.ts` | 06 |
| `media` | Jetons de lecture et distribution des fichiers HLS (mode origine) | `token.ts`, `bunny-token.ts`, `routes.ts` | 06 |
| `ingest` | Envoi tus, file de tâches, encodage, contrôle qualité, publication ; **possède `media_assets`** | `uploads.routes.ts`, `jobs.*.ts`, `worker.ts`, `pipeline/*` | 06 |
| `mux` | Voie vidéo **Mux** : demande d'une adresse d'envoi, suivi, inscription de la vidéo prête, signature des liens de lecture (JWT RS256) | `client.ts` (API Mux), `service.ts` (règles + poller), `signer.ts`, `jwt.ts`, `repository.ts`, `routes.ts` | 06 |
| `subtitles` | Dépôt (admin) et distribution (public) des sous-titres WebVTT | `routes.ts`, `repository.ts` | 06 |
| `progress` | Reprise de lecture (règle 95 % / 30 s) | `service.ts`, `repository.ts`, `routes.ts` | 05 |
| `mylist` | « Ma liste » | `repository.ts`, `routes.ts` | 05 |
| `analytics` | Mesure de lecture (QoE) + tableau de bord éditorial | `metrics.ts`, `routes.ts` | 10 |
| `recommendation` | Similaires, tendances, « pour vous » | `scoring.ts` (règles pures), `repository.ts`, `routes.ts` | 05 |
| `privacy` | Export des données d'un compte (RGPD) | `repository.ts`, `routes.ts` | 08 |

## 4. Le socle `platform/`
`logger.ts` (pino, masquage des secrets) · `errors.ts` (`AppError`, codes) · `mail.ts` (journal ou Resend) · `http/` (middlewares, gestion d'erreurs, limiteur de débit, métriques, cache à durée de vie) ·
`database/` (client, migrations) · `storage/` (plan de rangement `layout.ts`, `media-store.ts` local ou Bunny) · `backup/` (chiffrement, sauvegarde logique, copie de fichiers) · `system/health.ts`.

## 5. Rangement des fichiers sur disque
```
storage/
├── videos/sources/<playbackId>/   sources d'origine — à SAUVEGARDER (non régénérables)
├── videos/hls/<playbackId>/       rendus diffusés (master.m3u8, qualités, poster.jpg, meta.json) — régénérables
├── videos/uploads/, work/         envois en cours, dossiers de travail d'encodage
├── images/<slug>/                 visuels éditoriaux (servis par /images)
├── subtitles/<playbackId>/        <lang>.vtt (servis par /subtitles)
├── avatars/<clé>.<ext>            photos de profil (clé aléatoire, servies par /avatars ; DONNÉES PERSONNELLES : sauvegardées, supprimées avec le compte)
└── pgdata/                        PostgreSQL de développement
```
Les **thématiques vivent dans la base**, jamais dans l'arborescence : un programme appartient à plusieurs thèmes sans être copié.
