# ORIGIN — Checklist de mise en ligne (30/10/2026)

Légende : ✅ terminé et vérifié · 🧪 écrit, **à tester** hors du Mac · ✋ **intervention du propriétaire** · ⛔ bloqué par un compte, une clé ou une décision.

## A. Code et intégration
- ✅ Back-end : 286 tests ; migrations 001–020 ; contrat API v1.14.
- ✅ MILLENIUM (branche `front/integration-hero`, publiée) : connexion, Ma liste, accueil réel, fiches réelles, lecture, progression/reprise, « Continuer à regarder », vérifiés en navigateur réel (mobile + ordinateur), deux comptes isolés. Détail : `MATRICE-INTEGRATION-MILLENIUM.md`.
- 🧪 **Reste simulé dans MILLENIUM** : recherche (faite par l'agent front, non vérifiée par moi), classement, catégories, espace compte (avatar, appareils, préférences), mot de passe oublié, double authentification, pages légales.
- ✅ **Règle de publication validée** : une sortie planifiée n'est appliquée que si tous les médias obligatoires sont prêts (blocage, trace, alerte, validation éditoriale) — 6 tests. 🧪 L'e-mail d'alerte n'a jamais été envoyé en réel.
- 🧪 Back-office : pas d'écran pour valider une sortie bloquée, saisir repères/sous-titres/programmation, composer la Hero.

## B. Sécurité des données et du code
- ✅ Aucun secret dans les dépôts (contrôle du 30/10) ; `api/.env` ignoré, droits 600.
- ✋ Créer les dépôts privés `origin-backend` et `origin-back-office` puis publier (`PUBLICATION-GITHUB-PRIVEE.md`).
- ✋ **Régénérer le jeton Mux** (il a transité par une conversation) ; ne jamais coller de clé dans le chat ou Git.
- 🧪 Sauvegarde externe chiffrée (`SAUVEGARDE-EXTERNE.md`, `deploy/backup-offsite.sh`) : à brancher à un stockage d'un autre fournisseur, puis **exercice de restauration** chronométré.
- ✋ Gestionnaire de mots de passe : `BACKUP_PASSPHRASE`, `AUTH_ENCRYPTION_KEY`, `MEDIA_SECRET` (leur perte est irrécupérable).

## C. Déploiement
- 🧪 Job CI `deploy-smoke` (construction de l'image, migrations, `/ready`, FFmpeg, sauvegarde + restauration d'essai dans un environnement jetable) : **écrit, jamais exécuté** (il part au premier push GitHub). Colima inutile (`PREPRODUCTION-OPTIONS.md` §4).
- ✋ Décision d'hébergement (`PREPRODUCTION-OPTIONS.md` : recommandation VPS + Docker Compose + Mux, comparaison sans prix) ; achat du serveur et du nom de domaine ; compte e-mail (Resend, domaine vérifié SPF/DKIM).
- 🧪 HTTPS réel, cookie `__Host-` entre front et API sur un vrai domaine (point le plus fragile).
- 🧪 Surveillance : `ALERT_WEBHOOK_URL` à renseigner ; `METRICS_TOKEN`.

## D. Vidéo (Mux)
- ✅ Intégration réelle validée une fois (4 s) ; lecture signée écrite et testée avec une clé factice ; jetons : durée adaptée aux films longs.
- ⛔ **Clé de signature Mux** à créer par vous ; essai d'un film long en lecture publique puis signée ; coût mesuré (`PLAN-TEST-MUX-FILM-LONG.md`). **Aucune consommation Mux sans votre accord.**
- 🧪 Webhooks Mux : **absents** (interrogation toutes les 10 s à la place) — à ajouter avec signature vérifiée quand le serveur sera public.
- ✅ Pipeline local FFmpeg/HLS intact (film de 85 min encodé et lu).

## E. Sécurité (revue ciblée) — état
- ✅ Vérifié : cookie `httpOnly`, session côté serveur, CORS (origine étrangère refusée), en-têtes de sécurité, limitation de débit, isolation de deux comptes, session expirée, liens de lecture falsifiés refusés (403), identité jamais lue hors du cookie.
- ✅ **Revue ciblée du 30/10/2026** (`api/src/security.test.ts`, 13 tests, exécutés sur les routes réellement enregistrées) : toute route `/api/admin`, `/files` et `/uploads` refuse l'anonyme (401) et le spectateur (403) ; toute route `/api/me` exige une session ; aucune route publique « par oubli » (liste blanche explicite, un test échoue si une nouvelle route n'est pas classée) ; toute écriture portant le cookie mais venant d'une origine étrangère est refusée (403) ; cookie de production `__Host-` HttpOnly Secure SameSite sans Domain ; corps démesuré ou JSON cassé → 400/413 jamais 500 ; envois tus (taille excessive, identifiants et types piégés) refusés ; traversée de chemins sur `/media`, `/images`, `/subtitles`, `/avatars` impossible ; jetons falsifiés refusés ; aucune trace de pile ni de SQL dans les erreurs ; connexion et « mot de passe oublié » identiques que l'adresse existe ou non.
- 🔧 **Défaut trouvé et corrigé** : `POST /api/me/2fa/enable`, `POST /api/me/2fa/disable` et `DELETE /api/me/searches/item` validaient le corps avant de vérifier la session (réponse 400 au lieu de 401 sans compte, aucune donnée exposée). La session est maintenant vérifiée en premier.
- 🟡 **Risque accepté** : `POST /api/playback-sessions` est public (mesure anonyme, voulu pour l'envoi à la fermeture de page) ; seule la limitation de débit globale le protège contre une pollution des statistiques.
- 🧪 **Pas encore fait** : test d'intrusion externe, essai Safari/Firefox, test de charge **sur le vrai serveur** (le local ne prouve rien sur l'infrastructure publique).

## F. Avant d'inviter des utilisateurs
Pages légales publiées · sauvegarde externe restaurée avec succès une fois · film réel lu en HTTPS sur ordinateur, iPhone et Android · bêta fermée de 20 à 50 personnes (`PLAN-MISE-EN-LIGNE.md`).
