# 05 — API et contrat

Vérifié le : 30/10/2026 · **Source de vérité : `docs/API-CONTRACT.md` (v1.5)** — ce fichier n'en est qu'une carte. Le test `api/src/contract.test.ts` garantit que le contrat et les routes du code sont identiques.

## 1. Conventions générales
| Sujet | Règle |
|---|---|
| Format | JSON UTF-8. Base : `VITE_API_URL` côté front (local `http://localhost:4000`) |
| Erreurs | Toujours `{ "error": "<code>", "message": "<français lisible>", "requestId": "<uuid>" }`. Codes : `bad_request` 400, `unauthorized` 401, `two_factor_required` 401/403, `forbidden` 403, `not_found`/`not_available` 404, `conflict` 409, `payload_too_large` 413, `rate_limited` 429, `internal_error` 500, `unavailable` 503 |
| Indisponibilité | Panne/saturation de la base → **503 + `Retry-After: 5`** (jamais 500). Doublon → 409. |
| Cache | `/api/*` : `Cache-Control: no-store`, **sauf** catalogue public : `public, max-age=30, stale-while-revalidate=120` (et cache serveur 30 s, vidé à chaque écriture admin de l'instance) |
| Authentification | Cookie de session `httpOnly` (`origin_session`, `__Host-origin_session` en production), `credentials: 'include'`. **Front et API sur le même site** (ex. `origin.example` / `api.origin.example`) |
| CSRF | Toute écriture avec un en-tête `Origin` hors `CORS_ORIGINS` → 403 |
| Limites | Par IP et par minute : API 120 (défaut), média 3 000, auth 10, mesure 120. Corps ≤ 64 Ko, délai 10 s |
| Identifiants | `playbackId` : `<slug>` (film/doc) ou `<slug>-<clé>` (épisode, clé `s1-e2`). Regex `^[a-z0-9][a-z0-9-]*$` |
| URLs opaques | `manifestUrl`, `posterUrl`, `subtitles[].url`, visuels : à utiliser **telles quelles** (préfixer par l'adresse de l'API si elles commencent par `/images/`) |
| Honnêteté | `isDemo`, `playable`, `personalized`, `reason` : voir `02-charte-editoriale-et-marque.md` §4 |

## 2. Familles de routes (extrait ; liste complète dans le contrat)
| Famille | Routes principales | Accès |
|---|---|---|
| Santé | `GET /health`, `/ready`, `/metrics` (Bearer `METRICS_TOKEN`) | public / supervision |
| Lecture | `GET /api/programs/:playbackId/playback` (→ manifeste signé, durée, qualités, **ident**, **sous-titres**) ; `GET /media/:token/:id/*` (HLS en mode origine) | public (ou compte si `PLAYBACK_REQUIRES_LOGIN`) |
| Catalogue | `GET /api/home` (accueil en 1 appel), `/api/programs/:slug` (fiche + saisons/épisodes), `/api/collections/:slug`, `/api/themes`, `/api/themes/:slug`, `/api/creators`, `/api/search?q=` ; `GET /api/programs` (historique : programmes lisibles) | public |
| Visuels, sous-titres | `GET /images/:slug/:file`, `GET /subtitles/:playbackId/:lang.vtt` | public |
| Recommandations | `GET /api/programs/:slug/similar`, `/api/trending`, `/api/recommendations` | public / compte |
| Comptes | `POST /api/auth/{register,login,logout,email/verify,password/forgot,password/reset}`, `GET /api/me`, `POST /api/me/{password,delete,email/verification,2fa/setup,2fa/enable,2fa/disable}` | public / compte |
| Univers de créateur | `GET /api/creators/:slug`, `GET /api/admin/creators[/:slug]`, `PUT /api/admin/creators/:slug/contents` | public / admin |
| Validation d'une sortie bloquée (v1.14) | `POST /api/admin/programs/:slug/release` | admin |
| Programmation (v1.9) | `GET /api/coming-soon`, `GET /api/admin/schedule` (+ `publishAt`, `unpublishAt`, `announced` dans le document programme) | public / admin |
| Lecture (v1.8) | `GET /api/programs/:slug/play-target`, `PUT /api/admin/media/:playbackId/markers` (+ `content`, `resume`, `markers`, `next` dans `GET …/playback`) | public / admin |
| Recherche | `GET /api/search`, `GET /api/search/suggestions`, `GET/POST/DELETE /api/me/searches`, `DELETE /api/me/searches/item` | public / compte |
| Journal du catalogue | `GET /api/admin/audit` | admin |
| Contact | `POST /api/contact`, `GET /api/admin/contact`, `POST /api/admin/contact/:id/handled` | public / admin |
| Espace compte | `PATCH /api/me`, `GET/PUT /api/me/preferences`, `GET /api/me/sessions`, `DELETE /api/me/sessions/:id`, `POST /api/me/sessions/revoke-others`, `GET/PUT /api/me/themes`, `PUT /api/me/avatar`, `PUT /files/me/avatar`, `GET /avatars/:file`, `POST /api/me/email/change[/confirm]`, `DELETE /api/me/history` | compte |
| Spectateur | `PUT/GET/DELETE /api/me/progress/:playbackId`, `GET /api/me/continue-watching`, `GET/PUT/DELETE /api/me/list[/:slug]`, `GET /api/me/export`, `GET /api/me/progress?program=<slug>` (progression de tous les épisodes d'un programme) | compte |
| Classement complet | `GET /api/ranking` | public |
| Mesure | `POST /api/playback-sessions` (anonyme + jeton `analytics.token` de la lecture, 403 sinon) | public + jeton |
| Administration éditoriale | `GET /api/admin/catalog`, `PUT/DELETE /api/admin/{programs,themes,creators,collections}/:slug` | admin (+2FA) |
| Administration vidéo | `POST /uploads` + `PATCH/HEAD/GET/DELETE /uploads/:id` (tus), `GET /api/admin/jobs[/:id]`, `POST /api/admin/jobs/:id/{cancel,retry}`, `PUT/DELETE /files/subtitles/:playbackId/:lang` | admin (+2FA) |
| Administration système | `GET /api/admin/{system,metrics/playback,metrics/programs}`, `POST /api/admin/invitations` | admin |

## 3. Règles métier à connaître avant de toucher une route
- **Reprise** : envoi toutes les 10–15 s ; terminé à **95 %** ou **< 30 s** de la fin (contenus ≥ 2 min) ; durée de référence = celle du média côté serveur ; envois plus anciens ignorés (`sentAt`).
- **Ident** : décision serveur (`ident.show`), jamais recalculée par le front ; `?identSeen=1` (anonyme) et `?autoplay=1` pris en compte.
- **Connexion** : message d'échec unique ; 5 échecs → verrouillage 15 min ; si 2FA active et `code` absent → `401 two_factor_required` (pas un échec).
- **Mot de passe oublié** : toujours 202, même contenu/délai que le compte existe ou non.
- **Catalogue** : brouillon et `kind = brand` invisibles ; `playable` = au moins un média `ready` ; film sans épisodes déclarés → une entrée synthétique `feature` ; série sans épisodes mais avec médias prêts → épisodes déduits.
- **Recherche** : 2–80 caractères, sans accents ni casse, tous les mots requis, titres d'abord.
- **Administration** : documents **complets** validés strictement (`strict`), refus des champs inconnus ; adresses d'image `https://…` ou `/images/…` uniquement.

## 4. Comment faire évoluer l'API (procédure obligatoire)
1. Annoncer le changement dans `docs/API-CONTRACT.md` (nouvelle version) **dans le même commit** que le code.
2. Ajouter/adapter les tests (le test de contrat échoue sinon).
3. Compatibilité : ajouter des champs est sûr ; renommer/supprimer ne l'est pas — l'annoncer et coordonner avec l'agent front via `docs/API-REQUESTS.md`.
4. Une demande du front passe **uniquement** par `docs/API-REQUESTS.md` (le front n'invente pas de champ).
5. Pas de versionnement d'URL tant qu'il n'y a qu'un client (seuil de révision : clients tiers).
