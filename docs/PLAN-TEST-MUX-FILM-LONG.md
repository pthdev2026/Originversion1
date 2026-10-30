# ORIGIN — Plan de test Mux avec un film long (préparé le 30/10/2026)

**Rien de ce document n'a été exécuté contre Mux.** Aucune consommation n'est déclenchée sans autorisation explicite du propriétaire. Ce qui peut être testé sans Mux l'a été (voir §4).

## 1. État de la configuration (sans valeurs)
| Variable | Présente dans `api/.env` ? | Rôle |
|---|---|---|
| `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` | oui | Accès à l'API Mux (envoi, suivi, suppression) |
| `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_PRIVATE_KEY` | **non** | Fabrication des liens de lecture signés |
| `MUX_PLAYBACK_POLICY` | non (défaut `public`) | `signed` exige les deux variables ci-dessus, sinon le serveur refuse de démarrer |
| `MUX_VIDEO_QUALITY` | non (défaut `basic`) | Niveau d'encodage Mux (le moins cher) |
| `VIDEO_PROVIDER` | non (défaut `self`) ; `mux` dans le modèle de production | Voie proposée d'abord au back-office |

## 2. Blocage précis
**La lecture signée d'un film long ne peut pas être testée en réel** tant que la clé de signature n'existe pas chez Mux (Settings → Signing Keys, dans le même environnement que le jeton) et n'est pas collée dans `api/.env` par le propriétaire. Sans elle : `MUX_PLAYBACK_POLICY=signed` est refusé au démarrage, et un média déjà signé répond `503`.
La **lecture publique** d'un film long reste possible avec le jeton actuel, mais elle consommerait du stockage Mux : **à ne lancer qu'avec accord explicite**.

## 3. Ce que chaque commande fait réellement chez Mux
| Commande | Appels à Mux | Consommation |
|---|---|---|
| `npm run mux:usage` | **aucun** (lit uniquement notre base) | aucune |
| `npm run mux:usage -- --remote` | `GET` de la liste des vidéos (lecture seule) | aucune |
| `npm run mux:check` | crée puis annule une adresse d'envoi | aucun média, aucun coût attendu, mais **écrit chez Mux** |
| `npm run mux:check -- --video` | envoie 4 s de vidéo, attend, lit, **supprime** | quelques secondes de stockage, supprimées |
| `POST /api/admin/mux/uploads` + envoi d'un fichier | crée une vidéo | stockage + encodage proportionnels à la durée |

## 4. Ce qui a été testé SANS Mux (mesuré)
- **Durée de vie du jeton signé**, 4 tests (`src/modules/mux/long-film.test.ts`) : un film de 2 h garde la durée habituelle (4 h) ; un film de 6 h obtient durée + 1 h ; l'échéance annoncée au lecteur (`expiresAt`) est celle du jeton, identique pour le manifeste et l'affiche ; un nouvel appel plus tard fournit un jeton plus récent (renouvellement) ; durée inconnue → au moins 4 h.
- Déjà couvert (`mux.test.ts`, 15 tests contre un faux Mux) : JWT RS256 vérifiable avec la clé publique, `kid` en-tête et claims, configuration manquante = 503, routage par média, parcours envoi → préparation → prêt → lisible, échecs et pannes passagères.
- Côté front : `isExpired()` redemande la lecture 15 s avant `expiresAt`, et `playback-recovery.ts` gère le `403`.

## 5. Suivi du quota
`npm run mux:usage` affiche le nombre de vidéos Mux prêtes et leur durée totale **depuis notre base**, et, avec `--remote`, la durée réellement stockée chez Mux, avec une alerte si les deux divergent (vidéo orpheline). Les tarifs ne sont pas codés : ils se lisent sur la grille Mux à jour. Le stockage se facture à la minute stockée et la diffusion à la minute regardée ; pour 1 000 personnes × 2 h, c'est la **diffusion** qui domine.
**Garde-fou recommandé avant toute grosse importation** : fixer à la main un plafond de minutes stockées, lancer `mux:usage` avant et après chaque film, et supprimer les vidéos de test après la recette.

## 6. Protocole d'essai (à exécuter après autorisation et clé de signature)
1. `npm run mux:usage` → état de départ (attendu : 0 vidéo).
2. **Autorisation écrite du propriétaire** : « J'autorise l'envoi d'un film de test de N minutes sur mon compte Mux ».
3. Génération locale d'un film de test sans droits (mire + tonalité) ou usage d'un film dont le propriétaire détient les droits.
4. Envoi par le back-office (voie Mux), politique `public` d'abord : durée d'envoi, délai « prêt », qualités obtenues, lecture complète dans un navigateur.
5. Bascule en `signed` avec la clé : un lien sans jeton est refusé, un lien signé accepté ; lecture de bout en bout ; attente de l'échéance puis renouvellement pendant la lecture.
6. `npm run mux:usage -- --remote` → recoupement, puis suppression de la vidéo de test (`DELETE` côté Mux) et nouvelle mesure.
7. Consigner durée, taille, coûts observés dans `docs/DECISIONS.md`.

## 7. Droits d'exploitation
Les films fournis par le propriétaire (dossier Téléchargements) ont des titres évoquant des mises en ligne publiques. **Leur envoi à un service externe suppose que le propriétaire détienne les droits**; ils ne sont utilisés ici qu'en local, sans publication.
