# 10 — État d'avancement, mesures, risques et décisions

Vérifié le : 30/10/2026 (code `e5ebaaa`, 16/10/2026) · Sources : `docs/DECISIONS.md` (journal des décisions), `docs/TEST-DE-CHARGE.md`, `docs/REVUE-ARCHITECTURE-2026-10-15.md`, `git log`
**À relire en début de chaque session.** Si `git log` est plus récent que « code `e5ebaaa` », cette fiche est périmée : la mettre à jour.

## 1. Où on en est
| Étape | Contenu | État |
|---|---|---|
| B0 | Hygiène : config validée, journaux, erreurs, types stricts, CI | ✅ |
| B1 | Sécurité de base : limites de débit, délais, en-têtes | ✅ |
| B2 | Comptes maison (argon2id, sessions, invitations, RGPD) | ✅ |
| B3 | Reprise de lecture, Ma liste, mesure de lecture | ✅ |
| B4 | Envoi reprenable, file de tâches, encodage, QC, publication | ✅ |
| B5 | Diffusion CDN Bunny | ⏳ **code prêt, jamais validé** (compte Bunny manquant) |
| B6 | Sauvegardes chiffrées testées, supervision, alertes | ✅ |
| B7 | Test de charge | ✅ (voir §3) |
| B8 | Déploiement (Docker Compose, Caddy, guide) | ⏳ **préparé, jamais lancé** |
| Catalogue | Programmes, saisons/épisodes, collections, thèmes, créateurs, visuels, admin, import/export | ✅ |
| Recherche / recommandations | Sans accents ; similaires, tendances, « pour vous » explicables | ✅ |
| Sous-titres | WebVTT, dépôt admin, exposition dans la lecture | ✅ |
| E-mails | Resend (testé avec un faux serveur) | ✅ code / ⏳ compte |
| **Voie Mux (B5, phase 1)** | Envoi direct navigateur→Mux, suivi par poller, inscription, lecture publique ou signée ; **validé en réel** avec une vidéo de test | ✅ code + essai réel ; ⏳ lecture signée et production |
| **Espace compte (nouveau design)** | Profil, préférences, appareils, thématiques préférées, photo, changement d'e-mail par code, historique désactivable/effaçable, épisode dans « Continuer à regarder » ; contrat v1.5 | ✅ back-end ; ⏳ front à brancher |
| Comptes renforcés | E-mail vérifié, 2FA TOTP, obligation admin | ✅ |
| RGPD | Export, effacement, conservation, entretien horaire | ✅ |
| Volume sonore | EBU R128 → −16 LUFS | ✅ |
| Robustesse | Migrations/éditions concurrentes, 503, délais SQL, entrées hostiles | ✅ |
| Garde-fous | Architecture, contrat/code, dossier de contexte | ✅ |
**Qualité** : **188 tests, 188 réussis, 0 sautés** (PostgreSQL démarré ; sans lui, 107 tests d'intégration sont *sautés* — ne pas confondre « sauté » et « réussi »), typage strict, `npm audit` 0 faille. Contrat d'API v1.1.

## 2. Ce qui bloque la mise en ligne (rien de technique)
| Blocage | Responsable | Débloque |
|---|---|---|
| Serveur (VPS) + nom de domaine | Propriétaire | B8, HTTPS, cookie de session |
| Compte Bunny (stockage + Pull Zone) | Propriétaire | B5 → 1 000 spectateurs (l'origine seule plafonne à ~100–160) |
| Compte Resend + domaine d'envoi vérifié (SPF/DKIM) | Propriétaire | E-mails réels (mot de passe oublié, vérification) |
| Vrais contenus encodés (57 titres sur 60 n'avaient pas de vidéo ; 2 programmes lisibles, tous de démonstration) | Propriétaire / production | Catalogue réel |
| Droits des images/personnalités ; CGU, confidentialité, mentions | Propriétaire | Publication légale |
| Branchement du front (progression, liste, ident, mesure, sous-titres, 2FA) | Agent front | Expérience complète |
| ~~Réponse aux 3 demandes du front~~ (traitées le 30/10, contrat v1.2) | Agent back-end | Le front peut brancher « Ma liste » et l'état « Vu » |
| Copie hors site des sauvegardes + des clés | Propriétaire | Reprise après sinistre |

## 3. Mesures de référence (toute affirmation d'échelle doit renvoyer ici)
Conditions : un Mac portable, générateur de charge + API (mode production) + PostgreSQL sur la **même machine** ; à refaire depuis une autre machine contre le vrai CDN.
| Scénario | Résultat | Source |
|---|---|---|
| API, 1 000 spectateurs, 2 h compressées ×20 | 0 erreur, progression p95 430 ms, 1 725 req/s (trafic réel ≈ 150 req/s → ≥ 10× de marge) | `docs/TEST-DE-CHARGE.md` |
| Démarrage, 1 000 lectures en 30 s (sessions existantes) | 0 erreur, p50 3,6 s / p95 9,6 s (incluant le 1er segment) | idem |
| Rafale de 1 000 **connexions** en 30 s | login p95 16,9 s : argon2 monopolisait les fils → limité à 2 hachages simultanés, `UV_THREADPOOL_SIZE=16` | idem |
| **Origine seule** (sans CDN) | 100 spectateurs OK ; 300 dégradé ; 1 000 effondré ⇒ saturation ≈ 400–430 Mb/s | idem |
| Parcours du catalogue, 500 programmes | 0 erreur, accueil p50 7 ms | idem (compl. 16/10) |
| Parcours du catalogue, **5 000** programmes | avant correction : **27,7 % d'échecs** ; après caches : **0 %**, accueil p50 9 ms / p99 0,8 s, « pour vous » p50 120 ms / p99 1,2 s (≈ 230 req/s, 10× le réel) | idem |
| Latences séquentielles à 5 000 programmes | accueil 13 ms, recherche 11, fiche 1, similaires 4, « pour vous » 26 | idem |
| Sauvegarde / restauration d'essai | 21 tables, 192 lignes, vérifié | `npm run backup:verify` |

## 4. Risques ouverts
| Risque | Gravité | Atténuation / seuil |
|---|---|---|
| Aucun déploiement réel (images Docker jamais construites, HTTPS/DNS jamais testés) | Haute | Premier déploiement = première validation |
| CDN non validé | Haute | `npm run cdn:check` dès la zone créée |
| Machine unique | Moyenne | Sauvegardes ; bascule hors périmètre v1 |
| Droits des images (personnalités, visuels trouvés ailleurs, présentatrice en animation IA) | Haute | Inventaire, autorisations écrites, remplacement |
| Dépendance à Lovable (synchronisation `main`) | Moyenne | Branches + PR relues, jamais de push sur `main` |
| Recommandation « pour vous » : coût proportionnel au catalogue | Faible aujourd'hui | > 20 000 titres ou > 50 req/s → pré-calcul |
| Médias déjà encodés non normalisés en volume | Faible | Ré-encoder si besoin |
| Seuils annoncés sans mesure | Moyenne | **Règle : tout seuil renvoie à une mesure** (erreur déjà commise et corrigée le 16/10) |

## 5. Décisions validées (extrait — journal complet : `docs/DECISIONS.md`)
Architecture : monolithe modulaire, couches routes→service→repository. · Audience : France/Belgique puis Europe du Sud. · Accès : gratuit/ouvert (invitation plus tard). ·
Vidéo : HLS fMP4 4 s, 4 qualités sans sur-échantillonnage, H.264/AAC, URLs signées, pas de DRM. · Hébergement visé : VPS Europe + Bunny (Falkenstein, réseau Standard). ·
Lecture ouverte par défaut (`PLAYBACK_REQUIRES_LOGIN=false`). · Ident : une fois par titre, décidé par le serveur. · Typographie : Manrope (Michroma = mot-symbole). ·
Tout nouveau contenu est brouillon par défaut. · Recommandations explicables, jamais de faux « pour vous ». · Pas de microservices, pas de ML à cette échelle.

## 5 bis. Audit d'architecture cible (30/10/2026) — conclusions
PostgreSQL sur Supabase : **compatible sans toucher à l'authentification**, mais **non recommandé pour le pilote** (coût, dépendance) et **dangereux si l'API de données n'est pas verrouillée** (tables `users`/`sessions` exposables). Mux : coexistence **par média** possible (migration `provider`, interface d'ingestion, webhook, signataire JWT), **non construite** : tester d'abord 1 vidéo sur chaque voie. Déploiement de référence : **T1 = tout sur un VPS + Bunny + Resend**. Contrainte : le **front doit avoir un domaine personnalisé du même site que l'API**. Détail : `docs/AUDIT-ARCHITECTURE-CIBLE-2026-10-30.md`.

## 6. Questions ouvertes (décisions du propriétaire)
1. Fournisseur VPS et nom de domaine. 2. Version courte de l'ident (3,5–4 s). 3. Double authentification obligatoire pour les spectateurs ? 4. Passage à l'invitation : quand ?
5. Réseau de sauvegarde hors site. 6. Contenus de lancement (combien d'heures, quels programmes). 7. Qui valide les droits d'image. 8. Domaine personnalisé pour le front (même site que l'API) — préalable à l'achat du domaine. 9. Essai comparatif « 1 vidéo, 2 voies » (FFmpeg+Bunny / Mux) : lancer ? 10. **SagePlus et Angels** : nature et fonctions à reprendre (voir `01-…` §6).

## 7. Prochaines actions recommandées (ordre)
0. **Back-office** : cahier des charges rédigé (`docs/CAHIER-DES-CHARGES-BACK-OFFICE.md`), à valider par le propriétaire ; côté back-end : **B1 (envoi d'images), B2 (fiche admin), B4 (filtre des tâches) livrés le 30/10 (contrat v1.3)** ; reste B3 (journal). Vérification du CDN (`npm run cdn:check`) **indépendante** du back-office, à faire dès qu'un compte Bunny existe.
1. ~~Répondre aux 3 demandes de `docs/API-REQUESTS.md`~~ — fait le 30/10. Audit d'architecture cible (hébergement de PostgreSQL, Mux, composants à déployer) : `docs/AUDIT-ARCHITECTURE-CIBLE-2026-10-30.md`.
2. Dès qu'un serveur/domaine existe : construire l'image Docker, lancer le compose, `/health`, premier admin.
3. Dès que le compte Bunny existe : `cdn:check`, puis `DELIVERY_MODE=bunny`, puis refaire le test de charge depuis une autre machine.
4. Dès qu'un compte Resend existe : un vrai e-mail de réinitialisation reçu.
5. Cadrer SagePlus/Angels (méthode §6 de `01-…`) et en tirer un plan de fonctions manquantes.
