# Sécurité du back-end ORIGIN (étape B1)

Principe : on protège d'abord ce qui compte (la lecture, les comptes à venir, les secrets), on vérifie par des tests,
et on écrit noir sur blanc ce qui N'est PAS encore couvert.

## 1. Ce qu'on protège et contre quoi

| Ce qu'on protège | Menace | Protection en place | Où |
|---|---|---|---|
| Les vidéos (accès non autorisé) | Deviner ou copier une URL de lecture | Jeton signé (HMAC), lié au média, expirant (4 h par défaut) ; comparaison en temps constant | `modules/media/token.ts` |
| Les fichiers du serveur | Lire hors du dossier (`../../etc/passwd`, `%2e%2e`) | Identifiants bornés, `resolveInside`, pourcentage mal formé refusé | `platform/storage/layout.ts`, `modules/media/routes.ts` |
| La disponibilité | Un script qui martèle l'API | Limitation de débit par IP (429 + `Retry-After`) ; mémoire bornée | `platform/http/rate-limit.ts` |
| La disponibilité | Requête qui traîne, gros corps | Délai maximal de 10 s sur l'API ; corps limité à 64 Ko | `platform/http/middleware.ts`, `app.ts` |
| Les secrets | Fuite dans le dépôt ou les journaux | Aucun secret dans le code ; jetons masqués dans les journaux ; secret obligatoire en production | `config/env.ts`, `redactPath` |
| Les secrets | Secret compromis | Rotation sans coupure (`MEDIA_SECRET_PREVIOUS`) | `config/env.ts`, `token.ts` |
| Les réponses | Mise en cache d'URLs signées par un intermédiaire | `Cache-Control: no-store` sur `/api/*` | `middleware.ts` |
| Le navigateur | Détournement de contenu, fuite de l'origine | `nosniff`, `Referrer-Policy: no-referrer`, CORS limité aux origines déclarées | `middleware.ts` |
| La traçabilité | Incident sans piste | Identifiant de requête dans chaque réponse et chaque ligne de journal | `middleware.ts` |

## 2. Réglages (variables d'environnement)

| Variable | Défaut | Rôle |
|---|---|---|
| `MEDIA_SECRET` | généré (dev) / **obligatoire** (prod, 32 caractères min.) | Signe les URLs de lecture |
| `MEDIA_SECRET_PREVIOUS` | — | Ancien secret, accepté le temps d'une rotation |
| `MEDIA_TTL_SECONDS` | 14400 (4 h) | Durée de validité d'une URL |
| `RATE_LIMIT_API_PER_MIN` | 120 | Requêtes `/api/*` par minute et par IP |
| `RATE_LIMIT_MEDIA_PER_MIN` | 3000 | Fichiers `/media/*` par minute et par IP (large : plusieurs foyers peuvent partager une IP) |
| `TRUST_PROXY` | `false` | `true` uniquement derrière un proxy de confiance : lit l'IP dans `X-Forwarded-For` |
| `CORS_ORIGINS` | localhost | **Obligatoire en production** |

⚠️ `TRUST_PROXY=true` sans proxy devant l'API permettrait à n'importe qui de falsifier son adresse et de contourner la limite.

## 3. Rotation d'un secret (sans couper les lectures en cours)

1. Mettre l'ancien secret dans `MEDIA_SECRET_PREVIOUS`, un nouveau dans `MEDIA_SECRET`.
2. Redéployer : les anciens jetons restent valides, les nouveaux sont signés avec le nouveau secret.
3. Après la durée de validité des jetons (4 h), retirer `MEDIA_SECRET_PREVIOUS`.

## 4. Vérifications faites (13/10/2026)

| Contrôle | Résultat |
|---|---|
| Audit des dépendances (`npm audit`) | 0 vulnérabilité |
| Recherche de secrets dans le dépôt | Aucun trouvé ; aucun `.env` suivi par git |
| Tests de sécurité automatisés | 26 tests : jeton, expiration, falsification, rotation, sortie de dossier, pourcentage mal formé, limitation de débit, en-têtes, corps trop gros |
| Type strict | `tsc` sans erreur |

## 5. Ce qui N'EST PAS couvert (à traiter) — mis à jour le 16/10/2026

| Manque | Pourquoi c'est un risque | Quand |
|---|---|---|
| Lecture réservée aux comptes | Par défaut la lecture reste ouverte (`PLAYBACK_REQUIRES_LOGIN=false`) : n'importe qui peut obtenir une URL | Un réglage, à activer quand le front a son écran de connexion |
| E-mails réels non validés | Le fournisseur (Resend) est branché et testé avec un faux serveur, jamais sur un vrai domaine : SPF/DKIM à configurer | À la création du compte Resend |
| Double authentification facultative pour les spectateurs | Seuls les administrateurs peuvent y être obligés (`REQUIRE_ADMIN_2FA`) | Selon le public visé |
| Compteurs de limite partagés entre instances | La limite est par instance | Quand on aura plusieurs instances |
| Jeton du CDN validé sur une vraie zone | Le code suit la documentation Bunny mais n'a pas pu être testé sans compte : `npm run cdn:check` est le juge | À la création du compte |
| Protection DDoS réseau | Hors de portée de l'application | Fournisseur / CDN |
| Chiffrement du contenu (DRM) | Les URLs signées empêchent le partage facile, pas la copie par un spectateur | Si un ayant droit l'exige |
| HTTPS | Fourni par Caddy dans `deploy/` (certificat automatique), jamais testé sur un vrai domaine | B8 |
| Sauvegarde hors site | Les sauvegardes sont chiffrées et testées, mais restent sur la même machine par défaut | À la mise en ligne |
| Analyse de vulnérabilités continue | `npm audit` propre aujourd'hui (0 faille), pas de veille automatique | Activer Dependabot / audit en CI |

## 11. Protections ajoutées depuis (13 → 16/10/2026)

| Domaine | Protection | Où c'est vérifié |
|---|---|---|
| Comptes | Vérification d'adresse e-mail (lien 24 h, usage unique) ; la réinitialisation vaut preuve | `identity.test.ts` |
| Comptes | Double authentification TOTP (RFC 6238), codes de secours à usage unique, rejeu impossible, secret chiffré AES-256-GCM avec une clé hors base | `totp.test.ts`, `two-factor.test.ts` |
| Administration | `REQUIRE_ADMIN_2FA` : routes d'administration, envois et dépôts refusés sans double authentification | `two-factor.test.ts` |
| Réinitialisation | Réponse identique (contenu et délai) que le compte existe ou non, même si l'envoi d'e-mail échoue | `identity.test.ts` |
| Données | Export des données du compte (jamais de secret) ; conservation limitée (mesures 180 j, journal 365 j) ; sessions et jetons périmés purgés | `privacy.test.ts` |
| Entrées | Validation stricte des documents d'administration (zod `strict`, adresses d'image `https://` ou `/images/` seulement), fichiers de sous-titres contrôlés (WebVTT, 1 Mo, sans script) | `catalog.test.ts`, `subtitles.test.ts` |
| Entrées hostiles | Injection SQL, chemins `../`, Unicode, JSON malformé, corps trop gros : jamais de 500 | `robustness.test.ts` |
| Base de données | Délai maximal de 15 s par requête, transactions oubliées coupées à 30 s, migrations sérialisées, pannes traduites en 503 | `robustness.test.ts` |
| Journaux | Masquage des mots de passe, codes, secrets, jetons, clés ; jeton de lecture masqué dans les chemins | `middleware.ts`, `logger.ts` |
| Visuels | Pas de SVG (peut contenir du script) ; en-tête `nosniff` ; chemins confinés au dossier | `catalog.test.ts` |
| Architecture | Le socle ne dépend d'aucun module, aucun cycle, SQL localisé : contrôlés à chaque test | `architecture.test.ts` |
| Contrat | Les routes du code et `API-CONTRACT.md` ne peuvent plus diverger | `contract.test.ts` |

## 6. Liste de contrôle avant la mise en ligne

- [ ] `NODE_ENV=production`, `MEDIA_SECRET` (≥ 32 caractères, aléatoire), `DATABASE_URL`, `CORS_ORIGINS` définis
- [ ] `TRUST_PROXY=true` seulement si un proxy de confiance est devant l'API
- [ ] HTTPS partout ; l'API n'est joignable que par le proxy
- [ ] Base de données non exposée sur Internet, mot de passe fort
- [ ] Sauvegardes testées (restauration complète)
- [ ] `npm audit` propre le jour du déploiement
- [ ] Journaux vérifiés : aucun jeton, aucun secret
- [ ] `AUTH_ENCRYPTION_KEY` générée et conservée hors de la machine ; `REQUIRE_ADMIN_2FA=true` ; chaque administrateur a activé sa double authentification
- [ ] `MAIL_PROVIDER=resend` avec domaine d'envoi vérifié (SPF, DKIM) ; un e-mail de réinitialisation reçu pour de vrai
- [ ] Copie hors site des sauvegardes et de `BACKUP_PASSPHRASE` + `AUTH_ENCRYPTION_KEY`

## 7. Comptes (étape B2) — protections ajoutées

| Menace | Protection |
|---|---|
| Vol de la base de données | Mots de passe en **argon2id** (sel unique) ; jetons de session stockés **uniquement sous forme d'empreinte** |
| Devinettes de mots de passe | Limite de 10 tentatives/min par IP, verrouillage du compte 15 min après 5 échecs, mots de passe courants refusés |
| Savoir qui a un compte | Message de connexion unique, temps de calcul identique, « mot de passe oublié » toujours en 202 |
| Vol de session par script | Cookie `httpOnly` ; `Secure` et préfixe `__Host-` en production |
| Requête forgée depuis un autre site (CSRF) | `SameSite=Lax` + contrôle de l'en-tête `Origin` sur toute écriture |
| Réutilisation d'un lien de réinitialisation | Usage unique, valable 1 h, toutes les sessions sont coupées après usage |
| Appareil perdu | Changement de mot de passe : les autres appareils sont déconnectés |
| Droit à l'effacement (RGPD) | `POST /api/me/delete` supprime le compte et ses sessions ; le journal d'audit est anonymisé |
| Accès administrateur | Rôle `admin` vérifié côté serveur sur chaque route ; création par script, jamais par l'API publique |

Données conservées : adresse e-mail, empreinte du mot de passe, nom d'affichage facultatif, dates. **Aucune adresse IP ni user-agent n'est stocké.**

## 8. Envoi de fichiers (étape B4)

| Menace | Protection |
|---|---|
| N'importe qui envoie des fichiers | Réservé aux administrateurs ; contrôle d'origine et de session comme le reste |
| Fichier géant qui remplit le disque | Taille annoncée plafonnée (60 Go) ; plus d'octets que la taille annoncée = refus (413) |
| Fichier déguisé (exécutable…) | Liste blanche d'extensions vidéo ; le contenu est de toute façon relu par ffprobe avant tout encodage |
| Chemin piégé (`../`) | Identifiants bornés (`a-z`, `0-9`, `-`) ; dossiers calculés par `StorageLayout`, jamais composés à la main |
| Injection de commande | `ffmpeg`/`ffprobe` lancés avec une liste d'arguments, jamais via un shell |
| Deux envois simultanés du même fichier | Verrou par envoi (409) |
| Vidéo incomplète publiée | Contrôle qualité fichier par fichier avant la publication atomique |
| Fichier corrompu qui boucle | Erreur « définitive » détectée dès l'analyse : pas de nouvelle tentative inutile |

L'espace disque libre est vérifié avant d'accepter un envoi (source + encodage + marge configurée) : un envoi qui ne peut pas aboutir est refusé tout de suite.

## 9. Diffusion par CDN (étape B5)

| Menace | Protection |
|---|---|
| Partage d'une URL de lecture | Jeton de répertoire expirant (4 h), vérifié par le CDN ; plus de jeton = plus d'accès |
| Lecture directe sans jeton | Token Authentication activé sur la Pull Zone (vérifié par `cdn:check`) |
| Fuite de la clé de stockage | Elle n'existe que dans `api/.env` du travailleur ; l'API n'a besoin que de la clé de jeton |
| Fichier altéré à l'envoi | Empreinte SHA-256 envoyée avec chaque fichier |
| Contenu à moitié publié | Dossier versionné, playlist maître envoyée en dernier |
| Écrasement accidentel | Jamais d'écriture en place : une publication = un nouveau dossier |

Reste vrai : un spectateur autorisé peut enregistrer le flux (aucun DRM). Voir « Ce qui N'EST PAS couvert ».

## 10. Exploitation (étape B6)

| Menace | Protection |
|---|---|
| Perte de la base | Sauvegarde quotidienne, rotation, **test de restauration automatisé** |
| Vol d'une sauvegarde | Chiffrement AES-256-GCM (phrase secrète conservée à part) ; fichiers en droits 600 |
| Sauvegarde falsifiée ou tronquée | Empreinte SHA-256 par fichier + authentification GCM ; restauration en transaction (tout ou rien) |
| Restauration par erreur sur une base en service | Refus si la base cible n'est pas vide ; option `--yes` obligatoire |
| Suppression accidentelle d'une source | La copie de sauvegarde ne supprime jamais |
| Fuite via la supervision | `/metrics` désactivé sans jeton, jeton comparé en temps constant, aucune donnée personnelle exposée |
| Panne silencieuse | Chien de garde + alertes sur changement d'état |

Reste à faire : envoyer aussi la sauvegarde **hors du site** (second lieu physique ou stockage distant) : un disque externe branché
au même ordinateur ne protège pas d'un vol ou d'un incendie.
