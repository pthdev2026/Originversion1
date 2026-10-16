# Chaîne de PR ORIGIN — ordre de relecture et de fusion (15/10/2026)

Dépôt : `pthdev2026/hero-stream-magic`. Chaque PR cible la branche précédente ; **ne fusionner que dans cet ordre**.
La dernière (`integration/lovable-design-video` → `main`) est la seule qui synchronise Lovable : elle reste votre décision.

| # | Branche | Base | Lien de comparaison | Texte |
|---|---|---|---|---|
| 1 | `front/sync-lovable` | `integration/lovable-design-video` | [ouvrir](https://github.com/pthdev2026/hero-stream-magic/compare/integration/lovable-design-video...front/sync-lovable?expand=1) | `docs/PR-sync-lovable.md` |
| 2 | `front/fiabilite-lecture` | `front/sync-lovable` | [ouvrir](https://github.com/pthdev2026/hero-stream-magic/compare/front/sync-lovable...front/fiabilite-lecture?expand=1) | `docs/PR-fiabilite-lecture.md` |
| 3 | `front/experience` | `front/fiabilite-lecture` | [ouvrir](https://github.com/pthdev2026/hero-stream-magic/compare/front/fiabilite-lecture...front/experience?expand=1) | `docs/PR-experience.md` (+ section ci-dessous) |
| 4 | `front/catalogue-api` | `front/experience` | [ouvrir](https://github.com/pthdev2026/hero-stream-magic/compare/front/experience...front/catalogue-api?expand=1) | ci-dessous |
| 5 | `front/catalogue-accueil` | `front/catalogue-api` | [ouvrir](https://github.com/pthdev2026/hero-stream-magic/compare/front/catalogue-api...front/catalogue-accueil?expand=1) | ci-dessous |
| 6 | `front/catalogue-programme` | `front/catalogue-accueil` | [ouvrir](https://github.com/pthdev2026/hero-stream-magic/compare/front/catalogue-accueil...front/catalogue-programme?expand=1) | ci-dessous |

Astuce : en fusionnant la PR n°1 dans `integration/lovable-design-video`, GitHub propose de retarger la PR n°2 sur cette branche.
Commandes de contrôle avant chaque fusion : `bunx tsc --noEmit`, `bun run test`, `bun run build`.

---

## PR n°3 — complément pour `front/experience`

Depuis la rédaction de `PR-experience.md`, la branche contient aussi les mises à jour Lovable du 14/10 :

- **Fusion de `origin/main`** (39 commits Lovable) : 6 nouveaux visuels de Hero, fond vidéo en boucle, 4 teasers
  (*Le Silence*, *Les Passagers*, *Dernière sortie*, teaser ORIGIN), menu et boutons en verre. Aucun conflit.
- **Rapatriement des 14 fichiers** hébergés par Lovable (`*.asset.json`, adresses `/__l5e/…` inutilisables hors du domaine
  Lovable) dans `src/assets` : 49 Mo → 7 Mo (vidéos H.264 720p, PNG → JPEG q82). Plus aucune référence au stockage Lovable.
- Droits à vérifier avant mise en ligne : `hero-the-chosen`, `hero-reine-guerriere`, `hero-roi-trone` (ressemblent à des
  œuvres existantes). Rapatriés pour que le site fonctionne, non validés.

---

## PR n°4 — `front/catalogue-api` : client typé du catalogue (étape 1)

**Base** : `front/experience`

### Contenu
- `src/lib/catalog-api.ts` : types (`ProgramCard`, `Collection`, `HomeCatalog`, `ProgramDetail`, `SearchResults`,
  `Recommendation`) et requêtes `/api/home`, `/api/programs/:slug`, `/api/search`, `/similar`, `/recommendations`.
- Résultat explicite : `ok` · `not_found` · `error` (`network` / `server` / `invalid` / `not_configured`), délai de 8 s
  (budget réglable), réponse validée. Rien n'est inventé.
- `mediaUrl()` : valeur reçue, préfixée par l'adresse de l'API **seulement** si elle commence par `/images/` ; jamais
  d'adresse construite.

### Vérifications
`tsc` 0 erreur · 32 tests · build OK. **Aucun effet à l'écran** : le client n'est pas encore appelé.

### Limites
Contrat lu : `docs/API-CONTRACT.md` v0.7/v0.8. Toute évolution de l'API reste annoncée par le back-end avant déploiement.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

---

## PR n°5 — `front/catalogue-accueil` : accueil alimenté par l'API (étape 2)

**Base** : `front/catalogue-api`

### Contenu
- `GET /api/home` pilote la Hero, le Top 10, les suggestions, les univers, les 5 rails et les créateurs.
- `src/lib/home-data.ts` traduit l'API dans la forme que les composants consomment déjà : **design inchangé**.
- Loader à budget de 2,5 s : API absente ou lente → données locales `origin-*.ts` (repli, `isDemo`).
- Une section vide garde ses données locales (pas de trou) ; un élément sans aucun visuel est écarté (pas d'image cassée).
- Hero : « Regarder maintenant » devient **« Découvrir »** quand `playable` vaut `false` (la fiche reste accessible).
- Restent locaux (étape suivante) : thématiques, PTH Originals.

### Vérifications
`tsc` 0 erreur · 37 tests · build OK. Navigateur + API locale : 77 images servies par l'API, 0 cassée ; 4 vidéos de la Hero lues ;
les 36 programmes de l'API ont tous une fiche locale (aucun lien mort).

### À valider
- Libellé « Découvrir » (alternative : « Bientôt disponible », désactivé).
- Le Top 10 affiche encore « Gladiator » en n° 1 (donnée de l'API ; droits à traiter).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

---

## PR n°6 — `front/catalogue-programme` : fiche programme alimentée par l'API (étape 3)

**Base** : `front/catalogue-accueil`

### Contenu
- `GET /api/programs/:slug` pilote la fiche : saisons, épisodes, méta, présentateur. Budget 2,5 s puis repli local ;
  un programme inconnu des deux reste « introuvable ».
- Lecture : `playbackId` fourni par l'API, donné tel quel à `/playback` (plus de reconstruction quand il est fourni).
- `playable: false` : bouton principal « Bientôt disponible » (désactivé), l'épisode ne lance plus le lecteur.
- Une fiche sans visuel reste affichable (fond uni) : un film lisible dont l'éditorial n'est pas saisi n'est plus
  « introuvable » (cas de *Tout recommencer*, retiré de la Hero par Lovable).
- Titre de page sans tiret orphelin quand la catégorie est absente.

### Vérifications
`tsc` 0 erreur · 42 tests · build OK. Navigateur : série (9 images servies par l'API, 8 épisodes « Bientôt disponible »),
film lisible (lecture réelle avec l'identifiant de l'API, 1,4 s jusqu'à la première image).

### Limites / demandes au back-end
- *Tout recommencer* n'a ni synopsis, ni catégorie, ni image côté API : saisie éditoriale à faire.
- « Vous pourriez aussi aimer » reste local (étape 4 : `/similar`).
- Un test (`playback-experience`) a échoué une fois sous charge CPU (build en parallèle) puis repassé seul.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
