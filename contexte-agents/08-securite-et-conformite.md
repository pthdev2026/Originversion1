# 08 — Sécurité et conformité

Vérifié le : 30/10/2026 · **Sources de vérité : `docs/SECURITE-BACKEND.md`**, `api/src/modules/identity/`, tests `two-factor.test.ts`, `robustness.test.ts`, `privacy.test.ts`

## 1. Modèle de menaces (ce qu'on protège)
Comptes des spectateurs (e-mail, historique) · droits d'administration (publier/supprimer du contenu) · vidéos (pas de partage trivial) · disponibilité (1 000 personnes) · données personnelles (RGPD).

## 2. Protections en place
| Domaine | Protection | Preuve (test) |
|---|---|---|
| Mots de passe | argon2id (m=19456, t=2, p=1), politique (10–128 car., pas courant, pas l'e-mail, pas répétitif), 2 hachages simultanés au plus | `password.test.ts` |
| Sessions | Jeton aléatoire 256 bits, **seule l'empreinte SHA-256 en base**, cookie `httpOnly` + `Secure` + préfixe `__Host-` (prod) + `SameSite=Lax`, 30 jours | `identity.test.ts` |
| Connexion | Message unique, temps de calcul constant (empreinte factice), verrouillage 15 min après 5 échecs (mots de passe **et** codes 2FA faux) | `identity.test.ts`, `two-factor.test.ts` |
| CSRF | Écriture avec `Origin` hors `CORS_ORIGINS` → 403 | `identity.test.ts` |
| E-mail vérifié | Lien 24 h, usage unique, lié à l'adresse ; non bloquant ; réinitialisation de mot de passe vaut preuve | `identity.test.ts` |
| Double authentification | TOTP RFC 6238 (vecteurs officiels testés), anti-rejeu (`last_step`), 8 codes de secours à usage unique, secret chiffré AES-256-GCM (clé `AUTH_ENCRYPTION_KEY` hors base). `REQUIRE_ADMIN_2FA=true` impose la 2FA à l'administration | `totp.test.ts`, `two-factor.test.ts` |
| Réinitialisation | Réponse **identique** (contenu et délai) que le compte existe ou non, même si l'e-mail échoue | `identity.test.ts` |
| Limites de débit | Par IP et par groupe de routes ; mémoire bornée | `middleware` tests |
| Entrées | Validation `zod` stricte (champs inconnus refusés), corps ≤ 64 Ko, délai 10 s, chemins confinés (`resolveInside`), pas de SVG, `nosniff` | `catalog.test.ts`, `robustness.test.ts` |
| Entrées hostiles | Injection SQL, `../`, Unicode, JSON malformé : jamais de 500 | `robustness.test.ts` |
| Base de données | Délai SQL 15 s, transactions oubliées coupées à 30 s, migrations et éditions sérialisées, pannes → 503 | `robustness.test.ts` |
| Vidéo | URLs signées HMAC (4 h, liées au média), rotation de secret (`MEDIA_SECRET_PREVIOUS`), jeton CDN de répertoire | `token.test.ts`, `bunny-token.test.ts` |
| Journaux | Masquage des mots de passe, codes, secrets, jetons, clés ; jeton de lecture masqué dans les chemins | `middleware.ts`, `logger.ts` |
| Sauvegardes | Chiffrées AES-256-GCM, empreintes SHA-256, **restauration d'essai** vérifiée | `backup` scripts |
| Dépendances | `npm audit` : 0 faille (16/10/2026) | commande |
| Architecture | Socle indépendant, aucun cycle, SQL localisé | `architecture.test.ts` |

## 3. Secrets : inventaire (jamais dans le code, jamais dans Git)
| Secret | Rôle | Si perdu |
|---|---|---|
| `MEDIA_SECRET` (+ `_PREVIOUS`) | Signe les URLs de lecture | Les lectures en cours expirent ; rotation possible sans coupure |
| `BACKUP_PASSPHRASE` | Chiffre les sauvegardes | **Sauvegardes illisibles** — conserver hors serveur |
| `AUTH_ENCRYPTION_KEY` | Chiffre les secrets 2FA | **Tous les 2FA illisibles** — conserver hors serveur (procédure : `docs/EXPLOITATION.md`) |
| `METRICS_TOKEN` | Accès à `/metrics` | Régénérer |
| `BUNNY_TOKEN_KEY`, `BUNNY_STORAGE_KEY` | CDN | Régénérer chez Bunny |
| `MAIL_API_KEY` | Envoi d'e-mails | Régénérer chez Resend |
| `POSTGRES_PASSWORD` | Base de production | Changer + redémarrer |

## 4. RGPD (droits des personnes)
| Droit | Implémentation |
|---|---|
| Accès / portabilité | `GET /api/me/export` : JSON (compte, progression, liste, préférences, thématiques, sessions, événements de sécurité), **sans aucun secret** |
| Appareils | Liste et déconnexion des appareils du compte ; libellé approximatif (« Chrome · macOS »), **jamais d'adresse IP ni d'agent utilisateur brut** |
| Changement d'e-mail | Mot de passe + code à 6 chiffres sur la NOUVELLE adresse (empreinte, 5 essais, 15 min), ancienne adresse prévenue, réponse identique si l'adresse est déjà prise, autres appareils déconnectés |
| Historique / photo | Historique désactivable (rien n'est enregistré) et effaçable ; photo de profil supprimée avec le compte, incluse dans les sauvegardes |
| Effacement | `POST /api/me/delete` (mot de passe requis) : suppression en cascade, audit anonymisé |
| Minimisation | Pas d'IP ni d'agent utilisateur stockés ; mesure de lecture anonyme ; entretien horaire (sessions/jetons périmés ; mesures 180 j ; audit 365 j) |
| Rectification | Mot de passe modifiable ; nom d'affichage à l'inscription (édition à compléter côté API si besoin) |
À faire par le propriétaire : CGU, politique de confidentialité, mentions légales, registre des traitements (hors code).

## 5. Ce qui n'est PAS couvert (à traiter, par ordre d'importance)
| Manque | Pourquoi | Quand |
|---|---|---|
| E-mails jamais envoyés pour de vrai | Resend testé avec un faux serveur ; SPF/DKIM du domaine à configurer | Création du compte Resend |
| HTTPS / DNS jamais testés sur un vrai domaine | Caddy configuré, jamais lancé en réel | Mise en ligne |
| CDN jamais validé sur une vraie zone | Format du jeton Bunny suit la doc, non testé | Création de la zone |
| Sauvegarde hors site | Les sauvegardes restent sur la machine par défaut | Mise en ligne |
| 2FA facultative pour les spectateurs | Seuls les admins peuvent y être obligés | Selon le public |
| Limiteur de débit non partagé | Par instance | Plusieurs instances |
| DRM | Les URLs signées gênent le partage, pas la copie | Si un ayant droit l'exige |
| Protection DDoS réseau | Hors de portée de l'app | Fournisseur / CDN |
| Veille de vulnérabilités continue | Pas de Dependabot/audit CI | Activer en CI |

## 6. Cadre légal du « reverse engineering » et de l'inspiration
Les outils de rétro-ingénierie (REA, Ghidra…) servent la recherche licite, l'interopérabilité, la préservation, l'analyse de logiciels **dont on est propriétaire ou autorisé à les examiner**.
**Interdit sans décision écrite du propriétaire** : démonter l'application d'un concurrent pour la copier, contourner une protection, réutiliser son code, ses textes ou ses visuels.
**Autorisé** : observer le produit comme utilisateur (parcours, règles visibles), rédiger sa propre spécification, concevoir son propre back-end.
Le back-end d'un service tiers (ses serveurs) n'est de toute façon pas accessible à ces outils.

## 7. Liste de contrôle avant la mise en ligne
`NODE_ENV=production` · `MEDIA_SECRET` ≥ 32 car. · `DATABASE_URL`, `CORS_ORIGINS` · `TRUST_PROXY=true` seulement derrière Caddy · HTTPS partout · base non exposée ·
`AUTH_ENCRYPTION_KEY` et `REQUIRE_ADMIN_2FA=true` · chaque admin a activé sa 2FA · `MAIL_PROVIDER=resend` + SPF/DKIM + un e-mail reçu pour de vrai ·
sauvegardes restaurées pour de vrai + copie hors site (et des clés) · `npm audit` propre · journaux vérifiés (aucun jeton/secret). Détail : `docs/SECURITE-BACKEND.md` §6.
