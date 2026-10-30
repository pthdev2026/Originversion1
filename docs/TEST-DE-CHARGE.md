# ORIGIN — Test de charge (B7, 14/10/2026)

Objectif : prouver que le back-end tient **1 000 spectateurs × 2 h**. Outils : `npm run load:prepare` (1 000 comptes + sessions
+ un film de 7 200 s dans une base isolée `origin_load`) puis `npm run load:run -- <scénario>` (dans `api/scripts/load/`).

## Conditions (limites à garder en tête)
- Un seul Mac portable : générateur de charge, API Node (mode production) et PostgreSQL tournent **sur la même machine**.
  Les chiffres sont donc plutôt pessimistes pour l'API, et le test d'origine est limité par le réseau local/CPU partagé.
- Un seul processus API. Limites de débit relevées pour le test (sinon on mesurerait le limiteur, pas le serveur).

## Résultats

| Scénario | Charge | Erreurs | Résultat |
|---|---|---|---|
| API, 2 h compressées ×5 | 1 000 spectateurs | 0 | progression p95 177 ms |
| API ×10 | 1 000 | 0 | p95 395 ms, 1 197 req/s, 180 Mo RSS |
| API ×20 | 1 000 | 0 | p95 430 ms (p99 832 ms), 1 725 req/s, 204 Mo RSS |
| Démarrage, sessions existantes | 1 000 en 30 s | 0 | démarrage p50 3,6 s / p95 9,6 s (inclut 1er segment) |
| Démarrage, sessions existantes | 100 en 30 s | 0 | p50 78 ms / p95 131 ms |
| Démarrage avec 1 000 vraies connexions en 30 s | 1 000 | 24 réseau | login p50 4,8 s / p95 16,9 s : argon2 sature les fils |
| Origine seule, rythme réel | 100 spectateurs | 0 | segment p95 728 ms (~419 Mb/s) |
| Origine seule | 300 | 30 % > 4 s | dégradé |
| Origine seule | 1 000 | effondrement | segment p50 47 s |

## Conclusions
1. **L'API et la base ne sont pas le goulot** : le trafic réel de 1 000 spectateurs ≈ 150 req/s ; on a tenu 1 725 req/s sans erreur (≥ 10× de marge).
2. **L'origine seule sature vers 100–160 spectateurs simultanés (~400 Mb/s)** : le **CDN est obligatoire** pour 1 000 (B5, Bunny). Le serveur ne sert alors que les manifestes et l'API.
3. **Rafale de connexions** : argon2 monopolisait les fils de Node (partagés avec la lecture de fichiers). Correctif livré : au plus 2 hachages simultanés (`createLimiter`) et `UV_THREADPOOL_SIZE=16`. Le cas réaliste (sessions de 30 jours déjà ouvertes) est sans problème.

## À refaire après la mise en ligne
- Générateur sur une machine distincte, contre le vrai CDN Bunny (scénario `origin` avec `--base` du CDN).
- Rejouer la rafale de connexions avec le correctif argon2 en conditions réelles.


## Complément du 16/10/2026 — parcours du catalogue (accueil, fiches, recherche, « pour vous »)

Scénario `browse` (`npm run load:run -- --scenario browse`), catalogue synthétique (`load:prepare -- --catalog N`) :
1 000 spectateurs enchaînant accueil → fiche → similaires → recherche → « pour vous », pause de 2 à 6 s entre les pages,
45 s, **sans aucun cache navigateur** (pire cas), soit environ 230 requêtes/s (≈ 10× un usage réel).

| Catalogue | État du serveur | Erreurs | accueil p50 / p99 | « pour vous » p50 / p99 |
|---|---|---|---|---|
| 500 programmes | avant optimisation | 0 | 7 ms / 571 ms | 19 ms / 1,5 s |
| **5 000 programmes** | avant optimisation | **27,7 %** (délais) | 4,7 s / 39 s | 4,7 s / 39 s |
| 5 000 programmes | caches + calcul allégé | **0** | **9 ms / 0,8 s** | **120 ms / 1,2 s** |

**Ce que le test a révélé** : la revue d'architecture avait estimé que les recommandations « calculées à la demande » tenaient jusqu'à
~5 000 titres. **C'était faux** : à 5 000 titres, le calcul (≈ 75 ms de processeur par demande) saturait le serveur à 230 req/s.
Corrections (mesurées) :
1. cache serveur du catalogue public, 30 s, chargements simultanés regroupés, vidé à chaque écriture éditoriale (`CATALOG_CACHE_SECONDS`) ;
2. cache partagé des caractéristiques du catalogue et des tendances (60 s) pour les recommandations ;
3. calcul de proximité sans allocation ni normalisation répétée (genres « pliés » une seule fois par programme).

Latences séquentielles à 5 000 programmes (hors charge) : accueil 13 ms, recherche 11 ms, fiche 1 ms, similaires 4 ms, « pour vous » 26 ms.
**Limite restante** : le calcul « pour vous » reste proportionnel au nombre de programmes (≈ 20 ms à 5 000). Au-delà de ~20 000 titres
ou d'un usage soutenu supérieur à 50 req/s sur cette route, il faudra pré-calculer par thématique ou déplacer le calcul hors du processus.

## Complément du 30/10/2026 — taille et vitesse de la base à 10 000 comptes

Base dédiée `origin_load` : **10 000 comptes avec session, 5 000 programmes, ≈ 80 000 lignes de progression (8 par compte), 30 000 lignes de « Ma liste »**. PostgreSQL 17 local, même machine que le test (⚠️ ordre de grandeur, pas une garantie de production).

| Mesure | Résultat |
|---|---|
| Taille de **toute** la base | **40,8 Mo** (la plus grosse table : la progression, 14,5 Mo dont 6,4 Mo d'index) |
| Retrouver une session (à chaque requête connectée) | p50 0,10 ms / p95 0,28 ms |
| Enregistrer une progression (toutes les 12 s par spectateur) | p50 0,13 ms / p95 0,28 ms |
| Lire « Reprendre » / « Ma liste » | 0,10 ms / 0,04 ms (p50) |
| Recherche dans 5 000 programmes | p50 0,07 ms |
| Charger le catalogue de recommandation (5 000 prog.) | p50 3,7 ms / p95 12,8 ms (mis en cache 60 s) |
| Insérer un rapport de mesure de lecture | p50 0,13 ms |

Lecture : à cette échelle, **la base n'est pas le facteur limitant** ; le temps de réponse d'une requête est de l'ordre du dixième de milliseconde.
Croissance à surveiller (rien d'urgent) : `playback_sessions` (borné par la conservation de 180 jours), `watch_progress` (≈ 1,5 Ko par compte et par série suivie), `audit_log` (borné à 365 jours).
Limite non encore mesurée : recherche en `LIKE '%mot%'` (parcours complet) — à 5 000 programmes 0,07 ms ; au-delà de ~100 000 programmes, prévoir un index de recherche plein texte.
