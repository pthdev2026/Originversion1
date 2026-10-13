# Module « identity » (à construire — étape B2)

**Rôle :** savoir QUI est la personne et CE QU'ELLE A LE DROIT de faire.

Contenu prévu :
- inscription, connexion, déconnexion, réinitialisation du mot de passe ;
- sessions en cookie `httpOnly` (le mot de passe ne circule jamais après la connexion) ;
- rôles : `viewer` (spectateur), `admin` ;
- vérification du droit de lecture AVANT de signer une URL (le service `playback` appellera `identity`) ;
- journal d'audit (qui a fait quoi, quand).

Règles : mots de passe hachés avec argon2, jamais en clair, jamais dans les journaux. Limitation des tentatives.
Accès : gratuit et ouvert pour le moment ; le module prévoit déjà un champ « invitation » pour passer plus tard
à un accès sur invitation sans refonte.
