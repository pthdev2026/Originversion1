# ORIGIN — Brief back-end complet (01/11/2026)

Document de référence unique : mission, architecture, fonctions, sécurité, vidéo, exploitation, état réel, décisions ouvertes, règles de travail. Détails techniques : `contexte-agents/` (13 fiches), `docs/API-CONTRACT.md` (v1.17), `docs/DEPLOIEMENT-PREPRODUCTION.md`.

## 1. Mission et périmètre
- **Produit** : plateforme de streaming (ORIGIN / MILLENIUM) — objectif ≈ 1 000 personnes en Europe, films/séries/documentaires jusqu'à 2 h, accès gratuit d'abord.
- **Le back-end possède** : identité, catalogue éditorial, progression/reprise, Ma liste, recherche, classements, autorisation de lecture, pipeline vidéo, statistiques de lecture, sécurité, exploitation, contrat d'API, cohérence front ↔ back ↔ back-office.
- **Il ne possède pas** : l'interface MILLENIUM (agent front), les écrans d'administration (agent back-office). Aucun agent ne modifie le dépôt d'un autre sans coordination.

## 2. Architecture
Monolithe modulaire : **Node 24 (TypeScript natif) + Hono + PostgreSQL 17 (`postgres`) + zod + pino**. Couches routes → service → accès aux données ; le SQL n'existe que dans les fichiers prévus (test d'architecture). Un service API, un worker d'encodage, une sauvegarde nocturne, un chien de garde, derrière Caddy (HTTPS automatique).
Modules : `identity` (comptes, sessions, 2FA) · `account` (profil, appareils, recherches récentes, export) · `catalog` (programmes, collections, thématiques, créateurs, recherche, classement, planification) · `recommendation` (similaires, tendances, « pour vous ») · `playback` (autorisation de lecture, cible de lecture) · `progress` · `mylist` · `analytics` (statistiques) · `ingest` (envoi, file, FFmpeg) · `mux` · `media` (liens signés, fichiers) · `subtitles` · `privacy` · `contact` · `health` · `ops`.
Chiffres : ≈ 94 routes, 20 migrations (001, 003–021), ≈ 8 800 lignes, **324 tests** (dont contrat, architecture, sécurité, dossier de contexte). Dépôt : 86 commits, aucun distant.

## 3. Fonctions opérationnelles
- **Comptes** : inscription (ouverte/invitation), connexion, déconnexion, mot de passe oublié, confirmation d'e-mail, double authentification TOTP + codes de secours (obligatoire pour les administrateurs), alerte de nouvel appareil, appareils, export, suppression.
- **Catalogue** : programmes (film/série/documentaire), saisons/épisodes, collections, Top 10 éditorial, thématiques (sous-titre, phare, phare de repli), créateurs ; **classement complet** stable et paginé ; **tendances** (audience réelle 14 j, ≥ 10 s) ; recherche tolérante aux fautes + suggestions.
- **Publication contrôlée** : brouillon par défaut ; planification (`publishAt`/`unpublishAt`) ; **porte de publication** (sortie bloquée si médias non prêts, alerte e-mail, validation éditoriale) ; un envoi vidéo ne publie jamais seul.
- **Espace personnel** : Ma liste, progression, reprise, « Continuer à regarder », fin de programme, historique désactivable, thématiques favorites.
- **Lecture** : `GET /api/programs/:id/playback` (lien signé, sous-titres, repères intro/générique, épisode suivant, reprise) ; `play-target` (Regarder / Reprendre / Revoir / suivant).
- **Statistiques** : `POST /api/playback-sessions` autorisé par un **jeton signé** délivré avec la lecture (anti-truquage du Top 10), temps plafonné au temps écoulé, une séance = une ligne.

## 4. Vidéo (deux voies, choix par média)
| | Pipeline maison (`self`) | Mux (`mux`) |
|---|---|---|
| Préparation | Worker FFmpeg : 3–4 qualités, HLS fMP4, volume normalisé, reprise après panne | Mux |
| Stockage / diffusion | Volume du serveur via `/media` (jetons) ; ou **Bunny** (`DELIVERY_MODE=bunny`) | Mux (CDN inclus) |
| Protection | Liens signés 4 h | Lecture **signée** (JWT RS256) |
| État | Éprouvé : film réel de 85 min encodé et lu | **Éprouvé avec le vrai Mux** (essai 4 s, lecture signée vérifiée) ; **aucun vrai film encore** |
- **Configuration actuelle** (`api/.env`, non versionné) : jeton et clé de signature Mux en place, qualité **plus** (≈ 0,025–0,031 $/min à l'entrée), politique `signed`, `VIDEO_PROVIDER=mux`.
- Plafond de la voie maison : l'origine seule sature vers 100–160 spectateurs → CDN ou Mux obligatoire pour 1 000.

## 5. Sécurité (revue ciblée du 30/10, refaite par tests)
Cookie de session HttpOnly (`__Host-origin_session` en production), argon2id (2 hachages simultanés max), anti-CSRF par contrôle d'`Origin` (l'adresse publique est toujours de confiance), liste d'origines CORS, limites de débit (**par IP**), droits vérifiés sur **toutes** les routes enregistrées (test automatique, toute route non classée fait échouer la suite), anti-traversée de chemins, uploads validés, erreurs sans détail interne, délai maximal de 20 s par requête SQL, caches bornés (zones séparées, « introuvable » 15 s). Journal d'audit.
**Point faible connu** : limites par IP (≈ 10 spectateurs derrière la même connexion peuvent être refusés) — à passer par compte pour les connectés.

## 6. Capacité (mesures locales, un seul Mac)
Trafic de 1 000 spectateurs ≈ 150 req/s ; tenu : 1 725 req/s, 0 erreur, p99 0,8 s, 204 Mo (≈ 10× de marge). Base à 10 000 comptes : 41 Mo, requêtes ≈ 0,1 ms. Catalogue de 5 000 programmes : 0 erreur après cache. **Jamais mesuré** sur un vrai serveur ni depuis Internet.

## 7. Exploitation et déploiement
`deploy/` : Docker Compose (Caddy, web, API, PostgreSQL, worker, sauvegarde chiffrée, chien de garde), **origine unique** (site + API sous un seul domaine), `.env.production.example`, CI (`verify`, `docker`, `deploy-smoke`). Sauvegarde chiffrée + vérification + restauration (`npm run backup | backup:verify | restore`) ; copie externe prévue (`SAUVEGARDE-EXTERNE.md`). **Rien de tout cela n'a tourné sur un vrai serveur** ; Docker jamais construit ici ; restauration jamais rejouée.
Outils : `db:start`, `db:migrate`, `user:create-admin`, `media:enqueue`, `ingest`, `catalog:import`, `cdn:check`, `mux:check`, `mux:usage`, `watchdog`.

## 8. État d'intégration
Front consolidé (`front/integration-hero`, `959ec8c` publié) ; branche `consolidation/avec-main` prête, non poussée (inclut 3 commits Lovable et le correctif de « Mon compte »). Parcours vérifiés dans un navigateur (ordinateur + mobile, deux comptes) : inscription → connexion → accueil → recherche → fiche → Ma liste → lecture → progression → reprise → déconnexion → reconnexion ; classement, catégories, Tendances ; administration au niveau API (création brouillon → envoi → encodage → publication → lecture). Chrome seulement ; Safari, Firefox, mobile réel à faire.
**Front non branché/à compléter** : aperçu Lovable (pas d'API en ligne) ; page « Recommandations » mobile non recettée. **Back-office** : écrans manquants (validation de sortie bloquée, repères, sous-titres, calendrier, sous-titre/phare des thématiques).

## 9. Données éditoriales à décider
`demo-b4` et `tout-recommencer` publiés sans visuel ni catégorie (compléter / masquer / dépublier) ; 12 titres sur 14 du Top 10 sans média ; 27 programmes sans synopsis ; 28 sans thématique. Rapport : `RAPPORT-DONNEES-EDITORIALES-INCOMPLETES.md`. Règle proposée : publication exigeant visuel + catégorie + synopsis.

## 10. Bloquants (actions du propriétaire)
1. Serveur (Hetzner ≈ 8,49 €/mois ou Hostinger) + nom de domaine + DNS.
2. Deux dépôts GitHub privés (`origin-backend`, `origin-back-office`) + accord de poussée (contrôle des secrets refait : propre).
3. Projet Lovable lié à `hero-stream-magic` à identifier ; décision de fusion dans `main`.
4. Compte e-mail transactionnel (Resend) — sans lui, pas de mot de passe oublié ni de confirmations.
5. Mux : révoquer les anciennes clés ; saisir les nouvelles sur le serveur ; autoriser un premier vrai envoi.

## 11. Prochaines actions techniques (sans attendre)
1. Limites de débit **par compte** pour les connectés. 2. Valider un vrai contenu Mux dans MILLENIUM (après accord). 3. Test de charge sur la préproduction. 4. Restauration de sauvegarde rejouée. 5. Routes d'administration manquantes (utilisateurs/invitations, webhooks Mux, bandes-annonces) et repères/sous-titres côté back-office. 6. Safari/Firefox/mobile réel.

## 12. Décisions produit encore ouvertes
Connexion Google/Apple, profils multiples (écran « Qui regarde ? » déjà côté front, rien côté serveur), notifications, live, audio multiple, contenus en anglais, pages légales, rôle du Top 10 (éditorial ou calculé), fenêtre d'audience (14 j / 10 s).

## 13. Règles de travail
Rien n'est publié (GitHub, `main`, serveur) sans accord explicite ; aucune dépense ni envoi de média à un service externe sans autorisation ; aucun secret dans Git, le chat ou le front (uniquement `api/.env` / `deploy/.env.production`) ; une fonction n'est « terminée » que si elle est vérifiée dans la vraie interface avec le vrai back-end ; contrat d'API versionné et testé ; dossier `contexte-agents/` tenu à jour (un test échoue sinon).
