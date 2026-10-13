# Guide Bunny — mettre la diffusion en ligne (étape B5)

Ce guide est pour **toi** : la création du compte et des clés doit être faite par la personne propriétaire du projet.
Les noms de boutons de Bunny peuvent légèrement changer ; la logique reste la même.

## Ce que Bunny fait pour nous

```
 Worker (ton Mac / serveur) ──envoie──▶ Bunny Storage (les fichiers vidéo)
                                              │ connecté à
 Spectateur ◀──── Bunny CDN (Pull Zone) ◀─────┘     (serveurs proches de chaque spectateur)
        ▲
        └── l'URL signée est fournie par notre API (jeton valable 4 h, vérifié par le CDN lui-même)
```

Notre API ne sert plus les vidéos : elle ne fait que **donner l'autorisation**. C'est ce qui permet à 1 000 personnes de regarder
en même temps sans saturer ton serveur.

## Étape 1 — Créer la zone de stockage (Storage Zone)

1. Crée un compte sur bunny.net (toi-même ; mot de passe fort, double authentification activée).
2. **Storage** → **Add Storage Zone**.
   - Nom : `origin-videos` (ou un autre, en minuscules).
   - **Main storage region : Falkenstein (DE)** — la plus proche de la France et de la Belgique.
   - Réplication : aucune pour commencer (on pourra en ajouter une).
3. Ouvre la zone → **FTP & API Access** : note le **mot de passe de la zone** (« Password »). C'est `BUNNY_STORAGE_KEY`.
   Le nom de la zone est `BUNNY_STORAGE_ZONE`.

## Étape 2 — Créer le CDN (Pull Zone) relié à ce stockage

1. Dans la zone de stockage → **Connected Pull Zone** → **Connect Pull Zone** (ou **CDN → Add Pull Zone** avec pour origine « Storage Zone »).
2. Nom : par exemple `origin-videos` → l'adresse sera `https://origin-videos.b-cdn.net` : c'est `BUNNY_CDN_URL`.
3. Réseau (« Pricing Zone ») : **Standard** — la couverture la plus large, ≈ 0,01 $/Go en Europe et Amérique du Nord.

## Étape 3 — Réglages de la Pull Zone (indispensables)

| Réglage | Où | Valeur | Pourquoi |
|---|---|---|---|
| **Token Authentication** | Security | **Activé** | Sans lui, n'importe qui peut lire les vidéos |
| Clé d'authentification | Security → Token Authentication | copier la clé | C'est `BUNNY_TOKEN_KEY` |
| **CORS** | Headers (ou General) | Activer « Add CORS headers » et autoriser l'adresse de ton site | Le lecteur vidéo est sur un autre domaine |
| **Cache Expiration Time** | Caching | **Override : 1 an** | Chaque version d'une vidéo a son propre dossier : elle ne change jamais |
| Optimize for large files / Slicing | Caching | Activé (facultatif) | Meilleur pour les gros fichiers |

## Étape 4 — Mettre les clés dans `api/.env` (jamais dans le chat, jamais dans git)

Crée le fichier `ORIGIN-plateforme/api/.env` (il est ignoré par git) :

```
DELIVERY_MODE=bunny
BUNNY_CDN_URL=https://origin-videos.b-cdn.net
BUNNY_TOKEN_KEY=<clé de Token Authentication>
BUNNY_STORAGE_ZONE=origin-videos
BUNNY_STORAGE_KEY=<mot de passe de la zone de stockage>
BUNNY_STORAGE_HOST=storage.bunnycdn.com
```

## Étape 5 — Vérifier la chaîne complète

```bash
cd ~/Desktop/ORIGIN-plateforme/api && npm run cdn:check
```

Le script envoie un petit fichier, le lit avec un jeton valide (doit réussir), sans jeton (doit être refusé),
avec un jeton expiré (doit être refusé) et avec le jeton d'un autre dossier (doit être refusé), puis nettoie.
**Tout doit être ✅ avant d'aller plus loin.**

## Étape 6 — Passer en production

1. Redémarrer l'API et le travailleur (`npm run dev`, `npm run worker`) : ils lisent `.env`.
2. Mettre une vidéo en file : `npm run media:enqueue -- …` (ou envoi depuis l'interface d'administration).
3. À la fin de l'encodage, le travailleur envoie les fichiers vers Bunny, puis le média devient lisible.
4. `GET /api/programs/<id>/playback` renvoie maintenant une URL en `https://…b-cdn.net/…`.

## Ce qui est automatique

- **Un dossier par version** : `hls/<id>/<version>/`. On ne remplace jamais des fichiers en place : pas de mélange d'anciens et de nouveaux segments, cache long possible, retour arrière facile.
- **La playlist maître est envoyée en dernier** : tant qu'elle n'est pas là, le contenu n'est pas lisible.
- **Contrôle d'intégrité** : chaque fichier est envoyé avec son empreinte SHA-256 ; Bunny refuse un fichier altéré.
- **Reprise en cas d'erreur réseau** : 3 tentatives par fichier, attente croissante.
- **Nettoyage** : les anciennes versions sont supprimées une fois la nouvelle lisible.

## Si ça échoue (`npm run cdn:check`)

| Symptôme | Cause probable | Solution |
|---|---|---|
| ❌ Envoi vers Bunny Storage, HTTP 401 | Mauvais nom de zone ou mauvaise clé | Revérifier `BUNNY_STORAGE_ZONE` et `BUNNY_STORAGE_KEY` (mot de passe de la **zone**, pas la clé de compte) |
| ❌ Envoi, HTTP 404/301 | Mauvais hôte régional | Ajuster `BUNNY_STORAGE_HOST` (ex. `uk.storage.bunnycdn.com`) selon la région choisie |
| ❌ Lecture avec jeton valide, HTTP 403 | Clé de jeton incorrecte, Token Authentication non activé, ou format du jeton | Vérifier `BUNNY_TOKEN_KEY` ; si tout est bon, me transmettre le résultat du script (sans les clés) : le format du jeton de répertoire est la seule partie que je n'ai pas pu valider sans compte |
| ❌ Lecture sans jeton, HTTP 200 | Token Authentication désactivé | L'activer dans Security |
| ❌ Lecture avec jeton valide, HTTP 404 | Le CDN ne voit pas encore le fichier, ou la Pull Zone n'est pas reliée à la bonne zone | Attendre quelques secondes, vérifier la connexion Pull Zone ↔ Storage Zone |

## Coût (à vérifier sur la page tarifs de Bunny au moment de la création)

| Poste | Ordre de grandeur |
|---|---|
| Diffusion : 1 000 personnes × 2 h ≈ 2,25 To | ≈ 22 $ (réseau Standard, Europe) |
| Stockage : un film de 2 h ≈ 9 Go | quelques centimes par mois |
| Minimum mensuel | quelques dollars |

La limite de dépense peut être fixée dans le compte Bunny : **active-la**.
