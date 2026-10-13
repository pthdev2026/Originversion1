**Titre** : Expérience ORIGIN : marque, intro, mobile, animations, typographie, page programme

**Base** : `front/fiabilite-lecture` · **Branche** : `front/experience`

> Chaîne des PR : `integration/lovable-design-video` ← `front/sync-lovable` ← `front/fiabilite-lecture` ← **`front/experience`**.
> À fusionner dans cet ordre. Cette PR contient aussi le chantier « config-marque » (aucune PR séparée) et l'intro « Prisme ».

## Contenu

### Marque et configuration (`a893385`)
- `src/lib/brand.ts` : nom, signature, textes SEO et libellés d'erreur en un seul module.
- `src/lib/env.ts` : `VITE_SITE_URL`, `VITE_APP_ENV`, `VITE_ENABLE_INTRO` en plus de l'API et du support ; une valeur absente donne un état dégradé explicite.
- Balises canoniques, `og:url`, `og:image` absolues si `VITE_SITE_URL` est renseignée.
- 404, erreur globale et page de repli serveur en français aux couleurs ORIGIN.

### Intro « Prisme » (`9878a02`, `3b56599`)
- Version code de la signature d'ouverture, jouée une fois par session, passable, absente en mouvement réduit.
- Respecte `VITE_ENABLE_INTRO`. Plus de flash pour qui l'a déjà vue.

### Base, mobile (`95dcc0e`, `6cb8cc1`)
- Manrope partout (Montserrat retiré), un seul `<main>`, deux images de 1,2 Mo ramenées à ~140 Ko.
- Zones tactiles ≥ 40 px par zone invisible étendue, aucun texte sous 10 px.
- Page programme sous 900 px : la liste d'épisodes n'est plus recouverte par « Vous pourriez aussi aimer ».

### Animations (`8a0558e`)
- Texte de la Hero qui réapparaît à chaque programme, apparition douce des sections au défilement (une fois), fondu natif entre pages.
- Survol des affiches ramené à ~250 ms. Mouvement réduit respecté partout.

### Typographie (`bf89117`)
- Polices auto-hébergées (`@fontsource`, latin) : plus aucune requête vers Google (RGPD). 12 fichiers, 244 Ko.
- Rendu `antialiased`, titres équilibrés.

### Page programme (`75892b6`)
- Saison active fiable dans la navigation par saison.
- Légende de « Vous pourriez aussi aimer » sans promesse de personnalisation.

## Vérifications

- `tsc --noEmit` : 0 erreur · `bun run test` : 26 / 26 · `bun run build` : OK
- Navigateur (API locale) : lecture, intro, 404, navigation entre pages, mobile 375 px (pas de débordement, zones tactiles), console sans erreur d'hydratation.
- Dépendances : 6 paquets `@fontsource/*` ajoutés via `bun add` (`bun.lock` à jour).

## Limites / à valider

- **Rendu visuel à valider par un humain** : le dosage des animations et l'aspect sur grand écran n'ont été vérifiés que par mesures.
- Non testé sur iPhone / Safari réel (plein écran, lecture native, transition de vue).
- La transition de vue entre pages dépend du navigateur (ignorée sinon, sans casse).
- Collection « Drama » conservée (le test de Lovable l'exige) : à confirmer, sinon « Drame ».
- « Marquer comme vu » (Lovable) simule un historique en session : décision en attente.
- Formatage Prettier global non traité (850 écarts hérités, aucun effet de comportement).
- Photos de personnalités et Top 10 de démonstration : volontairement non touchés (droits à traiter plus tard).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
