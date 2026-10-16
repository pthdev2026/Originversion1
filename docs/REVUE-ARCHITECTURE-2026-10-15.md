# ORIGIN — Revue d'architecture back-end (15/10/2026)

Méthode : lecture du code, mesure des dépendances entre modules (analyse des `import`), recherche de cycles, de SQL hors couche,
de doublons et de reliquats ; puis corrections vérifiées par la suite de tests (141 tests, 0 échec).

## Verdict
Architecture saine : monolithe modulaire, couches `routes → service → repository`, socle `platform/`. Trois écarts réels ont été
trouvés et **corrigés** ; un quatrième risque est **documenté** (non corrigé volontairement).

## Écarts corrigés
| # | Constat | Pourquoi c'était un problème | Correction |
|---|---|---|---|
| 1 | **Cycles entre modules** : `playback ↔ progress` et `playback ↔ media` (tous deux via `findPlayableAsset`) | Un cycle empêche de comprendre, tester ou extraire un module isolément | La fonction vit désormais dans `ingest` (propriétaire de `media_assets`) : dépendances à sens unique |
| 2 | **Le socle dépendait d'un module** : `platform/http/types.ts` importait `identity` | Le socle doit pouvoir être lu sans connaître les fonctions métier | Type `AuthenticatedUser` défini dans le socle ; `identity` le réutilise |
| 3 | **L'encodage pouvait écraser la fiche éditoriale** (titre, type) d'un programme déjà existant | Un ré-encodage aurait défait le travail éditorial | `registerAsset` ne touche plus que `updated_at` si le programme existe |
| 4 | **Aucune mise en cache du catalogue public** (`no-store` partout) | 1 000 visiteurs = 1 000 lectures de la base à chaque accueil | Cache public 30 s sur le catalogue (erreurs et données de compte jamais mises en cache) |

## Garde-fous ajoutés (`src/architecture.test.ts`)
1. Le socle (`platform/`) n'importe aucun module fonctionnel.
2. Aucun cycle de dépendances entre modules.
3. Le SQL n'est écrit que dans les fichiers prévus (repository, lectures catalogue, mesures, santé).
Ces règles échouent désormais en CI si elles sont cassées : l'architecture ne peut plus se dégrader en silence.

## Carte des dépendances actuelle (sans cycle)
`playback → media, progress, ingest` · `progress → identity, ingest` · `media → ingest` · `recommendation → catalog` ·
`catalog, ingest, mylist, analytics, ops → identity` · `identity, health → ∅`.

## Risques connus, non corrigés (décisions assumées)
| Risque | Pourquoi on l'accepte | Seuil de révision |
|---|---|---|
| **Limiteur de débit en mémoire** (par processus) | Un seul processus API à 1 000 utilisateurs ; simple et sans dépendance | Dès qu'on lance plusieurs instances (→ Redis ou limite au proxy) |
| **Recommandations calculées à la demande** | **Corrigé le 16/10 après mesure** : la première estimation (« tient jusqu'à 5 000 titres ») était fausse ; à 5 000 titres le serveur saturait. Caches ajoutés, 0 erreur ensuite (`TEST-DE-CHARGE.md`). | Catalogue > ~20 000 titres ou > 50 req/s sur `/recommendations` : pré-calcul |
| **Sessions et files d'encodage dans PostgreSQL** | Une seule technologie à exploiter ; la file tient largement le débit d'ingestion | Plusieurs encodeurs simultanés à forte cadence |
| **Pas de versionnement d'API** (`/api/v1`) | Un seul client (le front) géré par la même équipe ; contrat versionné dans `API-CONTRACT.md` | Ouverture à des clients tiers (applications TV, mobile) |
| **E-mails non transactionnels en file** (envoi direct, erreurs journalisées) | Volume faible ; réponses uniformes pour ne rien révéler | Mails de masse ou exigences de délivrabilité |

## Points de vigilance pour les prochaines évolutions
- Tout nouveau module : un `README.md`, des tests, et une dépendance **vers le bas** seulement (jamais vers un module qui dépend de lui).
- Toute colonne ajoutée à `programs` doit être gérée par `catalog/admin.ts` **et** par le trigger de recherche si elle est cherchable.
- Les chemins d'image doivent passer par `assetUrl` (validation) : ne jamais accepter d'adresse libre.


## Addendum du 16/10/2026 — leçon de méthode
Un seuil annoncé sans mesure (« 5 000 titres ») s'est révélé faux dès le premier test de charge à cette taille. Règle retenue : **tout seuil
d'échelle inscrit dans un document doit renvoyer à une mesure** (scénario `browse` pour le catalogue, `api`/`origin` pour la lecture).
