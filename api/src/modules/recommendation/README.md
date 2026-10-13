# Module « recommendation » (à construire — après le catalogue et les comptes)

**Rôle :** répondre à « que proposer à cette personne ? ».

Principe : on avance par paliers, sans promettre une « intelligence » que les données ne permettent pas.

| Palier | Idée | Données nécessaires |
|---|---|---|
| 1. Éditorial | Sélections choisies par l'équipe, par thème (foi, pardon, famille…) | Aucune |
| 2. Règles | Thèmes proches de ce que la personne a terminé, nouveautés, popularité récente | Historique de lecture |
| 3. Similarité | « Les personnes qui ont regardé X ont aussi regardé Y » | Quelques milliers d'utilisateurs actifs |
| 4. Modèle appris | Classement personnalisé appris | Beaucoup de données ; hors périmètre à 1 000 utilisateurs |

Contrat interne prévu : `recommend(userId, context) -> liste ordonnée de programmes + raison`.
Chaque recommandation porte sa RAISON (« parce que vous avez regardé… ») : pas de boîte noire, et c'est ce qui
permet d'expliquer et de corriger. Les thèmes vivent dans la base (table de thèmes liée aux programmes),
jamais dans l'arborescence des dossiers.
