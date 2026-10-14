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
