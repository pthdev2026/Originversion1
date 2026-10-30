# ORIGIN — Brief pour l'agent front : brancher le front « Millenium » sur l'API (30/10/2026)

Rédigé par l'agent back-end. **Source de vérité des formes de réponse : `docs/API-CONTRACT.md` (v1.7)** — ce brief dit *quoi brancher, dans quel ordre, avec quelles règles* ; il ne recopie pas les formats. Contexte : `docs/ANALYSE-FRONT-VS-BACKEND-2026-10-30.md`.

## 0. Règles qui valent partout
1. **Aucun design ne change.** Boutons et cartes sont figés (validés le 30/10). On remplace des données de démonstration par de vraies données, rien d'autre.
2. Variable `VITE_API_URL`. Tous les appels `/api/*` : `fetch(..., { credentials: 'include' })`. Front et API sur le même site (dev : `localhost:3210` et `localhost:4000`, **pas** `127.0.0.1`).
3. Le cookie de session est `httpOnly` : le front ne le lit ni ne l'écrit. L'état connecté = résultat de `GET /api/me` (`401` = visiteur).
4. Erreurs : forme `{error, message, requestId}`. Afficher `message` tel quel (déjà en français). Sur `429`, attendre `Retry-After`. Sur `5xx`/réseau : « Service momentanément indisponible » + Réessayer. Montrer `requestId` seulement sur les écrans d'erreur technique.
5. Les URLs de lecture (`manifestUrl`, `posterUrl`) sont **opaques** : ne jamais les construire. `avatar.url` est relative à l'API : préfixer par `VITE_API_URL`.
6. Aucun secret, aucun mot de passe, aucune clé dans le code du navigateur. Supprimer le mot de passe de démonstration.
7. Les codes de valeur des préférences (`quality: "eco"`…) sont stables : l'écran les **traduit** en libellés.
8. Branche de travail dédiée, jamais directement sur `main` ; ne pas pousser vers Lovable sans accord du propriétaire.

## 1. Phase 1 — Socle (bloquant pour tout le reste)
Porter depuis `front/comptes-securite` (sans les réécrire) : `env.ts`, `brand.ts`, `origin-api.ts`, `auth-api.ts`, `auth-context.tsx`, `catalog-api.ts`, `home-data.ts`, `program-data.ts`, `use-catalog-search.ts`, `use-hls.ts`, `playback-recovery.ts`, pages `reinitialiser` et `verifier-email`. **Vérifier chaque fichier contre le contrat v1.7** : il a évolué (profil enrichi, préférences, créateurs, recherche corrigée).
Critère de fin : `GET /api/home` s'affiche à la place des données locales, sans changement visuel.

## 2. Phase 2 — Authentification
| Écran | Routes | Points d'attention |
|---|---|---|
| Inscription | `POST /api/auth/register` | `409` = adresse déjà utilisée ; `403` = invitation requise (si `REGISTRATION_MODE=invite`) |
| Connexion | `POST /api/auth/login` | message d'échec **unique** (ne pas distinguer e-mail/mot de passe) ; `429` = compte verrouillé 15 min |
| 2e facteur | même route, champ `code` | réponse `401` de code `two_factor_required` = afficher le champ ; code faux = autre `401`. Codes de secours acceptés dans le même champ |
| Déconnexion | `POST /api/auth/logout` | `204` |
| Mot de passe oublié / réinitialisation | `POST /api/auth/password/forgot` (toujours `202`), `…/reset` | le lien e-mail ouvre `/reinitialiser?token=` |
| Vérification d'e-mail | `POST /api/auth/email/verify`, `POST /api/me/email/verification` | lien `/verifier-email?token=` |
| Activer / désactiver la 2FA | `/api/me/2fa/setup`, `/enable`, `/disable` | voir contrat « Double authentification TOTP » (recovery codes affichés **une seule fois**) |

Retirer `demo-accounts` / `demo-session`.

## 3. Phase 3 — Catalogue, recherche, fiche
| Écran | Routes |
|---|---|
| Accueil (hero, Top 10, rails, thématiques, créateurs) | `GET /api/home` (un seul appel) |
| Classement complet | `GET /api/collections/ranking` (famille = `category`) |
| Page programme | `GET /api/programs/:slug` (saisons, épisodes, `playable`) · `GET /api/programs/:slug/similar` |
| Recherche plein écran | `GET /api/search?q=` — **nouveau** : afficher « Résultats pour *correctedQuery* » quand il est non nul |
| Complétion à la frappe | `GET /api/search/suggestions?q=` (dès 1 caractère, *debounce* ~150 ms) |
| Recherches récentes (compte connecté) | `GET/POST/DELETE /api/me/searches`, `DELETE /api/me/searches/item` — **appeler `POST` à la validation de la recherche, pas à chaque lettre** |
| « Pour vous » | `GET /api/recommendations` |
| Pages thématique / créateur | `GET /api/themes/:slug` · `GET /api/creators` · `GET /api/creators/:slug` (alias, domaine, accroche, `accent` « R G B », chapitres, contenus par rubrique ; le « direct » est une **annonce datée**, pas un flux) |

## 4. Phase 4 — Lecture vidéo (la plus importante)
1. `GET /api/programs/:playbackId/playback` ; `404 not_available` = « pas encore disponible » (**pas** une erreur technique).
2. Lecteur : hls.js, sinon HLS natif (Safari/iOS). Redemander `/playback` si `expiresAt` dépassé ou `403` sur un segment (`playback-recovery.ts`).
3. **Ident** : suivre `ident.show` sans réinterpréter. Envoyer `identSeen=1` (visiteur anonyme, mémoire locale) et `autoplay=1` (épisode enchaîné).
4. **Reprise** : `PUT /api/me/progress/:playbackId` toutes les ~10–15 s et à la pause/fermeture (`sentAt` = horodatage navigateur) ; au lancement `GET /api/me/progress/:playbackId` (`404` = jamais commencé).
5. **Mesure de lecture** : voir contrat « Mesure de lecture ».
6. **Sous-titres** : la réponse de lecture contient `subtitles` (tableau de pistes WebVTT, `url` absolue à donner telle quelle à `<track>`) ; le choix par défaut Aucun/Français/English vient des préférences (`subtitles`, `subtitleSize`).
7. Choix de langue **audio** : **non disponible** (une seule piste). Masquer ou marquer « bientôt » ; ne pas simuler.

## 5. Phase 5 — « Votre espace »
| Bloc | Routes |
|---|---|
| Profil (nom, langue, date d'inscription) | `GET /api/me` (`createdAt`, `locale`, `avatar`) · `PATCH /api/me` |
| Photo de profil | `PUT /api/me/avatar` (préréglage 0–7 / zoom / `null`) · `PUT /files/me/avatar` (corps = image brute jpg/png/webp ≤ 5 Mo) · `GET /avatars/:file` |
| Changement d'e-mail | `POST /api/me/email/change` puis `…/confirm` (code à 6 chiffres, 5 essais, 15 min) |
| Mot de passe | `POST /api/me/password` |
| Appareils connectés | `GET /api/me/sessions` · `DELETE /api/me/sessions/:id` (`409` = session courante) · `POST /api/me/sessions/revoke-others` |
| Préférences | `GET/PUT /api/me/preferences` |
| Thématiques préférées (page « Bienvenue ») | `GET/PUT /api/me/themes` (12 max) — alimente « Pour vous » dès l'inscription |
| Ma liste | `GET /api/me/list` · `PUT /api/me/list/:slug` · `DELETE /api/me/list/:slug` |
| Continuer à regarder | `GET /api/me/continue-watching` (contient `episode`) · `DELETE /api/me/progress/:id` pour retirer |
| Historique | réglage `history` dans les préférences · `DELETE /api/me/history` pour l'effacer |
| Mes données | `GET /api/me/export` |
| Supprimer mon compte | `POST /api/me/delete` **exige `{password}`** |

**À corriger côté front :** la boîte « Supprimer mon compte » demande aujourd'hui de taper « SUPPRIMER » ; l'API exige le **mot de passe**. Demander le mot de passe (garder « SUPPRIMER » en plus si souhaité). Retirer `demo-space`.

## 6. Phase 6 — Divers
| Écran | Route |
|---|---|
| « Nous contacter » | `POST /api/contact` `{name, email, topic?, message}` + champ caché `website` **toujours vide** (piège anti-robot) · 5 envois/h/IP → `429` |
| Pages légales | à rédiger par le propriétaire — rester « provisoires » |
| Notifications | seul le **choix** est enregistré (préférences) ; aucun envoi pour l'instant — ne pas promettre davantage dans l'écran |

## 7. Ce qui n'existe PAS (ne pas simuler)
Connexion Google/Apple · diffusion en direct réelle · audio multilingue · contenus en anglais · envoi de notifications · profils multiples. Masquer ou marquer « bientôt » ; ne jamais faire semblant.

## 8. Recette (à passer avant de rendre la main)
1. Inscription → e-mail de vérification → connexion → déconnexion.
2. Mot de passe oublié → réinitialisation → ancien mot de passe refusé.
3. Activer la 2FA → se reconnecter avec code → désactiver.
4. Rechercher avec une faute (« thriler ») : la correction s'affiche.
5. Lancer un film : ident, lecture, quitter à mi-parcours, revenir : reprise à la bonne position ; apparaît dans « Continuer à regarder ».
6. Ajouter/retirer de « Ma liste » ; recharger la page : l'état persiste.
7. Se connecter depuis un 2e navigateur : voir l'appareil, le déconnecter ; e-mail d'alerte reçu.
8. Photo de profil, nom, préférences : persistent après rechargement.
9. Exporter ses données ; supprimer le compte avec le mot de passe.
10. Aucun appel à `127.0.0.1` ; aucune erreur dans la console ; aucun secret dans le code livré.

## 9. Comment signaler un besoin back-end
Écrire dans `docs/API-REQUESTS.md` (route manquante, champ absent, comportement inattendu) avec l'écran concerné ; l'agent back-end répond et met le contrat à jour. **Ne jamais contourner** une route manquante par une donnée simulée sans le signaler.
