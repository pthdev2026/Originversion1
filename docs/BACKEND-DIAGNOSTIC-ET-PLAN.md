# ORIGIN — Back-end : diagnostic et plan (13/10/2026)

Objectif : une **maquette back-end totalement fonctionnelle**, solide, capable de servir **1 000 personnes
regardant jusqu'à 2 heures de vidéo**. Le catalogue éditorial est hors périmètre pour l'instant.

## 1. Dimensionnement de l'objectif

| Grandeur | Valeur | Calcul |
|---|---|---|
| Stockage d'un titre de 2 h (4 qualités) | ≈ 8 à 9 Go | ~9,2 Mb/s cumulés × 7 200 s |
| Source d'un titre de 2 h | 10 à 20 Go | À conserver et sauvegarder |
| Données livrées par spectateur (2 h, ~2,5 Mb/s) | ≈ 2,25 Go | |
| Pour 1 000 spectateurs | ≈ 2,25 To | ≈ 11 à 22 $ (Europe / Amérique du Nord), ≈ 135 $ (Afrique, tarif Standard) |
| Pic réaliste (10 % simultanés) | 100 flux ≈ 300 Mb/s | |
| Pic « première » (100 % simultanés) | 1 000 flux ≈ 2,5 à 5 Gb/s | **Le CDN est obligatoire** |
| Requêtes de segments au pic | ≈ 250 / s (1 par spectateur et par 4 s) | Trivial pour un CDN |
| Mesure de lecture (rapport toutes les 15 s) | ≈ 67 requêtes / s | Trivial pour l'API |

## 2. Mesures réelles du back-end actuel (13/10/2026, machine de développement)

| Test | Résultat | Lecture |
|---|---|---|
| `GET /playback` (avec base), 100 connexions, 8 s | **≈ 12 960 req/s**, p99 = 15 ms, 0 erreur | L'API n'est pas le goulot |
| Segment HLS (2,3 Mo), 200 connexions | **≈ 1,65 Gb/s** sur le port local, 1 processus, latence p50 ≈ 6 s | Une seule instance sature : en réel, une carte réseau de 1 Gb/s limite à ~300–400 flux |

Conclusion : **l'origine seule ne tient pas 1 000 flux simultanés ; l'API, oui, très largement.**
Tout le travail de robustesse porte sur la distribution (CDN), l'identité, la résilience et l'exploitation.

## 3. Diagnostic : ce qui est solide / fragile

| Domaine | État | Remarque |
|---|---|---|
| Lecture signée | Solide pour la V1 | Jeton HMAC dans le chemin ; à adapter au jeton du CDN |
| Accès aux fichiers | Solide | Pas de sortie de dossier, Range, tests |
| Base de données | Correcte | 2 tables, migrations ; pas de sauvegarde, pas de réplication |
| Configuration | Fragile | Pas de validation stricte des variables, secret éphémère en dev |
| Journalisation | Absente | `console.log` seulement, pas d'identifiant de requête |
| Sécurité HTTP | Insuffisante | Pas de limitation de débit, pas d'en-têtes de sécurité, CORS minimal |
| Identité | Inexistante | Aucun compte, aucun droit |
| Pipeline média | Manuel | Script local, pas de file de tâches, pas de reprise, pas de contrôle qualité |
| Stockage | Disque local | Pas d'abstraction (S3/Bunny) |
| Supervision / sauvegardes | Inexistantes | |
| Tests | Partiels | 12 tests API ; pas de test de charge |
| Déploiement | Inexistant | Tout sur un Mac |

## 4. Plan par étapes (chaque étape se termine par des critères de réussite vérifiables)

| Étape | Contenu | Durée | Critères de réussite |
|---|---|---|---|
| **B0 Hygiène** | Dépôt back-end privé séparé de Lovable, CI (types, tests), validation de configuration, journaux structurés avec identifiant de requête, arrêt propre, santé/disponibilité | 2 j | CI verte ; démarrage refusé si configuration invalide ; chaque requête a un identifiant dans les logs |
| **B1 Sécurité** | Limitation de débit, en-têtes de sécurité, CORS strict, validation des entrées, secrets hors du code, politique de jetons | 3–4 j | Test d'abus : 429 au-delà du seuil ; aucun secret dans le dépôt ; analyse de dépendances propre |
| **B2 Identité** | Comptes, mots de passe (argon2), sessions en cookie httpOnly, rôles (spectateur / admin), réinitialisation, journal d'audit, droit de lecture vérifié avant de signer | 1–2 sem. | Impossible de lire sans session valide ; tests d'autorisation ; verrouillage après tentatives |
| **B3 Domaine de lecture** | Reprise (progression), « Ma liste », mesure de lecture (qualité d'expérience) idempotente | 1 sem. | Reprise exacte à ±5 s ; rapports tolérants au désordre ; agrégats de démarrage et de coupures |
| **B4 Pipeline média** | Stockage abstrait (disque / S3 / Bunny), file de tâches en base, worker d'encodage avec statut et reprise, envoi de gros fichiers reprenable, contrôles qualité (durée, segments, pistes) | 1–2 sem. | Un fichier de 2 h s'ingère de bout en bout, une panne en cours reprend, une vidéo corrompue est rejetée |
| **B5 Diffusion / CDN** | Bunny Storage + CDN, jeton d'authentification du CDN, en-têtes de cache (segments immuables), protection de l'origine | 1 sem. | Segments servis depuis le CDN ; origine peu sollicitée ; jeton expiré refusé par le CDN |
| **B6 Exploitation** | Métriques, alertes de disponibilité, tableau de bord de lecture, sauvegarde automatique de la base et des sources, test de restauration, procédures d'incident | 1 sem. | Restauration complète réussie en moins d'une heure ; alerte reçue en panne simulée |
| **B7 Charge** | Scénarios k6 : 1 000 spectateurs simultanés, 2 h accélérées, pic de démarrage, panne du processus | 3–5 j | p95 de démarrage < 2 s ; erreurs < 0,5 % ; 0 perte de session |
| **B8 Déploiement** | Conteneurs, VPS en Europe, HTTPS, environnement de test, déploiement automatisé, retour arrière | 1 sem. | Déploiement sans interruption ; retour arrière en < 5 min |

Total indicatif : **6 à 8 semaines**. Ordre : B0 → B1 → B4 → B5 en parallèle de B2/B3 → B6 → B7 → B8.

## 4 bis. Ce que l'objectif « 2 h × 1 000 » impose

- **Encodage** : 2 h de source 1080p ≈ 7 à 10 h d'encodage sur un poste (preset `medium` ≈ 3,7× la durée) : prévoir un worker dédié et des tâches reprenables.
- **Envoi** : une source de 10–20 Go ne passe pas en une requête : envoi par morceaux reprenable.
- **Reprise de lecture** : indispensable pour 2 h ; sans elle, l'expérience est mauvaise.
- **Heures de pointe** : décider si une « première » simultanée est visée ; sinon, 10 % de simultanéité suffit.

## 5. Décisions à prendre avant B2 / B5
1. Modèle d'accès (gratuit, invitation, payant).
2. Géographie de l'audience (coût du CDN).
3. Authentification maison ou service géré.
4. Hébergement (VPS Europe vs autre).
