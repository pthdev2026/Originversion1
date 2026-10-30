# 13 — Carte des sources et protocole de fraîcheur

Vérifié le : 30/10/2026

## 1. Hiérarchie de vérité (en cas de désaccord, la plus haute gagne)
1. **Le code et les tests** (`api/src/`, `api/migrations/`)
2. `docs/API-CONTRACT.md` (contrat d'API, vérifié par `contract.test.ts`)
3. `docs/DECISIONS.md` (décisions validées, journal daté)
4. Les documents thématiques de `docs/` (ci-dessous)
5. Ce dossier `contexte-agents/` (résumé et routage — **jamais** la source primaire)

## 2. Sujet → où trouver la vérité
| Sujet | Source primaire | Résumé dans ce dossier |
|---|---|---|
| Vision, périmètre, objectifs | `docs/ANALYSE-GLOBALE-2026-10-13.md`, `docs/PLAN-1000-UTILISATEURS.md` | 01 |
| Marque, ton, identité, DA | `docs/DESIGN.md`, `docs/BRIEF-AGENT-FRONT.md` §2 | 02 |
| Architecture back-end | `docs/ARCHITECTURE-BACKEND.md`, `docs/REVUE-ARCHITECTURE-2026-10-15.md` | 03 |
| Base de données | `api/migrations/*.sql` | 04 |
| Contrat d'API | `docs/API-CONTRACT.md` | 05 |
| Pipeline vidéo, CDN | `docs/ARCHITECTURE-BACKEND.md` §7 ter+, `docs/GUIDE-BUNNY.md`, `api/src/modules/ingest/` | 06 |
| Front et intégration | `docs/BRIEF-AGENT-FRONT.md`, `docs/PLAN-COMPTES-FRONT.md`, `docs/PR-CHAINE.md`, `docs/API-REQUESTS.md`, dépôt `app/` | 07 |
| Sécurité, RGPD | `docs/SECURITE-BACKEND.md` | 08 |
| Déploiement, exploitation | `docs/DEPLOIEMENT.md`, `docs/EXPLOITATION.md`, `deploy/` | 09 |
| Charge et performance | `docs/TEST-DE-CHARGE.md` | 10 §3 |
| Décisions | `docs/DECISIONS.md` | 10 §5 |
| Back-office (outil d'administration) : écrans, routes, critères d'acceptation | `docs/CAHIER-DES-CHARGES-BACK-OFFICE.md`, `docs/PROMPT-AGENT-BACK-OFFICE.md` | agents/AGENT-back-office |
| Choix d'hébergement (PostgreSQL géré ? Supabase ?), Mux vs FFmpeg+Bunny, composants à déployer | `docs/AUDIT-ARCHITECTURE-CIBLE-2026-10-30.md` | 09, 10 |
| Benchmark Netflix/Prime, coûts | `docs/BENCHMARK-TECHNIQUE.md`, `docs/PLAN-1000-UTILISATEURS.md` | 01 §5 |
| Audit initial, diagnostics historiques | `docs/AUDIT-EXISTANT.md`, `docs/BACKEND-DIAGNOSTIC-ET-PLAN.md`, `docs/FRONT-DIAGNOSTIC-2026-10-13.md` | (historique, ne pas traiter comme actuel) |
| Intro « Prisme » (générée par IA) | `docs/INTRO-PRISME-PROMPTS.md`, `assets/intro/` | (hors back-end) |
| README de chaque module | `api/src/modules/<module>/README.md` | 04 |

## 3. Documents de `docs/` : lesquels sont vivants ?
| Statut | Documents |
|---|---|
| **Vivants (à tenir à jour)** | `API-CONTRACT`, `DECISIONS`, `ARCHITECTURE-BACKEND`, `SECURITE-BACKEND`, `EXPLOITATION`, `DEPLOIEMENT`, `TEST-DE-CHARGE`, `GUIDE-BUNNY`, `API-REQUESTS`, `DESIGN` |
| **Instantanés datés (ne pas modifier, ne pas croire sans date)** | `ANALYSE-GLOBALE-2026-10-13`, `REVUE-ARCHITECTURE-2026-10-15`, `AUDIT-ARCHITECTURE-CIBLE-2026-10-30`, `AUDIT-EXISTANT`, `BACKEND-DIAGNOSTIC-ET-PLAN`, `FRONT-DIAGNOSTIC-2026-10-13`, `BENCHMARK-TECHNIQUE`, `PLAN-1000-UTILISATEURS` |
| **Processus front (agent front)** | `BRIEF-AGENT-FRONT`, `PLAN-COMPTES-FRONT`, `PROMPT-AGENT-FRONT-BRANCHEMENT`, `PR-CHAINE`, `PR-*.md` |
| **Pack créatif** | `INTRO-PRISME-PROMPTS` |

## 4. Protocole de fraîcheur
1. Chaque fiche porte **« Vérifié le »** et ses **sources**.
2. Un changement de code qui touche une table, un module, une route, une variable d'environnement, une règle de sécurité, une mesure ou l'état d'avancement ⇒ mettre à jour la fiche concernée **dans le même commit**.
3. Début de session : comparer `git log -1` du dépôt racine au commit indiqué dans `10-…` ; s'il est plus récent, relire `git log` depuis ce commit et corriger.
4. Garde-fou automatique : `api/src/context-docs.test.ts` vérifie que ce dossier mentionne **chaque migration, chaque module et chaque variable d'environnement**. Il ne vérifie pas le sens — la relecture humaine/agent reste nécessaire.
5. En cas de doute sur un fait : le vérifier dans le code (commande ou lecture), pas dans la mémoire d'un agent.

## 5. Mémoire de l'agent vs ce dossier
La mémoire personnelle d'un agent (hors dépôt) peut contenir des préférences du propriétaire et l'historique de la collaboration. **Tout ce qui doit survivre à un changement d'agent doit être écrit ici ou dans `docs/`**, pas seulement en mémoire.
