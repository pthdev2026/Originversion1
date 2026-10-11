# Intro ORIGIN « Prisme » — pack de production (GPT → Minimax)

Objectif : une signature d'ouverture de ~3,5 s. Quatre colonnes de verre montrent les univers d'ORIGIN
(film, interview, drame, suspense), convergent dans une lumière argentée, puis le mot ORIGIN se forme.

## 0. Chaîne de production

```
Catalogue ORIGIN (4 images de référence)
        │
        ▼
  GPT (images)  ──►  K1 : image de départ (4 colonnes de verre)
                     K2 : image d'arrivée (noir + lumière argentée)
        │
        ▼
  Minimax (vidéo)  ──►  clip de 6 s : les colonnes convergent dans la lumière
        │
        ▼
  ORIGIN (code)  ──►  découpe à ~3,5 s, mot « ORIGIN » ajouté en code, son plus tard
```

**Règle d'or : aucune IA ne génère du texte.** Le mot ORIGIN est ajouté par nous, en code, avec la police du site.
Les générateurs déforment les lettres ; on ne leur demande donc jamais d'en écrire.

## 1. Fichiers de référence (à téléverser dans GPT)

Dossier : `ORIGIN-plateforme/assets/intro/references/`

| Ordre | Fichier | Univers | Rôle |
|---|---|---|---|
| 1 | `01-film.jpg` | Film | Colonne 1 (gauche), tons bleu-vert |
| 2 | `02-interview.jpg` | Interview | Colonne 2, studio chaud, blazer bordeaux |
| 3 | `03-drame.jpg` | Drame | Colonne 3, golden hour sur la côte |
| 4 | `04-suspense.jpg` | Suspense | Colonne 4, porte entrouverte, ligne de lumière |
| (alt.) | `04b-suspense-alternative.jpg` | Suspense | Rue sous la pluie, à utiliser si la porte rend mal |

Téléverser les 4 fichiers **dans cet ordre**, en un seul message.

## 2. Étape GPT — images

Réglages : format **16:9** (ou le plus grand format large proposé), qualité maximale, une image à la fois.

### K1 — image de départ (téléverser les 4 références, puis coller)

```
Create a single cinematic widescreen image, 16:9 aspect ratio, the largest 16:9 size available.

The frame is divided into four equal-width tall vertical panels of dark polished glass, placed side by side so that together they fill the whole frame edge to edge. Seen straight on, perfectly vertical, separated from each other by a very thin crisp silver edge highlight (about 2 pixels) and a barely visible dark gap.

Inside each panel a different cinematic photograph is visible, as if seen through the glass. Use the four uploaded reference images in the order they were uploaded, from left to right:
- Panel 1 = image 1: a man in front of a city skyline at dusk, teal and blue tones.
- Panel 2 = image 2: a woman in a burgundy blazer speaking at a podcast microphone in a warm studio.
- Panel 3 = image 3: a woman and a man at sunset on a rocky coast, golden light.
- Panel 4 = image 4: a dark corridor with a door ajar and a thin line of white light.
Keep each photograph faithful to its reference (subject, mood, color grade), recomposed as a vertical crop with the main subject centered in its panel.

Glass treatment: subtle vertical refraction streaks, soft specular reflections of silver-white light sliding down the glass, very slight chromatic aberration at the panel edges, a few fine dust particles in the light.

Lighting and palette: cool silver light (#C4C7CB) from above, deep blacks (#050505), and only one faint deep burgundy (#541D20) reflection on the far right edge. Dark, premium, restrained, cinematic, high contrast. Photorealistic, 35mm film look, shallow depth of field.

Strictly no text, no letters, no numbers, no logos, no watermark, no interface elements, no frame or border around the whole image, no additional people.
```

Corrections fréquentes (à coller en réponse si besoin) :

| Problème | Message |
|---|---|
| Colonnes inégales | `Make the four panels exactly equal in width, each exactly 25% of the frame.` |
| Du texte apparaît | `Remove all text and letters completely. The image must contain no writing at all.` |
| Trop de rouge | `Reduce the red and burgundy to a very faint tint on the far right edge only.` |
| Visages déformés | `Keep the faces exactly as in the references, only crop and recompose.` |
| Rendu trop « jeu vidéo » | `More photographic, less CGI: natural grain, realistic glass, subtle reflections.` |

### K2 — image d'arrivée (aucun téléversement)

```
Create a cinematic widescreen image, 16:9 aspect ratio, the largest 16:9 size available.

An almost completely black frame (#050505). In the exact center, a soft elongated horizontal bloom of cool silver-white light, like an anamorphic lens flare, about 40% of the frame width and very thin vertically, fading smoothly into the darkness. At the far left and far right edges, extremely faint vertical glass reflections, barely visible. A very subtle deep burgundy (#541D20) haze low in the center of the frame, barely perceptible.

The center and the area around the light must remain clean, dark and empty so that a title can be added later. Elegant, minimal, premium, cinematic, high contrast.

Strictly no text, no letters, no logos, no objects, no people, no watermark.
```

### Contrôle avant d'envoyer à Minimax

- [ ] K1 : quatre colonnes de **même largeur**, bords nets, **aucun texte**.
- [ ] K1 : les quatre univers sont reconnaissables (ville, studio, côte, couloir).
- [ ] K1 : pas de rouge dominant.
- [ ] K2 : centre propre et sombre, **aucun texte**.
- [ ] Les deux images ont le **même format** 16:9.

Enregistrer : `ORIGIN-plateforme/assets/intro/gpt-output/K1.png` et `K2.png`.

## 3. Étape Minimax — vidéo

Réglages conseillés : mode **image → vidéo** (« image-to-video »), modèle Hailuo le plus récent,
**1080p**, **6 s**. Désactiver l'optimisation automatique du prompt si l'option existe.
Si l'outil accepte une **image de fin** (« last frame »), mettre `K1` en début et `K2` en fin ;
sinon n'envoyer que `K1`.

### M1 — prompt principal (image de début = K1, image de fin = K2)

```
Four tall vertical glass panels, each showing a different cinematic scene, start perfectly still. [Static shot] A beat later, a slow [Push in]. The four panels glide smoothly toward the center of the frame, converging and narrowing as they move, their images blurring and dissolving into long vertical streaks of silver light. Glass refraction, thin vertical light streaks and soft anamorphic flares sweep across the frame from left to right. The panels merge into a single soft silver-white bloom of light at the center of a black background, then settle into calm darkness with a clean empty center.

Smooth, elegant, slow, premium cinematic motion. Cool silver and white light, deep black, only a faint burgundy tint. No text, no letters, no logo, no people changing shape, no camera shake, no sudden cuts.
```

### M2 — variante « balayage de lumière » (même image de début)

```
Four tall vertical glass panels, each showing a different cinematic scene, stand perfectly still. [Static shot] A narrow beam of silver-white light sweeps slowly across the frame from left to right, and each glass panel refracts it in turn, flashing with thin prismatic edges as it passes. After the beam passes, the panels fade to black one after another from the outer edges toward the center, leaving a single soft silver light bloom at the center of the black frame, then calm darkness with a clean empty center.

Elegant, slow, premium, cinematic. Cool silver light, deep blacks, only a faint burgundy tint. No text, no letters, no logo, no camera shake.
```

### Ce qu'on garde dans le clip

Seuls les ~4 premiers secondes servent. Les 2 dernières peuvent rester sombres : on coupera.
Générer **2 à 3 versions** de M1 et M2 et nous envoyer les meilleures.

Enregistrer : `ORIGIN-plateforme/assets/intro/minimax-output/M1-a.mp4`, `M1-b.mp4`, `M2-a.mp4`…

## 4. Ce que nous faisons à la réception

| Étape | Détail |
|---|---|
| Choix | On retient le meilleur clip selon la liste ci-dessous |
| Découpe | ~3,5 s, premier plan noir supprimé |
| Encodage | MP4 H.264 1080p (et version WebM), < 3 Mo, sans piste audio dans un premier temps |
| Mot ORIGIN | Ajouté en code, synchronisé avec la fin du clip, police et dégradé argent du site |
| Intégration | Joué **une fois par session**, bouton « Passer », absent si animations réduites |
| Son | Dans un second temps (1 s, grave puis aigu) |

La version en code (CSS) existe déjà et sert de repli, et de référence de rythme.

## 5. Critères de validation de la vidéo

- [ ] Les colonnes bougent **ensemble**, sans se déformer ni se chevaucher.
- [ ] Aucune lettre, aucun texte, aucun logo apparent.
- [ ] Pas de visage qui se transforme ou « fond » de manière dérangeante.
- [ ] La lumière finale est **argentée**, pas rouge ni dorée.
- [ ] La fin laisse un **centre noir propre** pour le mot ORIGIN.
- [ ] Mouvement lent et élégant, pas de secousse.

## 6. Droits et précautions

- Les références Amazon et Marvelous servent uniquement à décrire une technique (verre, lumière, lettres).
  On ne demande jamais à l'IA de reproduire leur logo, leurs plans ou leur nom.
- Les personnes des images du catalogue sont générées : ne pas téléverser de photos de personnes réelles.
- Conserver les prompts et les versions retenues dans ce dossier pour pouvoir régénérer la signature à l'identique.
