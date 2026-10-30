# ORIGIN — Routes à connecter côté front, avec exemples RÉELS (30/10/2026)

Pour l'**agent front**. Chaque exemple ci-dessous a été **exécuté contre l'API locale** pendant la rédaction (compte de test jetable), puis abrégé : listes tronquées à 2 éléments, jetons de lecture masqués. La référence normative reste `docs/API-CONTRACT.md` (v1.9). Brief d'ordre de travail : `docs/BRIEF-AGENT-FRONT-BRANCHEMENT.md`.

Règles communes : `fetch(url, { credentials: 'include' })` sur toute route `/api/*` ; en développement, le front et l'API doivent être joints par **`localhost`** (pas `127.0.0.1`) pour que le cookie de session soit envoyé ; erreurs `{error, message, requestId}` ; sur `429` attendre `Retry-After`.

**Ce qui est déjà branché dans le front aujourd'hui :** uniquement `GET /api/programs/:id/playback` (champs lus : `manifestUrl`, `posterUrl`, `durationSeconds`, `renditions`, `expiresAt`). **Champs déjà renvoyés mais ignorés :** `ident`, `resume`, `subtitles`, `next`, `markers`, `content`.

---

## A. Visiteur (sans compte)

### Accueil complet en un appel

**Requête**
```http
GET /api/home
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "collections": [
    {
      "slug": "hero",
      "title": "À l’affiche",
      "layout": "hero",
      "badge": null,
      "viewAllUrl": null,
      "items": [
        {
          "slug": "le-silence",
          "kind": "film",
          "title": "Le Silence",
          "titleLines": [
            "LE",
            "SILENCE"
          ],
          "tagline": "Quand la foule se tait, une voix répond.",
          "synopsis": "Le teaser de Le Silence. Synopsis provisoire en attente du texte officiel.",
          "category": "Bande-annonce",
          "durationLabel": null,
          "badges": [],
          "themes": [],
          "images": {
            "poster": "/images/le-silence/le-silence-poster.jpg",
            "hero": "/images/le-silence/le-silence-poster.jpg",
            "logo": null,
            "alt": "Une silhouette seule au bout d’une scène d’arène, face à une foule dense, sous d’immenses faisceaux de lumi…",
            "focus": null
          },
          "heroVideoUrl": "/images/le-silence/le-silence-teaser.mp4",
          "titleStyle": null,
          "isDemo": true,
          "playable": false,
          "rank": 1
        },
        {
          "slug": "les-passagers",
          "kind": "film",
          "title": "Les Passagers",
          "titleLines": [
            "LES",
            "PASSAGERS"
          ],
          "tagline": "Chacun porte son histoire à bord.",
          "synopsis": "Le teaser de Les Passagers. Synopsis provisoire en attente du texte officiel.",
          "category": "Bande-annonce",
          "durationLabel": null,
          "badges": [],
          "themes": [],
          "images": {
            "poster": "/images/les-passagers/les-passagers-poster.jpg",
            "hero": "/images/les-passagers/les-passagers-poster.jpg",
            "logo": null,
            "alt": "Image extraite du teaser Les Passagers.",
            "focus": null
          },
          "heroVideoUrl": "/images/les-passagers/les-passagers-teaser.mp4",
          "titleStyle": null,
          "isDemo": true,
          "playable": false,
          "rank": 2
        },
        "… (+8 autres)"
      ]
    },
    {
      "slug": "top-10",
      "title": "Top 10 — Les histoires qui font parler",
      "layout": "ranked",
      "badge": null,
      "viewAllUrl": null,
      "items": [
        {
          "slug": "gladiator",
          "kind": "film",
          "title": "Gladiator",
          "titleLines": [],
          "tagline": null,
          "synopsis": null,
          "category": "Film original",
          "durationLabel": null,
          "badges": [],
          "themes": [],
          "images": {
            "poster": "/images/gladiator/top-gladiator.jpg",
            "hero": null,
            "logo": null,
            "alt": "Un gladiateur dans une arène antique.",
            "focus": null
          },
          "heroVideoUrl": null,
          "titleStyle": null,
          "isDemo": true,
          "playable": false,
          "rank": 1
        },
        {
          "slug": "damnes",
          "kind": "serie",
          "title": "Damnés du Namibao",
          "titleLines": [],
          "tagline": null,
          "synopsis": null,
          "category": "Série documentaire",
          "durationLabel": null,
          "badges": [],
          "themes": [],
          "images": {
            "poster": "/images/damnes/top-damnes.jpg",
            "hero": null,
            "logo": null,
            "alt": "Un personnage fantastique devant une lune et un ciel rouge.",
            "focus": null
          },
          "heroVideoUrl": null,
          "titleStyle": null,
          "isDemo": true,
          "playable": false,
          "rank": 2
        },
        "… (+12 autres)"
      ]
    },
    "… (+8 autres)"
  ],
  "themes": [
    {
      "slug": "foi",
      "title": "Foi & Spiritualité",
      "image": "/images/le-trone/hero-roi-trone.jpg",
      "programCount": 4
    },
    {
      "slug": "couple",
      "title": "Couple",
      "image": "/images/un-nouveau-matin/hero-jeune-homme.jpeg",
      "programCount": 1
    },
    "… (+10 autres)"
  ],
  "creators": [
    {
      "slug": "yvan-castanou",
      "name": "Apôtre Yvan Castanou",
      "alias": null,
      "domain": null,
      "tagline": null,
      "accent": null,
      "showTitle": null,
      "intro": "Présentation éditoriale à venir — contenu provisoire.",
      "themes": [
        "Prédication",
        "Foi"
      ],
      "ambience": "ember",
      "image": "/images/creators-yvan-castanou/yvan-castanou.jpeg",
      "imageAlt": "Apôtre Yvan Castanou souriant sur scène, micro en main.",
      "imageFocus": "50% 30%",
      "isProvisional": true
    },
    {
      "slug": "benny-hinn",
      "name": "Benny Hinn",
      "alias": null,
      "domain": null,
      "tagline": null,
      "accent": null,
      "showTitle": null,
      "intro": "Présentation éditoriale à venir — contenu provisoire.",
      "themes": [
        "Enseignement",
        "Foi"
      ],
      "ambience": "night",
      "image": "/images/creators-benny-hinn/benny-hinn.jpeg",
      "imageAlt": "Portrait de Benny Hinn en costume sombre.",
      "imageFocus": "50% 25%",
      "isProvisional": true
    },
    "… (+3 autres)"
  ]
}
```

### Fiche programme

**Requête**
```http
GET /api/programs/tout-recommencer
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "slug": "tout-recommencer",
  "kind": "film",
  "title": "Tout recommencer",
  "titleLines": [],
  "tagline": null,
  "synopsis": null,
  "category": null,
  "durationLabel": null,
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
  "playable": true,
  "trailerUrl": null,
  "presenter": null,
  "meta": {
    "year": null,
    "language": null,
    "rating": null,
    "genres": []
  },
  "seasons": [
    {
      "number": 1,
      "title": null,
      "episodes": [
        {
          "id": "feature",
          "number": 1,
          "title": "Tout recommencer",
          "synopsis": null,
          "durationLabel": null,
          "image": null,
          "imageAlt": null,
          "playbackId": "tout-recommencer",
          "playable": true
        }
      ]
    }
  ]
}
```

### Recherche (avec correction de faute)

`correctedQuery` non nul = afficher « Résultats pour … ».

**Requête**
```http
GET /api/search?q=silense
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "query": "silense",
  "correctedQuery": "silence",
  "programs": [
    {
      "slug": "le-silence",
      "kind": "film",
      "title": "Le Silence",
      "titleLines": [
        "LE",
        "SILENCE"
      ],
      "tagline": "Quand la foule se tait, une voix répond.",
      "synopsis": "Le teaser de Le Silence. Synopsis provisoire en attente du texte officiel.",
      "category": "Bande-annonce",
      "durationLabel": null,
      "badges": [],
      "themes": [],
      "images": {
        "poster": "/images/le-silence/le-silence-poster.jpg",
        "hero": "/images/le-silence/le-silence-poster.jpg",
        "logo": null,
        "alt": "Une silhouette seule au bout d’une scène d’arène, face à une foule dense, sous d’immenses faisceaux de lumi…",
        "focus": null
      },
      "heroVideoUrl": "/images/le-silence/le-silence-teaser.mp4",
      "titleStyle": null,
      "isDemo": true,
      "playable": false
    },
    {
      "slug": "temoignage-silence",
      "kind": "documentaire",
      "title": "Le poids du silence",
      "titleLines": [
        "LE POIDS",
        "DU SILENCE"
      ],
      "tagline": null,
      "synopsis": null,
      "category": "Témoignage",
      "durationLabel": "28 min",
      "badges": [],
      "themes": [],
      "images": {
        "poster": "/images/temoignage-silence/temoignage-silence.jpg",
        "hero": null,
        "logo": null,
        "alt": "Un homme la main sur la bouche, un visage sombre qui se dessine derrière lui.",
        "focus": null
      },
      "heroVideoUrl": null,
      "titleStyle": "italic-serif",
      "isDemo": true,
      "playable": false
    },
    "… (+1 autres)"
  ],
  "creators": []
}
```

### Suggestions à la frappe

**Requête**
```http
GET /api/search/suggestions?q=sil
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "query": "sil",
  "suggestions": [
    {
      "type": "program",
      "slug": "le-silence",
      "label": "Le Silence"
    },
    {
      "type": "program",
      "slug": "temoignage-silence",
      "label": "Le poids du silence"
    },
    "… (+1 autres)"
  ]
}
```

### Prochainement

**Requête**
```http
GET /api/coming-soon
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "programs": []
}
```

### Créateurs

**Requête**
```http
GET /api/creators
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "creators": [
    {
      "slug": "yvan-castanou",
      "name": "Apôtre Yvan Castanou",
      "alias": null,
      "domain": null,
      "tagline": null,
      "accent": null,
      "showTitle": null,
      "intro": "Présentation éditoriale à venir — contenu provisoire.",
      "themes": [
        "Prédication",
        "Foi"
      ],
      "ambience": "ember",
      "image": "/images/creators-yvan-castanou/yvan-castanou.jpeg",
      "imageAlt": "Apôtre Yvan Castanou souriant sur scène, micro en main.",
      "imageFocus": "50% 30%",
      "isProvisional": true
    },
    {
      "slug": "benny-hinn",
      "name": "Benny Hinn",
      "alias": null,
      "domain": null,
      "tagline": null,
      "accent": null,
      "showTitle": null,
      "intro": "Présentation éditoriale à venir — contenu provisoire.",
      "themes": [
        "Enseignement",
        "Foi"
      ],
      "ambience": "night",
      "image": "/images/creators-benny-hinn/benny-hinn.jpeg",
      "imageAlt": "Portrait de Benny Hinn en costume sombre.",
      "imageFocus": "50% 25%",
      "isProvisional": true
    },
    "… (+3 autres)"
  ]
}
```

### Similaires

**Requête**
```http
GET /api/programs/tout-recommencer/similar
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "items": []
}
```

### Recommandations (anonyme : tendances)

**Requête**
```http
GET /api/recommendations
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "personalized": false,
  "items": [
    {
      "program": {
        "slug": "gladiator",
        "kind": "film",
        "title": "Gladiator",
        "titleLines": [],
        "tagline": null,
        "synopsis": null,
        "category": "Film original",
        "durationLabel": null,
        "badges": [],
        "themes": [],
        "images": {
          "poster": "/images/gladiator/top-gladiator.jpg",
          "hero": null,
          "logo": null,
          "alt": "Un gladiateur dans une arène antique.",
          "focus": null
        },
        "heroVideoUrl": null,
        "titleStyle": null,
        "isDemo": true,
        "playable": false
      },
      "reason": "Sélection ORIGIN"
    },
    {
      "program": {
        "slug": "damnes",
        "kind": "serie",
        "title": "Damnés du Namibao",
        "titleLines": [],
        "tagline": null,
        "synopsis": null,
        "category": "Série documentaire",
        "durationLabel": null,
        "badges": [],
        "themes": [],
        "images": {
          "poster": "/images/damnes/top-damnes.jpg",
          "hero": null,
          "logo": null,
          "alt": "Un personnage fantastique devant une lune et un ciel rouge.",
          "focus": null
        },
        "heroVideoUrl": null,
        "titleStyle": null,
        "isDemo": true,
        "playable": false
      },
      "reason": "Sélection ORIGIN"
    },
    "… (+8 autres)"
  ]
}
```

### Bouton « Lecture » (anonyme)

**Requête**
```http
GET /api/programs/tout-recommencer/play-target
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "state": "start",
  "playbackId": "tout-recommencer",
  "episode": null,
  "resumeSeconds": 0
}
```

### Lecture — session complète

**À lire en entier** : `ident` (jouer avant le film si `show`), `resume`, `markers`, `next`, `subtitles`, `content`. Paramètres facultatifs : `identSeen=1`, `autoplay=1`.

**Requête**
```http
GET /api/programs/tout-recommencer/playback
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "programId": "tout-recommencer",
  "status": "ready",
  "manifestUrl": "http://localhost:4000/media/<jeton>/tout-recommencer/master.m3u8",
  "posterUrl": "http://localhost:4000/media/<jeton>/tout-recommencer/poster.jpg",
  "durationSeconds": 15.083,
  "renditions": [
    {
      "name": "1080p",
      "height": 1080,
      "videoKbps": 5000
    },
    {
      "name": "720p",
      "height": 720,
      "videoKbps": 2800
    },
    "… (+2 autres)"
  ],
  "expiresAt": "2026-10-30T17:48:46.000Z",
  "subtitles": [],
  "content": {
    "programSlug": "tout-recommencer",
    "title": "Tout recommencer",
    "kind": "film",
    "episode": null
  },
  "resume": null,
  "markers": {
    "introStart": null,
    "introEnd": null,
    "creditsStart": null
  },
  "next": null,
  "ident": {
    "show": true,
    "reason": "first_view",
    "manifestUrl": "http://localhost:4000/media/<jeton>/origin-ident/master.m3u8",
    "durationSeconds": 6.037,
    "skippableAfterSeconds": 2
  }
}
```

### Contact (champ caché `website` toujours vide)

**Requête**
```http
POST /api/contact
content-type: application/json

{"name": "Test Audit", "email": "audit@origin.test", "topic": "general", "message": "Message de test pour la documentation.", "website": ""}
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 202
{
  "message": "Merci, votre message a bien été envoyé. Nous vous répondrons dès que possible."
}
```


---

## B. Compte

### Inscription

Le cookie de session est posé par la réponse (`Set-Cookie`, httpOnly) : le front ne le lit jamais.

**Requête**
```http
POST /api/auth/register
content-type: application/json

{"email": "compte@exemple.fr", "password": "<mot de passe de 10 caractères minimum>", "displayName": "Compte test"}
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 201
{
  "user": {
    "id": "8d00e71c-19cc-4488-9c2b-eef4d8a54713",
    "email": "compte@exemple.fr",
    "displayName": "Compte test",
    "role": "viewer",
    "emailVerified": false,
    "twoFactorEnabled": false,
    "createdAt": "2026-10-30T13:48:46.287Z",
    "locale": "fr",
    "avatar": null
  }
}
```

### Utilisateur courant

**Requête**
```http
GET /api/me
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "user": {
    "id": "8d00e71c-19cc-4488-9c2b-eef4d8a54713",
    "email": "compte@exemple.fr",
    "displayName": "Compte test",
    "role": "viewer",
    "emailVerified": false,
    "twoFactorEnabled": false,
    "createdAt": "2026-10-30T13:48:46.287Z",
    "locale": "fr",
    "avatar": null
  }
}
```

### Modifier le profil

**Requête**
```http
PATCH /api/me
content-type: application/json

{"displayName": "Nom affiché", "locale": "fr"}
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "user": {
    "id": "8d00e71c-19cc-4488-9c2b-eef4d8a54713",
    "email": "compte@exemple.fr",
    "displayName": "Nom affiché",
    "role": "viewer",
    "emailVerified": false,
    "twoFactorEnabled": false,
    "createdAt": "2026-10-30T13:48:46.287Z",
    "locale": "fr",
    "avatar": null
  }
}
```

### Préférences — lecture

**Requête**
```http
GET /api/me/preferences
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "preferences": {
    "previews": true,
    "nextEpisode": true,
    "quality": "auto",
    "subtitles": "fr",
    "subtitleSize": "medium",
    "newEpisodes": true,
    "news": false,
    "emails": true,
    "reduceMotion": false,
    "history": true
  }
}
```

### Préférences — enregistrement partiel

**Requête**
```http
PUT /api/me/preferences
content-type: application/json

{"quality": "eco", "nextEpisode": true}
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "preferences": {
    "previews": true,
    "nextEpisode": true,
    "quality": "eco",
    "subtitles": "fr",
    "subtitleSize": "medium",
    "newEpisodes": true,
    "news": false,
    "emails": true,
    "reduceMotion": false,
    "history": true
  }
}
```

### Thématiques préférées — liste de départ

**Requête**
```http
GET /api/themes
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "themes": [
    {
      "slug": "foi",
      "title": "Foi & Spiritualité",
      "image": "/images/le-trone/hero-roi-trone.jpg",
      "programCount": 4
    },
    {
      "slug": "couple",
      "title": "Couple",
      "image": "/images/un-nouveau-matin/hero-jeune-homme.jpeg",
      "programCount": 1
    },
    "… (+10 autres)"
  ]
}
```

### Thématiques préférées — enregistrement

**Requête**
```http
PUT /api/me/themes
content-type: application/json

{"themes": []}
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "themes": []
}
```

### Avatar prédéfini

**Requête**
```http
PUT /api/me/avatar
content-type: application/json

{"kind": "preset", "preset": 3}
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "avatar": {
    "kind": "preset",
    "preset": 3
  }
}
```

### Appareils connectés

**Requête**
```http
GET /api/me/sessions
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "sessions": [
    {
      "id": "726ba383-676a-4c67-a31b-430c141665b6",
      "device": null,
      "current": true,
      "createdAt": "2026-10-30T13:48:46.415Z",
      "lastSeenAt": "2026-10-30T13:48:46.415Z"
    }
  ]
}
```

### « Ma liste » — ajouter

**Requête**
```http
PUT /api/me/list/tout-recommencer
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 204
```

### « Ma liste » — lire

**Requête**
```http
GET /api/me/list
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "items": [
    {
      "slug": "tout-recommencer",
      "addedAt": "2026-10-30T13:48:46.629Z",
      "program": {
        "slug": "tout-recommencer",
        "kind": "film",
        "title": "Tout recommencer",
        "titleLines": [],
        "tagline": null,
        "synopsis": null,
        "category": null,
        "durationLabel": null,
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
        "playable": true
      }
    }
  ]
}
```

### Reprise — enregistrer la position (toutes les ~10–15 s)

**Requête**
```http
PUT /api/me/progress/tout-recommencer
content-type: application/json

{"positionSeconds": 7.5, "durationSeconds": 15.083, "sentAt": 1793380000000}
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "playbackId": "tout-recommencer",
  "positionSeconds": 7.5,
  "durationSeconds": 15.1,
  "completed": false,
  "updatedAt": "2026-10-30T13:48:46.663Z"
}
```

### Reprise — lire

**Requête**
```http
GET /api/me/progress/tout-recommencer
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "playbackId": "tout-recommencer",
  "positionSeconds": 7.5,
  "durationSeconds": 15.1,
  "completed": false,
  "updatedAt": "2026-10-30T13:48:46.663Z"
}
```

### Continuer à regarder

**Requête**
```http
GET /api/me/continue-watching
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "items": []
}
```

### Bouton « Lecture » (connecté, film commencé)

`state: "resume"` : afficher « Reprendre ».

**Requête**
```http
GET /api/programs/tout-recommencer/play-target
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "state": "resume",
  "playbackId": "tout-recommencer",
  "episode": null,
  "resumeSeconds": 7.5
}
```

### Lecture — avec reprise

Remarquez `resume.positionSeconds` : démarrer le lecteur à cet instant.

**Requête**
```http
GET /api/programs/tout-recommencer/playback
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "programId": "tout-recommencer",
  "status": "ready",
  "manifestUrl": "http://localhost:4000/media/<jeton>/tout-recommencer/master.m3u8",
  "posterUrl": "http://localhost:4000/media/<jeton>/tout-recommencer/poster.jpg",
  "durationSeconds": 15.083,
  "renditions": [
    {
      "name": "1080p",
      "height": 1080,
      "videoKbps": 5000
    },
    {
      "name": "720p",
      "height": 720,
      "videoKbps": 2800
    },
    "… (+2 autres)"
  ],
  "expiresAt": "2026-10-30T17:48:46.000Z",
  "subtitles": [],
  "content": {
    "programSlug": "tout-recommencer",
    "title": "Tout recommencer",
    "kind": "film",
    "episode": null
  },
  "resume": {
    "positionSeconds": 7.5
  },
  "markers": {
    "introStart": null,
    "introEnd": null,
    "creditsStart": null
  },
  "next": null,
  "ident": {
    "show": false,
    "reason": "already_seen",
    "manifestUrl": null,
    "durationSeconds": null,
    "skippableAfterSeconds": null
  }
}
```

### Recherches récentes — mémoriser (à la validation)

**Requête**
```http
POST /api/me/searches
content-type: application/json

{"q": "silence"}
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 204
```

### Recherches récentes — lire

**Requête**
```http
GET /api/me/searches
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "searches": [
    "silence"
  ]
}
```

### Export des données (RGPD)

**Requête**
```http
GET /api/me/export
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 200
{
  "generatedAt": "2026-10-30T13:48:47.016Z",
  "account": {
    "id": "8d00e71c-19cc-4488-9c2b-eef4d8a54713",
    "email": "compte@exemple.fr",
    "displayName": "Nom affiché",
    "role": "viewer",
    "emailVerified": false,
    "twoFactorEnabled": false,
    "locale": "fr",
    "avatarKind": "preset",
    "createdAt": "2026-10-30T13:48:46.287Z",
    "lastLoginAt": null
  },
  "watchProgress": [
    {
      "playbackId": "tout-recommencer",
      "programSlug": "tout-recommencer",
      "positionSeconds": 7.5,
      "durationSeconds": 15.1,
      "completed": false,
      "updatedAt": "2026-10-30T13:48:46.663Z"
    }
  ],
  "myList": [
    {
      "slug": "tout-recommencer",
      "addedAt": "2026-10-30T13:48:46.629Z"
    }
  ],
  "preferences": {
    "previews": true,
    "nextEpisode": true,
    "quality": "eco",
    "subtitles": "fr",
    "subtitleSize": "medium",
    "newEpisodes": true,
    "news": false,
    "emails": true,
    "reduceMotion": false,
    "history": true
  },
  "favoriteThemes": [],
  "recentSearches": [
    "silence"
  ],
  "activeSessions": 1,
  "securityEvents": [
    {
      "event": "register",
      "at": "2026-10-30T13:48:46.342Z"
    }
  ]
}
```

### Déconnexion

**Requête**
```http
POST /api/auth/logout
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 204
```

### Utilisateur courant après déconnexion

`401` = visiteur.

**Requête**
```http
GET /api/me
```
**Réponse réelle** (abrégée : listes tronquées, jetons masqués)
```http
HTTP 401
{
  "error": "unauthorized",
  "message": "Connexion requise.",
  "requestId": "6ac8ec6f-182e-4fd8-a523-09c4e63deb94"
}
```


---

## C. Formes non exécutées ici (leur déclenchement exige un e-mail ou un secret)
Tirées du contrat v1.9 ; chacune a ses tests automatiques.

| Écran | Requête | Réponse |
|---|---|---|
| Mot de passe oublié | `POST /api/auth/password/forgot` `{"email":"…"}` | `202 {"message":"Si un compte existe…"}` (toujours, quelle que soit l'adresse) |
| Réinitialisation (lien `/reinitialiser?token=`) | `POST /api/auth/password/reset` `{"token":"…","password":"…"}` | `200` ou `400` (lien invalide/expiré) |
| Vérification d'e-mail (`/verifier-email?token=`) | `POST /api/auth/email/verify` `{"token":"…"}` | `200 {"message":"Adresse e-mail confirmée."}` |
| Connexion avec 2FA | `POST /api/auth/login` `{"email","password","code":"123456"}` | sans `code` : `401` d'erreur `two_factor_required` (afficher le champ) |
| Activer la 2FA | `POST /api/me/2fa/setup` puis `POST /api/me/2fa/enable` | secret + URI à afficher une fois, puis codes de secours (une fois) |
| Changer d'adresse | `POST /api/me/email/change` `{"newEmail","password"}` puis `POST /api/me/email/change/confirm` `{"code":"123456"}` | `202` puis `200` |
| Supprimer le compte | `POST /api/me/delete` `{"password":"…"}` | `204` — **le mot de passe est exigé** |

## D. Ce que le front ne doit PAS simuler (absent côté API)
Connexion Google/Apple · choix de langue audio · direct · profils multiples · envoi de notifications · bandes-annonces gérées (seulement `trailerUrl` dans la fiche).


## Classement complet, sous-titres et phares des thématiques (v1.16, 31/10/2026)
**À brancher par l'agent front** (rien n'est modifié côté front par le back-end).

1. `/classement` : remplacer `fullRanking` (démo) par `GET /api/ranking?limit=50&offset=0` → `{total, items:[{rank, program: ProgramCard}]}`. Les 14 premiers rangs sont ceux du Top 10 de l'accueil (collection `top-10`), la suite suit l'audience réelle puis le titre. Pagination : `offset += limit` tant que `offset < total`. Exemple réel :
```json
{
  "total": 38,
  "items": [
    {
      "rank": 1,
      "program": {
        "slug": "gladiator",
        "kind": "film",
        "title": "Gladiator",
        "category": "Film original",
        "images": {
          "poster": "/images/gladiator/top-gladiator.jpg",
          "hero": null,
          "logo": null,
          "alt": "Un gladiateur dans une arène antique.",
          "focus": null
        },
        "playable": false
      }
    },
    {
      "rank": 2,
      "program": {
        "slug": "damnes",
        "kind": "serie",
        "title": "Damnés du Namibao",
        "category": "Série documentaire",
        "images": {
          "poster": "/images/damnes/top-damnes.jpg",
          "hero": null,
          "logo": null,
          "alt": "Un personnage fantastique devant une lune et un ciel rouge.",
          "focus": null
        },
        "playable": false
      }
    }
  ]
}
```
2. Thématiques : `themeShowcase` (sous-titre + phare codés en dur) peut être supprimé. `GET /api/home` (`themes[]`) et `GET /api/themes` renvoient maintenant `subtitle` (string|null) et `featuredSlug` (string|null) ; `themes[].programs` et `GET /api/themes/:slug` placent déjà le phare en premier. Les valeurs actuelles sont celles du front (`seed/theme-editorial.json`, provisoires). Deux phares n'existent pas dans le catalogue serveur (`apres-la-tempete`, `retrouver-sa-voix`) : `featuredSlug` vaut alors `null` et l'écran doit se rabattre sur le premier programme. La thématique virtuelle « Tendances » n'existe pas côté serveur : la garder côté front (ou la composer avec `GET /api/trending`).
3. Recherche : une faute dans un mot incomplet est maintenant corrigée (`passagr` → `correctedQuery: "passagers"`).
