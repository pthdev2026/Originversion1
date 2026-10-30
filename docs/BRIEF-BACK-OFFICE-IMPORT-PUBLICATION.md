# ORIGIN — Routes pour le back-office : importation, préparation, publication (30/10/2026)

Pour l'**agent back-office**. Les exemples marqués « réponse réelle » ont été **exécutés contre l'API locale** avec un compte administrateur de test, puis abrégés. Les formes non exécutées (elles consommeraient Mux) sont signalées. Référence normative : `docs/API-CONTRACT.md` (v1.9). Aucune clé ne passe par le back-office : il utilise la **session administrateur** (cookie) et, en production, la 2FA.

## 0. Le parcours cible d'un film
```
1. voie ?            GET  /api/admin/video-providers
2. fiche             PUT  /api/admin/programs/:slug        (brouillon, published:false)
3. fichier           « self » : tus  POST/PATCH /uploads     |  « mux » : POST /api/admin/mux/uploads + PUT du fichier sur uploadUrl
4. suivi             « self » : GET /api/admin/jobs[/:id]   |  « mux » : GET /api/admin/mux/uploads/:id  (fait avancer l'état)
5. repères/sous-t.   PUT /api/admin/media/:playbackId/markers · PUT /files/subtitles/:playbackId/:lang
6. publication       PUT /api/admin/programs/:slug avec published:true   (ou publishAt pour programmer)
7. contrôle          GET /api/admin/programs/:slug  ·  GET /api/programs/:playbackId/playback (≠ 404 = lisible)
```
**Règle d'or :** « publié » et « lisible » sont deux conditions **indépendantes**. Un programme peut être publié sans média prêt (il s'affiche, `playable:false`, la lecture répond `404 not_available`). Le contenu devient lisible **uniquement** quand sa tâche est `succeeded` (voie `self`) ou son envoi `ready` (voie `mux`).

**Identifiants de lecture :** film/documentaire = `<slug>` ; épisode = `<slug>-<clé d'épisode>` (ex. `ma-serie-s1-e1`).

---

## 1. Voies vidéo et tableau de bord

### Quelles voies sont disponibles ?

`default` = la voie à proposer d'abord (variable `VIDEO_PROVIDER`).

**Requête** (session administrateur, `credentials: 'include'`)
```http
GET /api/admin/video-providers
```
**Réponse réelle** (abrégée)
```http
HTTP 200
{
  "default": "self",
  "providers": [
    {
      "id": "self",
      "label": "ORIGIN (encodage sur notre serveur, diffusion Bunny ou serveur)",
      "configured": true
    },
    {
      "id": "mux",
      "label": "Mux (préparation et diffusion par Mux)",
      "configured": true,
      "playbackPolicy": "public"
    }
  ]
}
```

### Catalogue (liste admin, brouillons compris)

**Requête** (session administrateur, `credentials: 'include'`)
```http
GET /api/admin/catalog
```
**Réponse réelle** (abrégée)
```http
HTTP 200
{
  "programs": [
    {
      "slug": "acteurs",
      "kind": "serie",
      "title": "Acteurs de l’ombre",
      "published": true,
      "isDemo": true
    },
    {
      "slug": "au-dela",
      "kind": "serie",
      "title": "Au-delà",
      "published": true,
      "isDemo": true
    },
    "… (+36 autres)"
  ],
  "collections": [
    {
      "slug": "hero",
      "title": "À l’affiche",
      "layout": "hero",
      "published": true,
      "homePosition": 0,
      "itemCount": 10
    },
    {
      "slug": "top-10",
      "title": "Top 10 — Les histoires qui font parler",
      "layout": "ranked",
      "published": true,
      "homePosition": 1,
      "itemCount": 14
    },
    "… (+8 autres)"
  ]
}
```


---

## 2. Créer la fiche (brouillon) puis la relire

### Créer le brouillon

`201` à la création, `200` à la modification. Le corps est un **document complet** (voir le contrat pour tous les champs). Tout programme est un brouillon tant que `published` vaut `false`.

**Requête** (session administrateur, `credentials: 'include'`)
```http
PUT /api/admin/programs/exemple-bo
content-type: application/json

{"kind": "film", "title": "Exemple back-office", "tagline": "Accroche de démonstration", "synopsis": "Résumé.", "category": "Film original", "durationLabel": "1 h 30", "year": 2026, "language": "Français", "genres": ["Drame"], "keywords": ["exemple", "démonstration"], "published": false, "publishAt": null, "unpublishAt": null, "announced": false, "isDemo": true, "themes": [], "seasons": []}
```
**Réponse réelle** (abrégée)
```http
HTTP 201
{
  "slug": "exemple-bo",
  "result": "created"
}
```

### Relire la fiche admin

`document` se renvoie **tel quel** à `PUT` (aller-retour sans perte). `media` liste les médias avec leurs `markers`; `jobs` les 10 dernières tâches.

**Requête** (session administrateur, `credentials: 'include'`)
```http
GET /api/admin/programs/exemple-bo
```
**Réponse réelle** (abrégée)
```http
HTTP 200
{
  "slug": "exemple-bo",
  "createdAt": "2026-10-30T13:49:44.716Z",
  "updatedAt": "2026-10-30T13:49:44.716Z",
  "document": {
    "kind": "film",
    "title": "Exemple back-office",
    "titleLines": [],
    "tagline": "Accroche de démonstration",
    "synopsis": "Résumé.",
    "category": "Film original",
    "durationLabel": "1 h 30",
    "year": 2026,
    "language": "Français",
    "rating": null,
    "presenter": null,
    "genres": [
      "Drame"
    ],
    "keywords": [
      "exemple",
      "démonstration"
    ],
    "badges": [],
    "posterUrl": null,
    "heroUrl": null,
    "logoUrl": null,
    "heroVideoUrl": null,
    "trailerUrl": null,
    "imageAlt": null,
    "imageFocus": null,
    "titleStyle": null,
    "isDemo": true,
    "published": false,
    "publishAt": null,
    "unpublishAt": null,
    "announced": false,
    "themes": [],
    "seasons": []
  },
  "media": [],
  "jobs": []
}
```


---

## 3. Envoyer le fichier

### Voie « self » — protocole tus (reprenable)
Test réel effectué aujourd'hui avec un fichier de 1,1 Go (15 min, 1080p) : 22 chunks de 50 Mo, envoi terminé en 2,2 s en local.
```http
POST /uploads
Tus-Resumable: 1.0.0
Upload-Length: 1139730561
Upload-Metadata: filename <b64>,playbackId <b64>,kind <b64>,title <b64>[,programSlug <b64>,demo <b64>]

→ 201  Location: /uploads/<id>

PATCH /uploads/<id>
Tus-Resumable: 1.0.0
Content-Type: application/offset+octet-stream
Upload-Offset: 0
(corps = octets du fichier, par morceaux de 50 Mio conseillés)

→ 204  Upload-Offset: <nouvel offset>      (409 = décalage : refaire un HEAD)
```
La dernière chunk reçue **crée la tâche d'encodage** automatiquement. Client conseillé : `tus-js-client` (`endpoint: <API>/uploads`, `chunkSize: 50 * 1024 * 1024`, cookies inclus).

### Voie « mux » — forme NON exécutée ici (elle créerait une ressource chez Mux)
```http
POST /api/admin/mux/uploads
content-type: application/json

{"playbackId":"mon-film","kind":"film","title":"Mon film"}

→ 201 {"id":"…","playbackId":"mon-film","status":"waiting","uploadUrl":"https://…"}   ← uploadUrl : UNE seule fois

PUT <uploadUrl>        (fichier brut, credentials: 'omit' — adresse de Mux, pas la nôtre)
→ 200/201

GET /api/admin/mux/uploads/<id>      (toutes les 3 à 5 s ; interroger FAIT avancer l'état)
→ status: waiting → processing → ready | failed | canceled
```


---

## 4. Suivre la préparation

### Tâches d'encodage (voie « self »)

`status` ∈ `queued | running | succeeded | failed | canceled` ; `progress` 0–100 ; `step` = étape en français. Interroger toutes les 5 à 10 s. Actions : `POST /api/admin/jobs/:id/cancel`, `POST /api/admin/jobs/:id/retry` (`204`, `409` si impossible).

**Requête** (session administrateur, `credentials: 'include'`)
```http
GET /api/admin/jobs?limit=3
```
**Réponse réelle** (abrégée)
```http
HTTP 200
{
  "jobs": [
    {
      "id": "0c81a93a-d813-44ca-9067-435ab1899de6",
      "playbackId": "le-silence",
      "programSlug": "le-silence",
      "title": "Le Silence",
      "status": "running",
      "step": "encodage 1080p",
      "progress": 17.54,
      "attempts": 1,
      "maxAttempts": 3,
      "lastError": null,
      "createdAt": "2026-10-30T13:44:43.590Z",
      "startedAt": "2026-10-30T13:44:52.453Z",
      "finishedAt": null
    },
    {
      "id": "58880981-cd05-4b77-806e-3fadc84f7373",
      "playbackId": "origin-ident",
      "programSlug": "origin-ident",
      "title": "Ident ORIGIN",
      "status": "succeeded",
      "step": "terminé",
      "progress": 100,
      "attempts": 1,
      "maxAttempts": 3,
      "lastError": null,
      "createdAt": "2026-10-14T10:18:19.736Z",
      "startedAt": "2026-10-14T10:18:20.258Z",
      "finishedAt": "2026-10-14T10:18:45.777Z"
    },
    "… (+1 autres)"
  ]
}
```

### Envois Mux (liste)

Vide tant qu'aucun envoi Mux n'a été fait.

**Requête** (session administrateur, `credentials: 'include'`)
```http
GET /api/admin/mux/uploads?limit=3
```
**Réponse réelle** (abrégée)
```http
HTTP 200
{
  "uploads": []
}
```


---

## 5. Repères de lecture et sous-titres

### Repères intro / générique

Secondes depuis le début. `introStart`/`introEnd` vont ensemble ; `introStart < introEnd ≤ creditsStart` ; `400` sinon. Tout à `null` efface. (Exécuté sur le clip de démonstration puis remis à zéro.)

**Requête** (session administrateur, `credentials: 'include'`)
```http
PUT /api/admin/media/tout-recommencer/markers
content-type: application/json

{"introStart": 1, "introEnd": 4, "creditsStart": 12}
```
**Réponse réelle** (abrégée)
```http
HTTP 204
```

### Sous-titres (forme du contrat, non exécutée)
```http
PUT /files/subtitles/<playbackId>/fr?label=Français&default=true
(corps = fichier WebVTT brut, commence par WEBVTT, ≤ 1 Mo)
→ 204   (400 invalide · 404 média inconnu · 413 trop gros)
DELETE /files/subtitles/<playbackId>/fr → 204
```


---

## 6. Publier, programmer, retirer

### Programmer la sortie (et l'annoncer dans « Prochainement »)

`publishAt` : ISO 8601 **avec décalage horaire** (le back-office affiche le fuseau Europe/Paris par défaut). Seulement pour un brouillon. Une tâche du serveur publie à l'échéance (≤ 30 s de retard, +30 s de cache public).

**Requête** (session administrateur, `credentials: 'include'`)
```http
PUT /api/admin/programs/exemple-bo
content-type: application/json

{"kind": "film", "title": "Exemple back-office", "tagline": "Accroche de démonstration", "synopsis": "Résumé.", "category": "Film original", "durationLabel": "1 h 30", "year": 2026, "language": "Français", "genres": ["Drame"], "keywords": ["exemple", "démonstration"], "published": false, "publishAt": "2026-11-29T13:49:45+00:00", "unpublishAt": null, "announced": true, "isDemo": true, "themes": [], "seasons": []}
```
**Réponse réelle** (abrégée)
```http
HTTP 200
{
  "slug": "exemple-bo",
  "result": "updated"
}
```

### Calendrier éditorial

**Requête** (session administrateur, `credentials: 'include'`)
```http
GET /api/admin/schedule
```
**Réponse réelle** (abrégée)
```http
HTTP 200
{
  "entries": [
    {
      "slug": "exemple-bo",
      "title": "Exemple back-office",
      "kind": "film",
      "event": "release",
      "at": "2026-11-29T13:49:45.000Z",
      "announced": true
    }
  ]
}
```

### Publier tout de suite

Un programme **déjà public** ne peut pas avoir de `publishAt` (refusé en `400`). Pour retirer : renvoyer `published:false`, ou fixer `unpublishAt` pour un retrait programmé.

**Requête** (session administrateur, `credentials: 'include'`)
```http
PUT /api/admin/programs/exemple-bo
content-type: application/json

{"kind": "film", "title": "Exemple back-office", "tagline": "Accroche de démonstration", "synopsis": "Résumé.", "category": "Film original", "durationLabel": "1 h 30", "year": 2026, "language": "Français", "genres": ["Drame"], "keywords": ["exemple", "démonstration"], "published": true, "publishAt": null, "unpublishAt": null, "announced": false, "isDemo": true, "themes": [], "seasons": []}
```
**Réponse réelle** (abrégée)
```http
HTTP 200
{
  "slug": "exemple-bo",
  "result": "updated"
}
```

### Journal des modifications du catalogue

**Requête** (session administrateur, `credentials: 'include'`)
```http
GET /api/admin/audit?limit=3
```
**Réponse réelle** (abrégée)
```http
HTTP 200
{
  "entries": [
    {
      "id": "33",
      "event": "catalog.program.save",
      "by": "audit-admin@origin.test",
      "details": {
        "slug": "exemple-bo"
      },
      "at": "2026-10-30T13:49:45.876Z"
    },
    {
      "id": "32",
      "event": "catalog.program.save",
      "by": "audit-admin@origin.test",
      "details": {
        "slug": "exemple-bo"
      },
      "at": "2026-10-30T13:49:45.771Z"
    },
    "… (+1 autres)"
  ],
  "next": "31"
}
```

### Vérification côté public

`playable: false` tant qu'aucun média n'est prêt.

**Requête** (session administrateur, `credentials: 'include'`)
```http
GET /api/programs/exemple-bo
```
**Réponse réelle** (abrégée)
```http
HTTP 200
{
  "slug": "exemple-bo",
  "kind": "film",
  "title": "Exemple back-office",
  "titleLines": [],
  "tagline": "Accroche de démonstration",
  "synopsis": "Résumé.",
  "category": "Film original",
  "durationLabel": "1 h 30",
  "badges": [],
  "themes": [],
  "images": {
    "poster": null,
    "hero": null,
    "logo": null,
    "alt": null,
    "focus": null
  },
  "heroVideoUrl": null,
  "titleStyle": null,
  "isDemo": true,
  "playable": false,
  "trailerUrl": null,
  "presenter": null,
  "meta": {
    "year": 2026,
    "language": "Français",
    "rating": null,
    "genres": [
      "Drame"
    ]
  },
  "seasons": [
    {
      "number": 1,
      "title": null,
      "episodes": [
        {
          "id": "feature",
          "number": 1,
          "title": "Exemple back-office",
          "synopsis": "Résumé.",
          "durationLabel": "1 h 30",
          "image": null,
          "imageAlt": null,
          "playbackId": "exemple-bo",
          "playable": false
        }
      ]
    }
  ]
}
```


*(Le programme d'exemple a été supprimé après les essais : `DELETE /api/admin/programs/exemple-bo` → `204`.)*


---

## 7. Autres routes d'administration disponibles (non exemplifiées ici)
`PUT/DELETE /api/admin/themes/:slug` · `PUT/DELETE /api/admin/collections/:slug` · `GET/PUT/DELETE /api/admin/creators[/:slug]` et `PUT /api/admin/creators/:slug/contents` · `GET /api/admin/contact` et `POST /api/admin/contact/:id/handled` · `POST /api/admin/invitations` · `PUT /files/images/:slug/:file` · `GET /api/admin/system` · `GET /api/admin/metrics/*` (mesure : périmètre du back-office). Formes dans `docs/API-CONTRACT.md`.

## 8. Manques connus côté API (à demander via `docs/API-REQUESTS.md`)
Liste/recherche des utilisateurs, désactivation d'un compte, liste des invitations : **non disponibles** à ce jour.
