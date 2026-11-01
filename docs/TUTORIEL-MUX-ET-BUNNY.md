# Tutoriel — brancher la diffusion vidéo : Mux ou Bunny (01/11/2026)

**Pour le propriétaire.** Création de comptes, clés et dépenses = vous. Les noms de boutons des consoles peuvent changer ; la logique reste la même. **Aucune clé n'est jamais collée dans le chat, dans Git ni dans le front** : elles vont uniquement dans le fichier d'environnement du serveur (`api/.env` en local, `deploy/.env.production` sur le serveur).

## 0. Mux ou Bunny ? (ce ne sont pas la même chose)
| | **Mux** | **Bunny** |
|---|---|---|
| Ce que c'est | Plateforme vidéo complète : prépare (encode), stocke, diffuse (CDN inclus), mesure | Stockage + CDN seulement |
| Qui prépare la vidéo | Mux | **Notre pipeline FFmpeg** (worker), puis envoi vers Bunny |
| Réglage chez nous | `VIDEO_PROVIDER=mux` | `DELIVERY_MODE=bunny` (la vidéo reste en `self`) |
| Prix (relevés 31/10 et 01/11, à reconfirmer) | Entrée « basic » gratuite ; stockage ≈ 0,0024 $/min/mois (≤ 720p) ; diffusion : **100 000 min offertes/mois**, puis ≈ 0,0008 $/min ([mux.com/pricing](https://www.mux.com/pricing)) | ≈ **0,01 $/Go** Europe/Amérique du Nord (réseau Standard), minimum 1 $/mois ([bunny.net/pricing](https://bunny.net/pricing/cdn/)) |
| Une séance de 2 h | ≈ 0,096 $ au-delà du quota gratuit | ≈ 0,02 $ (≈ 2,25 Go) |
| Effort d'exploitation | Faible | Plus élevé (notre pipeline et nos fichiers) |
- **Les deux peuvent coexister** : le choix est fait **par vidéo** (le back-office propose la voie ; chaque média garde la sienne).
- **Recommandation** : **Mux pour la bêta** (simplicité, 100 000 minutes gratuites ≈ 830 séances de 2 h par mois, lecture signée), puis comparer les coûts réels avant 1 000 personnes ; Bunny devient intéressant quand la diffusion dépasse largement le quota gratuit de Mux.

---
## 1. TUTORIEL MUX

### Étape 1 — Compte et environnement
Console Mux → votre organisation (« PTH ») → un environnement (« MVP », type *Development* pour tester ; en créer un autre pour la production).

### Étape 2 — Jeton d'accès (envoi, suivi, suppression)
*Settings → Access Tokens → Generate new token* ; permissions **Mux Video : Read + Write**. Notez **Token ID** et **Token Secret** (**affiché une seule fois**).
⚠️ Les anciens jetons ont transité par le chat : **les révoquer et en générer de nouveaux**.

### Étape 3 — Clé de signature (liens de lecture protégés)
*Settings → Signing Keys* (**même environnement que le jeton**) → *Generate new key*. Notez **Key ID** et la **clé privée** (texte base64 ; notre code accepte aussi le PEM brut).

### Étape 4 — Fichier d'environnement du serveur
```
VIDEO_PROVIDER=mux
MUX_TOKEN_ID=<Token ID>
MUX_TOKEN_SECRET=<Token Secret>
MUX_VIDEO_QUALITY=basic          # le moins cher
MUX_PLAYBACK_POLICY=signed       # lecture protégée (exige les deux lignes suivantes, sinon le serveur refuse de démarrer)
MUX_SIGNING_KEY_ID=<Key ID>
MUX_SIGNING_PRIVATE_KEY=<clé privée base64>
MUX_NORMALIZE_AUDIO=false
```
Redémarrer l'API : `docker compose --env-file .env.production up -d` (serveur) ou `npm run dev` (local).

> **Qualité « plus » (choisie le 01/11)** : l'encodage « plus » est **payant à l'entrée**, une seule fois par vidéo : ≈ 0,025 $/min jusqu'à 720p, ≈ 0,031 $/min en 1080p ([tarifs Mux](https://www.mux.com/docs/pricing/overview)), soit ≈ **3 à 3,75 $ pour un film de 2 h**. « basic » est gratuit à l'entrée. À reconfirmer sur la page tarifs avant tout gros envoi.

### Étape 5 — Vérifier SANS coût
```bash
cd api
npm run mux:check          # crée puis annule une adresse d'envoi : aucune vidéo, aucun coût attendu
npm run mux:usage          # lit seulement NOTRE base (minutes Mux enregistrées) : aucun appel à Mux
npm run mux:usage -- --remote   # lecture seule chez Mux : détecte les vidéos orphelines
```
Attendu : « ✅ Identifiants acceptés ».

### Étape 6 — Premier vrai essai (consomme un peu de quota : **à n'autoriser que si vous êtes d'accord**)
```bash
npm run mux:check -- --video    # envoie 4 s de vidéo générée, attend « prête », vérifie le lien, puis SUPPRIME la vidéo
```
Puis, avec la politique `signed` : un lien **sans jeton** doit être refusé, un lien **signé** accepté, et le jeton se renouvelle pendant une longue lecture (plan complet : `docs/PLAN-TEST-MUX-FILM-LONG.md`). Pour un film long de test, n'utilisez qu'un contenu dont vous détenez les droits ; relevez `npm run mux:usage` **avant et après**, puis supprimez les vidéos de test.

### Étape 7 — Utilisation courante (back-office)
1. Choisir la voie **Mux** (`GET /api/admin/video-providers`). 2. Le navigateur envoie le fichier **directement à Mux** (adresse d'envoi créée par `POST /api/admin/mux/uploads`), sans clé côté navigateur. 3. Suivi : le back-office interroge `GET /api/admin/mux/uploads/:id` toutes les 3 à 5 s. 4. État `ready` → le média est lisible ; **la publication du programme reste une décision éditoriale** (brouillon par défaut).

### Dépannage Mux
| Symptôme | Cause probable | Solution |
|---|---|---|
| Le serveur refuse de démarrer | `signed` sans clé de signature, ou jeton incomplet | Renseigner les **deux** lignes de signature, ou repasser en `public` pour tester |
| `mux:check` : accès refusé | Mauvais jeton ou mauvais environnement | Regénérer le jeton dans l'environnement voulu |
| Lecture en 403 | Politique `signed` sans jeton, ou clé de signature d'un autre environnement | Clé et jeton **du même environnement** ; horloge du serveur à l'heure |
| L'envoi échoue côté navigateur | Origine non autorisée pour l'envoi direct | L'API fournit l'origine du site ; vérifier `PUBLIC_APP_URL` |
| Coût inattendu | Vidéos de test oubliées | `mux:usage -- --remote`, supprimer, alerte de dépense dans la console Mux |

---
## 2. TUTORIEL BUNNY (voir aussi `docs/GUIDE-BUNNY.md`, plus détaillé)

```
Worker (notre serveur) ──envoie──▶ Bunny Storage (fichiers HLS)
Spectateur ◀── Bunny CDN (Pull Zone) ◀── Storage      l'URL signée est fournie par notre API (jeton 4 h, vérifié par le CDN)
```
Notre API ne sert plus la vidéo : elle ne fait que **donner l'autorisation**.

### Étape 1 — Zone de stockage
bunny.net (mot de passe fort + double authentification) → **Storage → Add Storage Zone** : nom `origin-videos`, région **Falkenstein (DE)**. *FTP & API Access* → **mot de passe de la zone** = `BUNNY_STORAGE_KEY` ; nom = `BUNNY_STORAGE_ZONE`.

### Étape 2 — CDN (Pull Zone) relié au stockage
*Connected Pull Zone* → créer `origin-videos` ; adresse `https://origin-videos.b-cdn.net` = `BUNNY_CDN_URL` ; réseau **Standard**.

### Étape 3 — Réglages indispensables
| Réglage | Valeur |
|---|---|
| **Token Authentication** (Security) | **Activé** — sinon n'importe qui lit les vidéos ; la clé affichée = `BUNNY_TOKEN_KEY` |
| CORS | Autoriser l'adresse de **votre site** (en origine unique : `https://app.<domaine>`) |
| Cache Expiration | **1 an** (chaque version vit dans son dossier et ne change jamais) |

### Étape 4 — Fichier d'environnement du serveur
```
DELIVERY_MODE=bunny
BUNNY_CDN_URL=https://origin-videos.b-cdn.net
BUNNY_TOKEN_KEY=<clé Token Authentication>
BUNNY_STORAGE_ZONE=origin-videos
BUNNY_STORAGE_KEY=<mot de passe de la zone de stockage>
BUNNY_STORAGE_HOST=storage.bunnycdn.com
VIDEO_PROVIDER=self
```

### Étape 5 — Vérifier la chaîne complète
```bash
cd api && npm run cdn:check
```
Envoie un petit fichier, le lit avec un jeton valide (**doit réussir**), sans jeton, avec un jeton expiré et avec celui d'un autre dossier (**doivent être refusés**), puis nettoie. **Tout doit être ✅.**

### Étape 6 — Mise en service
Redémarrer l'API **et le worker** ; mettre une vidéo en file (`npm run media:enqueue -- …` ou envoi depuis le back-office). À la fin de l'encodage, le worker envoie les fichiers à Bunny, puis le média devient lisible : `GET /api/programs/<id>/playback` renvoie une adresse `https://…b-cdn.net/…`.

### Automatique
Un dossier par version (retour arrière facile) ; playlist maître envoyée **en dernier** (pas de contenu à moitié lisible) ; empreinte SHA-256 par fichier ; 3 tentatives par fichier ; anciennes versions supprimées après la nouvelle.

### Dépannage Bunny
| Symptôme de `cdn:check` | Cause probable | Solution |
|---|---|---|
| Envoi : 401 | Nom de zone ou clé erronés | `BUNNY_STORAGE_KEY` = mot de passe de la **zone**, pas la clé de compte |
| Envoi : 404/301 | Mauvais hôte régional | Ajuster `BUNNY_STORAGE_HOST` (ex. `uk.storage.bunnycdn.com`) |
| Jeton valide : 403 | Mauvaise clé ou Token Authentication désactivé | Vérifier `BUNNY_TOKEN_KEY` |
| Sans jeton : 200 | Token Authentication désactivé | L'activer (Security) |
| Jeton valide : 404 | Pull Zone non reliée à la bonne zone, ou propagation | Attendre, vérifier la liaison |

### Coût
≈ 0,01 $/Go (Europe) : 1 000 personnes × 2 h ≈ 2,25 To ≈ **22 $**/mois ; stockage d'un film de 2 h ≈ 9 Go (quelques centimes). **Activer la limite de dépense** dans le compte Bunny.

---
## 3. Checklist commune avant d'ouvrir au public
- [ ] Anciennes clés révoquées, nouvelles saisies **uniquement** sur le serveur
- [ ] Contrôle sans coût (`mux:check` ou `cdn:check`) tout ✅
- [ ] Un contenu de test **dont vous avez les droits** lu depuis Internet (ordinateur + mobile)
- [ ] Lien sans jeton refusé, lien expiré refusé
- [ ] Limite de dépense / alerte configurée chez le fournisseur
- [ ] Vidéos de test supprimées ; programme encore en **brouillon** jusqu'à la publication éditoriale
