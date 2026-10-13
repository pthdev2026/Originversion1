# Module « analytics » (à construire — étape B3)

**Rôle :** mesurer l'expérience de lecture réelle pour piloter l'objectif « hyper fluide ».

Contenu prévu (déjà écrit sur la branche `wip/playback-metrics`) :
- une session de lecture = un identifiant aléatoire côté navigateur, rapports cumulatifs toutes les 15 s ;
- mesures : temps de démarrage, nombre et durée des coupures, qualité regardée, erreurs fatales ;
- synthèse : p50/p75/p95 de démarrage, ratio de coupures, taux d'erreurs, objectifs (< 2 s, < 1 %).

Vie privée : aucune adresse IP, aucun identifiant de compte, aucun user-agent brut conservé.
