# Recette isolée (environnement jetable)

Valide, dans un **vrai navigateur**, le parcours multi-comptes contre le vrai back-end, **sans jamais toucher** à la base ni aux comptes de développement.

```bash
cd api && scripts/recette/start.sh     # base jetable `origin_recette`, API :4020, page de test :4021
# ouvrir http://localhost:4021/  → « RECETTE OK » + tableau des vérifications
scripts/recette/stop.sh                # supprime base, comptes de test et fichiers temporaires
```
- Les comptes de test sont créés par la page (`*@origin.test`, mots de passe aléatoires) puis **supprimés** par elle.
- L'administrateur de recette est généré au hasard dans `/tmp/origin-recette/admin.cred` (droits 600).
- Les médias sont des **liens en lecture seule** vers `storage/videos` ; aucun worker, aucun envoi vers un service externe.
- Pour recetter le **vrai front**, le lancer sur `:3211` avec `VITE_API_URL=http://localhost:4020` (variable d'environnement, aucun fichier modifié) : l'API de recette autorise cette origine.
- Piège connu : les cookies ignorent le **port** ; le navigateur partage donc ceux de `localhost:4000` et `localhost:4020`. Les comptes de recette y sont isolés par la base, mais pensez à vous déconnecter après usage.
