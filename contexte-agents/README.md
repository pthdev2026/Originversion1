# Dossier de contexte — agents back-end ORIGIN

> **À lire en premier par tout agent qui travaille sur le back-end d'ORIGIN.**
> Ce dossier est une **vue d'ensemble organisée et vérifiée** du projet. Il ne remplace pas les documents de `docs/` : il dit
> *lequel lire, quand, et ce qu'il faut retenir*. Pour chaque sujet, la **source de vérité** est indiquée (fichier de `docs/` ou code).

Dernière vérification globale : **30/10/2026** (code au commit `e5ebaaa`, 188 tests réussis ; front d'après l'historique git du 21/10/2026).

## 1. En 10 lignes

- **PTH** (Partage Ton Histoire) : média chrétien de récits humains. **ORIGIN** : sa plateforme de streaming (films, séries, documentaires, podcasts, témoignages).
- **Objectif v1** : 1 000 personnes, chacune jusqu'à 2 h de lecture, démarrage fluide, coût minimal (≈ 50–150 $/mois). Public : France, Belgique, puis Europe du Sud.
- **Accès** : gratuit et ouvert à tous au début ; passage à l'invitation prévu (réglage `REGISTRATION_MODE`).
- **Back-end** : monolithe modulaire Node 24 + TypeScript + Hono + PostgreSQL 17. Un seul dépôt `api/`, découpé en modules (`identity`, `catalog`, `playback`, `ingest`…).
- **Vidéo** : HLS adaptatif (4 qualités), encodage hors ligne par un travailleur séparé, diffusion par CDN (Bunny) avec URLs signées.
- **Front** : dépôt séparé `app/` (React/TanStack Start), relié à **Lovable** via GitHub. Autre agent, autre périmètre.
- **Principe produit** : *« Le contenu raconte l'émotion. L'interface prépare la rencontre. »* — **honnêteté absolue** : pas de fausse donnée, de fausse personnalisation, de faux témoignage.
- **État** : le code back-end est complet et testé ; le blocage n'est plus technique (serveur, domaine, CDN, e-mails, contenus à fournir par le propriétaire).
- **Méthode** : plan validé avant toute décision d'architecture ou artistique ; toute affirmation chiffrée renvoie à une mesure ; tests et documentation à jour dans le même commit.
- **Langue** : français partout (code commenté, documents, échanges). Le propriétaire apprend : expliquer les termes techniques simplement.

## 2. Ordre de lecture

| Vous êtes… | Lisez dans cet ordre |
|---|---|
| **Nouvel agent, première session** | 01 → 02 → 03 → 10 → 11 → votre fiche dans `agents/` |
| **Agent qui modifie du code** | 11 (règles) → 03 → 04 → 05 → fiche `agents/` → tests du module |
| **Agent qui touche à l'API** | 05 → `docs/API-CONTRACT.md` → 07 (consommation par le front) |
| **Agent vidéo / diffusion** | 06 → `docs/GUIDE-BUNNY.md` → fiche `agents/AGENT-pipeline-video.md` |
| **Agent sécurité / comptes** | 08 → fiche `agents/AGENT-comptes-securite.md` |
| **Agent déploiement / exploitation** | 09 → `docs/DEPLOIEMENT.md`, `docs/EXPLOITATION.md` |

## 3. Les fichiers

| Fichier | Contenu | Quand le lire |
|---|---|---|
| [01-produit-et-mission.md](01-produit-et-mission.md) | Qui, pourquoi, pour qui, objectifs chiffrés, périmètre | Toujours (première session) |
| [02-charte-editoriale-et-marque.md](02-charte-editoriale-et-marque.md) | Ton, identité, règles d'honnêteté, ce que le back-end doit garantir | Avant toute décision qui touche au contenu ou aux données exposées |
| [03-architecture-backend.md](03-architecture-backend.md) | Structure, couches, règles de dépendance, trajet d'une requête | Avant de coder |
| [04-donnees-et-modules.md](04-donnees-et-modules.md) | Tables, contraintes, rôle de chaque module | Avant de toucher à la base ou à un module |
| [05-api-et-contrat.md](05-api-et-contrat.md) | Familles de routes, conventions, erreurs, cache, authentification | Avant de créer/modifier une route |
| [06-pipeline-video-et-diffusion.md](06-pipeline-video-et-diffusion.md) | Envoi, encodage, QC, publication, CDN, ident, sous-titres, volume | Tout ce qui touche à la vidéo |
| [07-front-end-et-integration.md](07-front-end-et-integration.md) | Le front, ses règles, ce qu'il consomme, l'état du branchement | Avant de changer le contrat d'API |
| [08-securite-et-conformite.md](08-securite-et-conformite.md) | Protections, secrets, RGPD, manques connus | Avant toute fonction sensible |
| [09-exploitation-et-deploiement.md](09-exploitation-et-deploiement.md) | Topologie, variables, sauvegardes, supervision, incidents | Mise en ligne, exploitation |
| [10-etat-davancement-et-decisions.md](10-etat-davancement-et-decisions.md) | Ce qui est fait/bloqué, mesures, risques, décisions, questions ouvertes | Chaque début de session |
| [11-regles-de-travail-agents.md](11-regles-de-travail-agents.md) | Conventions, commandes, définition de « terminé », collaboration | Chaque session |
| [12-glossaire.md](12-glossaire.md) | Tous les termes expliqués simplement | En cas de doute sur un mot |
| [13-carte-des-sources.md](13-carte-des-sources.md) | Sujet → document/fichier de référence ; protocole de fraîcheur | Pour retrouver l'information |
| [agents/](agents/) | Une fiche par compartiment (dont le back-office) : périmètre, fichiers, invariants, « terminé » | Au démarrage de la mission |

## 4. Principes d'usage de ce dossier (context engineering)

1. **Couches** : ce README (10 lignes) → fiches thématiques (précises) → documents détaillés de `docs/` → code. Descendre seulement si nécessaire.
2. **Une seule source de vérité par fait** : ici on *résume et on renvoie*. En cas de désaccord, **le code et les tests priment**, puis `docs/API-CONTRACT.md`, puis `docs/DECISIONS.md`, puis ce dossier.
3. **Ne rien croire sans date** : chaque fiche porte « Vérifié le » et ses sources. Une information de plus de 30 jours ou antérieure à un changement de code se revérifie.
4. **Charger peu, charger juste** : un agent lit son parcours (tableau §2), pas tout le dossier.
5. **Écrire, ne pas mémoriser** : toute décision, toute mesure, tout seuil important va dans un fichier (`docs/DECISIONS.md`, `docs/TEST-DE-CHARGE.md`…). La mémoire d'un agent s'efface à chaque session.
6. **Anti-dérive automatique** : le test `api/src/context-docs.test.ts` échoue si une migration, un module ou une variable d'environnement n'est pas mentionné dans ce dossier.

## 5. Mettre à jour ce dossier
À chaque changement de code qui modifie : une table, un module, une route, une variable d'environnement, une règle de sécurité, une mesure de charge, un état d'avancement →
mettre à jour la fiche concernée **dans le même commit**, et la date « Vérifié le ». Voir [13-carte-des-sources.md](13-carte-des-sources.md).
