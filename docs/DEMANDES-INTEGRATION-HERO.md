# ORIGIN / MILLENIUM — Demandes d'intégration : bloc « Hero Section » (30/10/2026)

Émetteur : agent back-end (responsable des contrats et de la cohérence technique). Destinataires : **agent front** (§2), **agent back-office** (§3). Exemples de requêtes/réponses **réels** : `docs/BRIEF-FRONT-ROUTES-EXEMPLES.md`. Contrat normatif : `docs/API-CONTRACT.md` (v1.10).

## 1. Constat vérifié (code lu + exécutions)

### Ce que fait la Hero aujourd'hui (`src/components/origin/origin-hero.tsx`, branche `front/hero-immersive`)
| Élément visible | Source réelle aujourd'hui | État |
|---|---|---|
| Programmes (titre, synopsis, visuels, vidéo d'ambiance) | `originPrograms` : données **locales** (`origin-programs.ts`, images/vidéos embarquées) | **Fictif** — mais les 10 identifiants sont **identiques** à ceux de `GET /api/collections/hero` (vérifié) |
| Programme sélectionné | état local `selected` → `active = programs[selected]` ; toutes les actions lisent `active.id` | **Cohérent** (une seule référence) |
| **Ma liste** | `toggleList` → `update(...)` de `demo-space` (stockage navigateur) ; l'utilisateur vient de `demo-session` | **Fictif** : rien n'est écrit sur le serveur |
| **Regarder** | navigation vers `/production/$slug` | Route OK ; la page appelle réellement `GET …/playback` et lit la vidéo (validé) |
| **Infos** | boîte de dialogue + « Voir la fiche » | OK (données locales) |
| Bande-annonce | `trailerUrl` / vidéo d'ambiance locale | Données locales ; **aucune gestion serveur des bandes-annonces** (seul `heroVideoUrl`) |
| Recherche, compte, menu | menu flottant, panneau de recherche local | **Fictif** |
| Authentification | `demo-session` | **Fictif** |

### Ce que le back-end garantit (mesuré)
**Tests automatiques : 277 passés, 0 échec** (dont 9 nouveaux sur l'isolation). **Navigateur réel** (page `http://localhost:3210`, API `http://localhost:4000`, cookies + CORS) :
| Vérification | Résultat |
|---|---|
| Inscription, session reconnue (`GET /api/me`) | ✔ cookie posé, renvoyé automatiquement |
| Ajout à « Ma liste », **double clic simultané** | ✔ 204 / 204, **une seule** ligne |
| **Actualisation de la page** | ✔ session et liste intactes |
| Retrait | ✔ disparaît de la liste (et de la base) |
| **Déconnexion** | ✔ ancienne session → 401 (lecture et écriture) |
| **Reconnexion** | ✔ liste **et** position de reprise (420 s) restaurées ; « Continuer à regarder » (46,7 %), bouton principal « resume » |
| **Deuxième compte** | ✔ liste vide, progression 404, « Continuer » vide, bouton « start » ; le retirer **ne touche pas** le pilote |
| Contenu inconnu ou brouillon | ✔ `PUT /api/me/list/:slug` → **404** (plus de ligne fantôme) |
| Plafond de 500 contenus sous 5 ajouts simultanés | ✔ exactement 500 (verrou par compte) |
| Envoi de progression en retard | ✔ n'écrase pas un envoi plus récent (`sentAt`) |
| Identité usurpée (`?userId=`, en-tête `X-User-Id`, corps) | ✔ ignorée : l'identité vient **uniquement** du cookie de session |
| Suppression de compte | ✔ ses données disparaissent, celles de l'autre restent |

### Corrections back-end livrées dans ce bloc
1. `PUT /api/me/list/:slug` : refuse (**404**) un contenu inconnu ou non publié (avant : ajoutait une ligne fantôme).
2. Plafond de la liste désormais **atomique** (avant : « compter puis insérer », dépassable par des ajouts simultanés).
3. Tests d'isolation, de concurrence et de persistance (`src/modules/mylist/isolation.test.ts`).

## 2. Demandes à l'AGENT FRONT (par priorité)

> Règle d'or : **l'interface reflète l'état du serveur.** Toute action = appel API ; l'état affiché vient de la réponse ; en cas d'échec, l'écran revient à l'état réel.

**F1 — Authentification réelle (bloquant pour tout le reste).** Remplacer `demo-session`/`demo-accounts` par les clients de la branche `front/comptes-securite` (`auth-api.ts`, `auth-context.tsx`), mis à jour au contrat v1.10. État connecté = résultat de `GET /api/me` (`401` = visiteur). `fetch(..., { credentials: 'include' })` partout. **Définir `VITE_API_URL=http://localhost:4000`** dans `.env.local` : le repli actuel `127.0.0.1` n'enverra pas le cookie. Supprimer le mot de passe de démonstration du code.

**F2 — Ma liste (bouton de la Hero), exigences précises**
- Au chargement d'une session : `GET /api/me/list` → mémoriser l'**ensemble des slugs** (c'est la source de `inList`).
- Clic : visiteur → `/connexion` avec retour ; connecté → `PUT /api/me/list/:slug` (ajout) ou `DELETE …` (retrait).
- **Mise à jour optimiste avec retour arrière** : si la réponse n'est pas `204`, restaurer l'état et signaler l'erreur.
- **Sérialiser les requêtes par slug** (une file par contenu) : sinon deux clics rapides peuvent arriver dans le désordre (le serveur applique l'ordre d'arrivée). Désactiver ou ignorer le clic tant qu'une requête du même slug est en cours.
- L'identifiant envoyé est **toujours `active.id` au moment du clic** (le capturer, ne pas le relire après l'attente).
- `404` = contenu inconnu/retiré du catalogue ; `400` = plafond de 500 atteint ; `401` = session expirée → écran de connexion, **puis** rejouer l'action.
- Changement de compte ou déconnexion : **vider** tout cache lié à l'utilisateur (clés de requête incluant l'identifiant).
- La page « Ma liste » (`/ma-liste`) lit `GET /api/me/list` (chaque élément porte sa fiche `program`, `null` si le contenu a été retiré).

**F3 — Données de la Hero.** Remplacer `originPrograms` par `GET /api/collections/hero` (ou `GET /api/home`) : même identifiants. Utiliser `playable` pour décider si « Regarder » est actif (sinon « Bientôt disponible »). Images/vidéos : **préfixer par `VITE_API_URL`** (`images.hero`, `heroVideoUrl` sont relatifs ; servis avec `Range` et CORS, vérifié). Conserver la direction artistique et la disposition.

**F4 — Regarder (cohérence du programme).** Une seule route `/production/$slug` ; le bouton lit `active.id`. Pour le libellé et la cible : `GET /api/programs/:slug/play-target` (`start` « Regarder » · `resume` « Reprendre » · `next` « Épisode suivant » · `rewatch` « Revoir »). Sur la page de lecture, **lire tous les champs déjà renvoyés** par `/playback` :
- `ident` : jouer l'ident **si `ident.show`**, envoyer `identSeen=1` pour un visiteur qui l'a déjà vu ;
- `resume.positionSeconds` : démarrer à cet instant ;
- `markers` : « Passer l'intro » entre `introStart` et `introEnd` ; « Épisode suivant » dès `creditsStart` ;
- `next` : épisode suivant (appeler `/playback?autoplay=1`) ;
- `subtitles` : n'afficher le sélecteur **que s'il y a des pistes** ;
- `content` : titre/épisode de la barre du lecteur.
**Ne pas afficher** « Audio : Français/English/Audiodescription » : une seule piste existe (fonction absente du back-end).

**F5 — Enregistrer la progression.** `PUT /api/me/progress/:playbackId` `{positionSeconds, durationSeconds, sentAt: Date.now()}` toutes les 10–15 s **et** à la pause, au `visibilitychange` (page masquée), au `pagehide` et en quittant la page (utiliser `fetch(..., { keepalive: true, credentials: 'include' })` ; éviter `sendBeacon` avec du JSON : il déclenche une pré-requête CORS). Réponse tardive/ancienne : sans risque côté serveur (`sentAt`). Fin de film : le serveur marque « terminé » à partir de 95 % de la durée (ou dans les 30 dernières secondes d'un film long).

**F6 — Infos et bande-annonce.** « Infos » : utiliser la fiche (`GET /api/programs/:slug`) pour la durée, les genres, les saisons. Bande-annonce : seule la vidéo d'ambiance (`heroVideoUrl`) existe côté serveur ; le champ `trailerUrl` de la fiche est libre. Tant que le back-office ne gère pas les bandes-annonces, **nommer** la fonction « Aperçu » plutôt que « bande-annonce » ou masquer le bouton sans `trailerUrl`.

**F7 — Recherche et compte (accès depuis la Hero).** Recherche : `GET /api/search` (afficher `correctedQuery`), suggestions `GET /api/search/suggestions` (anti-rebond ~150 ms), recherches récentes `POST /api/me/searches` **à la validation**. Compte : `/compte` lit `GET /api/me`, préférences, appareils (voir `BRIEF-FRONT-ROUTES-EXEMPLES.md`).

**F8 — États transverses.** Chargement (squelette), erreur réseau (« Service momentanément indisponible » + Réessayer, `requestId` visible), `429` (attendre `Retry-After`), session expirée (`401` → reconnexion puis reprise de l'action), double clic (verrouillage du bouton), réponse tardive (ignorer une réponse dont le slug n'est plus le programme actif).

**F9 — Suppression de compte.** L'écran doit demander le **mot de passe** (l'API l'exige), pas seulement « SUPPRIMER ».

**Critère de recette (à exécuter dans un navigateur, sur deux comptes) :**
1. Sélectionner un film dans la Hero → titre, synopsis, Regarder, Infos, Ma liste concernent **le même** film.
2. Ma liste → actualiser → le film est resté ; `/ma-liste` le montre ; le retirer → disparaît partout.
3. Se déconnecter / se reconnecter → état restauré. Se connecter avec un 2ᵉ compte → liste vide.
4. Regarder → quitter à mi-parcours → revenir : « Reprendre » et reprise à la bonne seconde.
5. Aucun appel à `127.0.0.1` ; aucune erreur console ; aucune donnée personnelle dans `localStorage`.

## 3. Demandes à l'AGENT BACK-OFFICE
**B1 — Curation de la Hero.** La Hero = la collection `hero` (`PUT /api/admin/collections/hero`, `home_position: 0`, `layout: hero`, liste ordonnée d'`items`). Aucun écran ne la gère : à ajouter (ordre, ajout/retrait).
**B2 — Médias et lecture.** Écran de saisie des repères (`PUT /api/admin/media/:playbackId/markers`) et des sous-titres (`PUT /files/subtitles/:playbackId/:lang`) ; programmation des sorties et mots-clés dans la fiche (déjà au contrat v1.9). Détail : `docs/BRIEF-BACK-OFFICE-IMPORT-PUBLICATION.md`.
**B3 — Bandes-annonces.** Non disponible côté serveur ; en attendant, `trailerUrl` est un champ libre de la fiche.

## 4. Limites restantes (déclarées)
- **Aucun écran de la Hero n'est encore branché** : toutes les vérifications ci-dessus sont **côté API en navigateur réel**, pas dans l'interface MILLENIUM. Tant que F1–F5 ne sont pas faits, « Ma liste » de la Hero reste simulée.
- Bandes-annonces gérées, audio multiple, direct, profils multiples : absents (voir `docs/ETAT-GENERAL-PLATEFORME-2026-10-30.md`).
- Lecture signée Mux : bloquée par l'absence de clé de signature (voir `docs/PLAN-TEST-MUX-FILM-LONG.md`).
- Le film réel de 85 min est encore en cours d'encodage local.

## 5. État réel au 30/10/2026 (mis à jour)
| Demande | État | Preuve |
|---|---|---|
| Messages envoyés aux sessions « Agent front brief » et « Back-office ORIGIN phase 1 » | **envoyés**, aucune réponse reçue à ce stade | — |
| F1–F9 (front) | **non commencées** : la branche `front/hero-immersive` (`b90d441`) utilise toujours `demo-accounts`/`demo-session`/`demo-space` | lecture du code |
| Banc de référence « comme un front » (autre origine que l'API, mêmes cookies et CORS) | **28/28** vérifications réussies dans un navigateur réel, base et comptes jetables | `api/scripts/recette/` |
| Envoi de la progression à la **fermeture de la page** (`fetch` + `keepalive` + `credentials`, avec pré-requête CORS) | **fonctionne** (reprise 125,1 s après une dernière envoi périodique à 122,6 s) — mesuré sous Chromium ; Safari/Firefox non testés | bench, test CORS |
| Session expirée pendant la lecture | `401` propre, dernière position conservée, envoi rejouable après reconnexion | `isolation.test.ts` |

**Piège à connaître (front) :** les cookies ignorent le **port**. En développement, `localhost:3210` ↔ `localhost:4000` fonctionne ; mais deux API sur deux ports de `localhost` partagent le même cookie `origin_session` (une connexion écrase l'autre).
**Lancer la recette sur le vrai front :** `api/scripts/recette/start.sh`, puis le front sur `:3211` avec `VITE_API_URL=http://localhost:4020`.

## 6. Mise à jour du 30/10/2026 (soir) — la connexion et Ma liste existent maintenant dans MILLENIUM
Le travail demandé en F1 (authentification réelle) et F2 (Ma liste) a été réalisé et **vérifié dans l'interface MILLENIUM** sur une branche locale **`integration/backend-hero`** du dépôt front (commit `ca33e50`, dossier de travail séparé `~/Desktop/ORIGIN-app-integration`). **Elle n'est ni fusionnée ni publiée.** L'agent front garde la décision de la reprendre (fusion ou réécriture) ; ses fichiers de travail n'ont pas été modifiés. Détail, preuves et écarts restants : `docs/MATRICE-INTEGRATION-MILLENIUM.md`.
