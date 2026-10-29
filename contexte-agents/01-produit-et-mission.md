# 01 — Produit et mission

Vérifié le : 30/10/2026 · Sources : `docs/ANALYSE-GLOBALE-2026-10-13.md`, `docs/PLAN-1000-UTILISATEURS.md`, `docs/DECISIONS.md`, `README.md` (racine)

## 1. Qui est qui
| Terme | Définition |
|---|---|
| **PTH — Partage Ton Histoire** | Média chrétien contemporain de récits humains (identité, relations, blessures, dépendances, foi et doutes, pardon, reconstruction, famille). Aussi un site institutionnel (manifeste, soutien) — **distinct d'ORIGIN**. |
| **ORIGIN** | La plateforme de streaming de PTH : PTH Originals, témoignages, créateurs, films, séries, documentaires, podcasts. Objet de ce dossier. |
| **Le propriétaire** | Le dirigeant de PTH, francophone, qui décide, valide et apprend. Il ne code pas ; il exige de comprendre. |
| **Agent back-end** | Possède l'API, la base, le pipeline vidéo, la sécurité, l'infrastructure. |
| **Agent front-end** | Possède l'interface, la direction artistique, le motion, l'accessibilité (dépôt `app/`). |
| **Lovable** | Outil de conception front relié au dépôt GitHub `pthdev2026/hero-stream-magic`. Ne jamais réécrire l'historique. |

## 2. À quoi sert la plateforme (utilité)
Offrir à un public de 24–35 ans (cœur de cible, exigeant visuellement, allergique au ton institutionnel), élargi aux non-croyants touchés par une histoire,
un lieu de visionnage **soigné, fluide et honnête** pour des récits de vie. Principe : *partir du vécu humain avant le spirituel*.

## 3. Objectifs mesurables de la v1
| Objectif | Valeur | Où c'est mesuré |
|---|---|---|
| Utilisateurs | **1 000 personnes** | — |
| Lecture | jusqu'à **2 h chacune** | `docs/TEST-DE-CHARGE.md` |
| Démarrage de la lecture | p75 < 2 s ; coupures < 1 % ; erreurs < 1 % | `GET /api/admin/metrics/playback` (cibles dans `analytics/metrics.ts`) |
| Coût mensuel | ≈ 50–150 $ | `docs/PLAN-1000-UTILISATEURS.md` |
| Audience géographique | France, Belgique, puis Europe du Sud (Espagne) | `docs/DECISIONS.md` |
| Accès | Gratuit et ouvert à tous ; invitation plus tard | `REGISTRATION_MODE=open|invite` |

## 4. Ce qui est DANS le périmètre v1
Comptes, lecture adaptative, reprise de lecture, « Ma liste », catalogue éditorial piloté par API, recherche, recommandations explicables, sous-titres,
ident de marque, envoi/encodage/publication de vidéos, sauvegardes, supervision, RGPD, double authentification (administrateurs).

## 5. Ce qui est HORS périmètre v1 (ne pas le construire sans décision)
Paiement/abonnement (modèle gratuit), DRM multi-plateformes, applications TV/mobile natives, téléchargement hors ligne, encodage par plan (per-shot), multi-CDN,
microservices, tests A/B permanents, recommandation par apprentissage automatique, langues audio multiples, 4K (réservée à un futur « droit de qualité »).
Raison : disproportionné pour 1 000 utilisateurs (voir `docs/BENCHMARK-TECHNIQUE.md`, `docs/ANALYSE-GLOBALE-2026-10-13.md` §4C).

## 6. Les deux autres applications à étudier (en attente de précisions)
Le propriétaire a mentionné deux applications de référence, **SagePlus** et **Angels**, dont il veut s'inspirer côté back-end.
**Aucune information fiable à ce jour** : un agent ne doit pas supposer leur contenu. Méthode retenue : décrire les *parcours et règles observables par un utilisateur*,
concevoir notre propre back-end pour offrir la même fonction ; ne pas démonter l'application d'un tiers (cadre légal : voir `08-securite-et-conformite.md` §6).
