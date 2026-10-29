# 02 — Charte éditoriale et marque

Vérifié le : 30/10/2026 · Sources : `docs/DESIGN.md` §1, `docs/BRIEF-AGENT-FRONT.md` §2 et §7, `docs/DECISIONS.md` (Identité, Règles), `docs/API-CONTRACT.md`

Cette charte est écrite pour un **agent back-end** : elle dit ce que la marque exige, puis **ce que cela impose au code et aux données**.

## 1. L'âme de la marque
| Élément | Texte / décision |
|---|---|
| Principe produit | « Le contenu raconte l'émotion. L'interface prépare la rencontre. » |
| Signature | « Les histoires méritent plus qu'un écran. » |
| Ambiance | Cinématographique, premium, immersive, minimaliste, légèrement futuriste, émotionnelle |
| Ce que ce n'est pas | Un template SaaS, une marketplace, un clone de Netflix, une interface « religieuse » cliché |
| Voix | **Honnête, directe, respectueuse.** Phrases courtes et élevées, jamais pompeuses, jamais religieuses *pour faire religieux* |
| Foi | Explicitement chrétienne mais accessible : partir du vécu humain avant le spirituel |
| Interdits de ton | Faux témoignages, fausses statistiques, fausse personnalisation, clichés (croix/colombes/mains jointes/ciel divin) |

## 2. Identité visuelle (résumé — la référence complète est `docs/DESIGN.md`)
| Rôle | Décision |
|---|---|
| Fond | Noir profond `#050505`, toujours. Les images portent la couleur |
| Texte principal | Ivoire `#EEEAE4` |
| Signature | **Argent** mat `#C4C7CB` (contours, icônes, états actifs) — jamais chromé caricatural |
| Action principale | **Champagne** `#D6BE8A`, **réservé** au bouton « Regarder » |
| Atmosphère | Bordeaux `#541D20` / rouge désaturé `#853B3B` — lueurs et accents, **jamais dominant**, pas de rouge vif |
| Typographie | Manrope (navigation, titres, boutons) ; Michroma uniquement pour le mot-symbole ORIGIN ; logos-titres des productions conservés tels quels |
| Espace | Vide volontaire, grandes sections, peu de séparateurs |
| Motion | Hero 450–700 ms ; cartes 180–250 ms ; `prefers-reduced-motion` respecté |

*Un agent back-end ne modifie jamais ces choix. Il doit seulement connaître leurs conséquences sur les données (§4).*

## 3. Ordre de la page d'accueil (décision validée)
1 Hero · 2 Top 10 · 3 « Ce qui pourrait vous plaire » · 4 « À découvrir sur ORIGIN ». À valider : 5 PTH Originals · 6 Explorer par format · 7 Explorer par thématique · 8 Reprendre la lecture (**conditionnelle** : seulement si historique réel) · 9 Bientôt sur ORIGIN.
Dans l'API, cet ordre est porté par `collections.home_position` (voir `04-donnees-et-modules.md`) ; le front ne le code pas en dur quand l'API répond.

## 4. Ce que la charte impose au back-end (règles dures)
| Règle de marque | Traduction technique obligatoire |
|---|---|
| Pas de fausse donnée | Tout contenu de démonstration porte `isDemo: true` ; l'API n'invente jamais un chiffre, une durée, une date |
| Pas de fausse lecture | `playable` est calculé depuis les médias **réellement prêts** (`media_assets.status = 'ready'`) ; « Regarder » n'apparaît que s'il vaut `true` |
| Pas de faux « Pour vous » | `GET /api/recommendations` renvoie `personalized: false` sans historique exploitable ; le front n'affiche « Pour vous » que si `true` |
| Recommandation explicable | Chaque proposition porte sa `reason` en français prêt à afficher (« Parce que vous avez regardé « X » ») |
| « Pas encore disponible » ≠ panne | Média absent → `404 not_available` (jamais une 500, jamais un faux contenu) |
| Brouillon invisible | Tout est `published = false` par défaut ; rien n'est public sans décision éditoriale |
| Contenu de marque exclu du catalogue | `kind = 'brand'` (l'ident ORIGIN) n'apparaît jamais dans les listes, la recherche, les collections |
| Droits d'image | Aucun visuel dont les droits ne sont pas établis (personnalités, plans de séries, œuvres signées). Les visuels du catalogue de démonstration sont **provisoires** (voir `10-…` risques) |
| Honnêteté des textes provisoires | Un texte non validé est marqué provisoire (`isProvisional`, « Synopsis provisoire en attente du texte officiel ») — jamais présenté comme définitif |
| Respect de l'utilisateur | Pas de dark patterns ; suppression de compte et export des données disponibles ; mesure de lecture **anonyme** |
| Pas de suivi caché | Aucune adresse IP ni identifiant de compte dans la mesure de lecture |

## 5. L'ident « ORIGIN » (signature sonore et visuelle)
- Courte séquence (~6 s, avec son) jouée **avant la première lecture d'un titre**. La décision est prise **côté serveur** (`ident.show`), le front exécute.
- Politique par défaut `IDENT_POLICY=title` : une fois par titre (film ou série) ; jamais à la reprise, jamais à l'enchaînement automatique. Options : `season`, `always`, `off`.
- Passable après 2 s (`IDENT_SKIPPABLE_AFTER_SECONDS`). Le programme se précharge pendant l'ident. Un échec de l'ident ne bloque jamais la lecture.
- C'est un média comme un autre (`--kind brand`), publié par le pipeline normal ; son volume est normalisé comme les programmes (même cible LUFS).
- Ouvert : version courte (3,5–4 s) — décision éditoriale du propriétaire.

## 6. Données éditoriales : qui décide quoi
| Décision | Propriétaire |
|---|---|
| Titres, synopsis, visuels, ordre des collections, thématiques, créateurs | Équipe éditoriale / propriétaire, via l'API d'administration |
| Direction artistique, composition des écrans, motion | Agent front + propriétaire (jamais l'agent back-end) |
| Règles de recommandation (pondérations) | Agent back-end, validées par le propriétaire (`recommendation/scoring.ts`, constante `WEIGHTS`) |
| Politique de l'ident | Propriétaire (réglage), agent back-end (implémentation) |
