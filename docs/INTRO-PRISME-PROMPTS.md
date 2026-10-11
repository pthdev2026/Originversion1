# Intro ORIGIN « Prisme » — pack de production (GPT → Minimax)

> ## ✅ Version 5 — format « brief » validé par un exemple Minimax (15 s, 2560×1440, avec son)
> L'exemple fourni par le client montre ce qui fonctionne : un **brief court** qui nomme le protagoniste
> (images « originales » fournies), fixe ce qui ne doit pas bouger, donne le style visuel et découpe la vidéo
> en **4 temps**. Le texte à l'écran est rendu correctement et le produit reste stable.
> Les prompts V4 (plan image de début / image de fin) restent utilisables ; V5 est à essayer en premier.

## V5 — images à téléverser (références « originales »)

| Ordre | Fichier | Rôle |
|---|---|---|
| 1 | `assets/intro/photos/P1.jpg` | La foi (portrait N&B) |
| 2 | `assets/intro/photos/P2.jpg` | Le témoignage (podcast) |
| 3 | `assets/intro/photos/P3.jpg` | **Chantal**, présentatrice officielle (au cœur du mot, sur le G) |
| 4 | `assets/intro/photos/P4.jpg` | La réconciliation (mère et fille) |
| 5 | `assets/intro/frames/ORIGIN-silver.png` | Logo : le mot ORIGIN argenté (référence de la fin) |

Les références de test non publiables sont rangées dans `photos/_tests/` et ne partent pas chez Minimax.

Ne téléverser **que des images originales** (générées par nous). Les références trouvées ailleurs
(photos d'auteurs, plans de série) restent hors de Minimax.

## V5 — Prompt 15 secondes (film de marque)

```
Make a short cinematic brand film for ORIGIN, a premium streaming platform of real human stories, within 15 seconds. The uploaded original portraits (images 1 to 4) are the protagonists: keep the faces, expressions, skin texture and clothing stable and faithful to the originals, no morphing. Image 3 is the official host of the platform, a real woman: keep her identity, smile and outfit exactly as in the original, and give her the central place in the final composition. Image 5 is the ORIGIN logo: reproduce the word exactly as shown for the final lockup.

Visual style: deep black, polished silver and glass with a very faint burgundy tint, panes of glass and prisms of cool silver-white light, fine dust in the light, restrained and premium, natural film-grade skin and colour, no neon, no saturated red.

Express four beats: (1) awakening in the dark: thin vertical light streaks and glass panes sweep through the black; (2) the stories: the four portraits appear one after another inside tall glass panes, each with subtle natural micro-movement (a breath, a blink, a tear), with a short elegant caption in clean wide-spaced capitals ("TÉMOIGNER", "PARDONNER", "CROIRE"); (3) convergence: the glass panes slide together and the portraits become the inside of the letters O-R-I-G-I-N; (4) finalization: the letters turn into polished silver, a single glint passes, and the tagline "LES HISTOIRES MÉRITENT PLUS QU'UN ÉCRAN" fades in under the logo.

Sound: a low cinematic drone, soft glass chimes with each pane, a deep clean hit on the final lockup, then silence. Smooth premium camera movement, no shake, no sudden cuts. The word ORIGIN must stay perfectly readable at every moment.
```

## V5 — Prompt 5 secondes (intro de l'application)

```
Make a 5-second cinematic logo reveal for ORIGIN, a premium streaming platform of real human stories. The uploaded original portraits (images 1 to 4) are the protagonists, kept faithful with no morphing; image 3 is the official host, a real woman, kept exactly as in the original. Image 5 is the ORIGIN logo, reproduced exactly.

Style: deep black, polished silver and glass, very faint burgundy tint, cool silver-white prisms of light, restrained and premium, natural film-grade skin, no neon, no saturated red.

Beats: 0-1 s thin vertical light streaks and glass panes sweep through the black; 1-3 s the four portraits flash inside glass panes with subtle micro-movement then slide together and fill the letters O-R-I-G-I-N; 3-5 s the letters become polished silver, one clean glint passes, and the word ORIGIN holds perfectly still.

Sound: short low drone with a soft glass chime and one deep hit on the final word. Smooth premium motion, no shake. The word ORIGIN must stay perfectly readable at every moment. No other text.
```

## V5 — Après la génération

- Garder la meilleure des 3 versions ; si le son est bon, on le conserve (sinon on le refait nous-mêmes).
- Pour l'application : version 5 s, ou on extrait la fin (≈ 4 s) de la version 15 s.
- Le film de 15 s sert aussi de **bande de marque** (réseaux, page de lancement).

---

> ## ✅ Version 4 (modèle Amazon × Marvel) — c'est CE pack qu'il faut utiliser pour Minimax
> Concept : les lettres **ORIGIN** sont remplies par les portraits (effet « Marvel »), balayées par des prismes
> de verre et de lumière (effet « Amazon »), puis se fondent en argent poli.
>
> - Le mot est **composé par nous** (`assets/intro/build_wordmark_frames.py`), jamais généré par l'IA :
>   Minimax reçoit un cadre où les lettres sont déjà justes, et n'ajoute que la lumière et la vie.
> - Image de début : `assets/intro/frames/ORIGIN-fill.png` (lettres remplies par les portraits)
> - Image de fin   : `assets/intro/frames/ORIGIN-silver.png` (lettres argentées)
> - ⚠️ Les portraits P1 et P2 du cadre actuel sont des **références de test** (non publiables). Quand les
>   originales sont prêtes dans `photos/`, on relance le script et on régénère les deux cadres.

## V4 — réglages Minimax

| Réglage | Valeur |
|---|---|
| Mode | Image → vidéo, avec **image de début ET image de fin** si disponible |
| Image de début | `ORIGIN-fill.png` |
| Image de fin | `ORIGIN-silver.png` |
| Résolution / durée | 1080p, 6 s |
| Optimisation du prompt | Désactivée si l'option existe |
| Versions | 3 générations du prompt A, puis 1 à 2 du prompt B |

## V4 — Prompt A (principal)

```
Cinematic logo reveal, 16:9. The first frame shows the word ORIGIN in large, bold, widely spaced capital letters centered on a pure black background; each letter is filled with dark photographic portraits of real human faces (an older man pointed at by fingers in black and white, a frightened wide-eyed person, a woman speaking with tears, a mother embracing her daughter, a bearded man with a calm gaze). The letters have a thin polished silver edge.

[Static shot] for the first half second, then a very slow [Push in] toward the word.

0.0 to 1.5 s: tall vertical panes of polished glass and prisms of cool silver-white light sweep slowly across the word from left to right, refracting along the silver edges of the letters, leaving soft anamorphic light streaks and faint prismatic reflections, deep blacks, fine dust catching the light.
1.5 to 3.5 s: the portraits inside the letters come gently alive with natural micro-movements only: a slow breath, a blink, a tear sliding, the soft sway of hair, while a second sweep of light passes through the glass.
3.5 to 5.0 s: the photographs dissolve smoothly into brushed polished silver, the letters become solid reflective silver metal matching the final frame, a single clean specular glint travels across the word from left to right.
5.0 to 6.0 s: the word ORIGIN rests perfectly still in polished silver on black, with a soft silver glow and a very faint deep burgundy tint far in the background.

The letter shapes must stay rigid, perfectly readable and unchanged throughout: no letter morphing, no warping, no melting, no extra letters, no additional text, no logos. Smooth, slow, elegant, premium cinematic motion. Cool silver and white light, deep black, no saturated colors, no red, no flicker, no camera shake, no sudden cuts.
```

## V4 — Prompt B (variante plus « Amazon », si A est trop sage)

```
Cinematic logo reveal, 16:9. Start from the provided first frame: the word ORIGIN in bold wide capital letters filled with dark portrait photographs on pure black. A burst of crystal-clear vertical glass shards and light columns crosses the frame from left to right at moderate speed, bending and splitting white light into thin prismatic streaks and lens flares, brightening the portraits inside the letters for a moment. The glass light then converges and focuses on the letters; the portraits fade into polished silver and the word settles to the final frame: solid brushed silver letters, perfectly still, with one last soft glint.

The letters stay perfectly rigid and readable at every moment: no morphing, no warping, no extra text, no logos. Premium, cinematic, elegant. Cool silver-white light, deep black, no red. No camera shake.
```

## V4 — Prompt C (si l'image de fin n'est pas acceptée : image de début seule)

```
[Static shot] then a slow [Push in]. The word ORIGIN, in bold wide capital letters filled with dark portrait photographs, sits on a pure black background. Vertical panes of polished glass and prisms of silver-white light sweep slowly across it from left to right, refracting along the letters' thin silver edges. The portraits inside the letters breathe gently with natural micro-movements. In the last two seconds the photographs dissolve into polished brushed silver and the letters rest perfectly still as solid reflective silver metal with a soft glow.

The letters stay perfectly rigid and readable: no morphing, no warping, no extra text, no logos. Smooth, slow, premium cinematic motion. Cool silver and white light, deep black, no red, no flicker, no camera shake.
```

## V4 — Critères de validation (à vérifier image par image)

- [ ] Le mot reste **ORIGIN**, lisible, sans lettre déformée ou fondue (critère éliminatoire).
- [ ] Aucun texte ni logo ajouté.
- [ ] Les visages ne se déforment pas de façon dérangeante.
- [ ] La fin est un mot argenté **net et immobile**.
- [ ] La lumière est argent / blanc ; pas de rouge dominant.
- [ ] Mouvement lent, sans saccade.

## Ce qu'on fait ensuite

Le début (0,5 s de noir et d'un trait de lumière) et la fin (tenue du mot + sortie) sont ajoutés par nous,
ainsi que le **son**. Si Minimax déforme les lettres malgré tout, plan B : on garde sa lumière de verre en
fond et on réincruste le mot net par-dessus, en code.

---

> ## ✅ Version 3 (références visuelles du 11/10) — c'est CE prompt qu'il faut utiliser
> Le niveau visé : des **stills de production** de série ou de film premium. Peau réelle (pores, rides, taches de
> rousseur, brillance naturelle, sueur ou larmes), colorimétrie naturelle et terreuse, contraste moyen,
> atmosphère (poussière, brume), costumes et décors aux vraies textures, émotion non posée.
> **On ne reproduit ni personnage, ni acteur, ni costume connu** : on analyse la qualité, on ne copie pas.
>
> - **5 photos générées d'un seul coup** dans la même conversation GPT, pour garder exactement le même rendu.
> - Enregistrées en `assets/intro/photos/P1.jpg … P5.jpg`.
> - `build_keyframes.py` assemble 4 ou 5 colonnes (largeur égale) en `K1.png` ; `K2.png` est déjà fait.
> - La V2 ci-dessous reste valable pour les corrections ; le prompt V3 remplace ses 4 prompts individuels.

## V3 — prompt unique (cinq images)

À coller dans **une nouvelle conversation GPT**, sans rien téléverser.

```
I need five separate photographs for one project, generated one after another in this same conversation so that they share exactly the same photographic look. Produce them one by one, each as its own image, portrait 2:3 (1024x1536 or larger). Never combine them into one image. Do not ask questions: start with image 1 and continue until all five are done.

SHARED LOOK (applies to all five images):
- A premium production still from a prestige film or drama series, as if shot on a cinema camera (ARRI Alexa, 40-50mm lens), shallow depth of field, natural or practical light only.
- Skin must look real: visible pores, fine lines, freckles, small blemishes, uneven tone, natural oil sheen, and sweat or tears where the scene calls for it. No smoothing, no plastic skin, no beauty retouching. Hands and fabric must also show real texture.
- Colour: natural, filmic, slightly warm and earthy, accurate skin tones, medium contrast. Keep detail in both shadows and highlights, never crush blacks, never blow highlights. No HDR look, no neon, no teal-and-orange grading.
- Atmosphere: a touch of haze or dust in the light, real textures of cloth, wood, stone and skin, softly out-of-focus background with real people or objects.
- Expression: genuine, unposed emotion. Subjects do not look at the camera unless stated.
- People are fictional, ordinary and authentic, of varied ethnicities and ages, not resembling any real person, actor or known character. No recognisable costumes, no logos, no text, no watermark.
- Framing: waist-up or closer, with the main subject kept inside the central 60% of the frame (the picture will later be cropped into a narrow vertical strip).

THE FIVE SCENES:
1. FILM - a man in his mid-30s sitting alone in a hospital corridor at dawn on a plastic chair, elbows on his knees, lifting his face from his hands, eyes red and tired; a blurred doctor in the far background; cold pale window light.
2. INTERVIEW - a woman in her mid-30s speaking from the heart in a real home podcast studio, mid-sentence, eyes glistening, one hand resting on her chest; a microphone on a boom arm slightly out of focus in the foreground; a warm lamp behind her.
3. DRAMA - an older mother in her 60s and her adult daughter embracing tightly in the doorway of a modest family kitchen, the daughter's face wet with tears and eyes closed, the mother's hand cradling the back of her head; soft window daylight; a real lived-in home.
4. TENSION - a woman in her 40s standing at a half-open front door at night, one hand on the handle, listening, tense and afraid; a thin line of warm light from the hallway falls across her face; no violence, no weapons, no injury.
5. FAITH - a bearded man in his 40s in simple ancient-period linen and wool clothing in a sunlit, dusty stone village square, arms slightly open, eyes lifted toward the sky, tears cutting through the dust on his face; a crowd of villagers softly out of focus behind him; warm earthy daylight.

Start now with image 1.
```

Si GPT ne produit qu'une image à la fois, répondre : `Continue with the next image, same exact look.`
Si le rendu dérive d'une image à l'autre : `Match the exact photographic look, colour and skin texture of image 1.`

---

> ## ⚠️ Version 2 (retours du 11/10) — remplace l'étape GPT ci-dessous
> Retours sur la première génération : contrastes trop forts, rendu « IA », colonnes imparfaites.
> Nouvelle approche :
> 1. **GPT ne génère plus que 4 photos séparées** (portrait 2:3), réalistes, avec de vraies émotions humaines.
> 2. **Nous assemblons K1 nous-mêmes** avec `assets/intro/build_keyframes.py` : colonnes de largeur exactement égale,
>    contraste adouci, verre discret, aucune couture ni texte parasite.
> 3. **K2 est généré par le script** (déjà fait : `gpt-output/K2.png`). Plus besoin de GPT pour K2.
>
> Les anciens prompts K1 et K2 (section 2) sont conservés pour mémoire mais ne sont plus à utiliser.

## V2 — étape GPT : 4 photos (une génération par photo, sans téléverser de référence)

Réglages : format **portrait 2:3** (1024×1536 ou plus), qualité maximale. Le sujet doit rester dans les
**60 % centraux** de l'image : chaque colonne finale ne montre qu'une bande verticale étroite.

Bloc de style commun (déjà inclus dans chaque prompt) : photographie documentaire, grain de peau naturel,
contraste doux, couleurs naturelles, aucune retouche beauté.

### P1 — « L'annonce » (film)

```
A candid documentary photograph of a man in his mid-30s sitting alone in a parked car at night, both hands resting on the steering wheel, head slightly lowered, eyes red and tired, lost in thought after receiving difficult news. Soft light from a distant streetlamp falls across his face and reflects faintly on the windshield. Real, quiet, human moment.

Photographic style: shot on a full-frame camera, 85mm lens at f/1.8, available light only, natural skin texture with visible pores, fine lines, small imperfections and a slight natural shine, no skin smoothing, no beauty retouching, realistic hair, subtle film grain. Soft natural contrast with lifted blacks and gentle highlights, muted natural colors, no HDR look, no teal-and-orange grading, no glow, no vignette, not CGI, not an illustration. He is a fictional, ordinary-looking person, not a model and not resembling any real person.

Vertical 2:3 portrait. The subject stays within the central 60% of the frame. No text, no logos, no watermark.
```

### P2 — « Le témoignage » (interview / podcast)

```
A candid documentary photograph of a woman in her mid-30s speaking from the heart in a real home podcast studio, mid-sentence, her eyes glistening with emotion, one hand resting on her chest. A microphone on a boom arm is in the foreground, slightly out of focus. A warm practical lamp glows softly behind her, with a bookshelf and acoustic panels in the background. A sincere, vulnerable moment of testimony.

Photographic style: shot on a full-frame camera, 85mm lens at f/1.8, available light only, natural skin texture with visible pores, fine lines, small imperfections and a slight natural shine, no skin smoothing, no beauty retouching, realistic hair strands, subtle film grain. Soft natural contrast with lifted blacks and gentle highlights, muted natural colors, no HDR look, no teal-and-orange grading, no glow, no vignette, not CGI, not an illustration. She is a fictional, ordinary-looking person, not a model and not resembling any real person.

Vertical 2:3 portrait. The subject stays within the central 60% of the frame. No text, no logos, no watermark.
```

### P3 — « La réconciliation » (drame, famille)

```
A candid documentary photograph of an older mother in her 60s and her adult daughter in her 30s embracing tightly in the doorway of a modest family kitchen, the daughter's face wet with tears, eyes closed, the mother's hand holding the back of her head. Soft daylight from a window, ordinary lived-in home interior with a few everyday objects. A real moment of forgiveness and reunion, tender and unposed.

Photographic style: shot on a full-frame camera, 50mm lens at f/2, available window light only, natural skin texture with visible pores, wrinkles, fine lines and small imperfections, no skin smoothing, no beauty retouching, realistic hair, subtle film grain. Soft natural contrast with lifted blacks and gentle highlights, muted natural colors, no HDR look, no teal-and-orange grading, no glow, no vignette, not CGI, not an illustration. Fictional, ordinary-looking people, not models and not resembling any real person.

Vertical 2:3 portrait. The subjects stay within the central 60% of the frame. No text, no logos, no watermark.
```

### P4 — « Avant la confrontation » (tension / suspense)

```
A candid documentary photograph of a young man in his late 20s standing in a dim concrete stairwell, back against the wall, jaw clenched, breathing heavily, knuckles pale as he grips the railing, eyes fixed on something just out of frame. Cold light from a single overhead fixture, deep but readable shadows. The tense second before a difficult confrontation. No violence, no weapons, no blood, no injury.

Photographic style: shot on a full-frame camera, 85mm lens at f/1.8, available light only, natural skin texture with visible pores, stubble, fine lines and small imperfections, no skin smoothing, no beauty retouching, realistic hair, subtle film grain. Soft natural contrast with lifted blacks and gentle highlights (shadows keep detail, nothing crushed to pure black), muted natural colors, no HDR look, no teal-and-orange grading, no glow, no vignette, not CGI, not an illustration. He is a fictional, ordinary-looking person, not a model and not resembling any real person.

Vertical 2:3 portrait. The subject stays within the central 60% of the frame. No text, no logos, no watermark.
```

### Corrections fréquentes (V2)

| Problème | Message à coller en réponse |
|---|---|
| Rendu trop « IA » ou lisse | `More photographic and less processed: visible skin pores, uneven skin tone, natural imperfections, real camera grain. No smoothing.` |
| Contraste trop fort | `Lower the contrast clearly: lifted blacks, soft highlights, nothing crushed to black, nothing blown out.` |
| Couleurs trop saturées ou étalonnage cinéma | `Neutral natural colors, like an unedited RAW photo. Remove the teal-and-orange look.` |
| Le visage est coupé ou trop près des bords | `Keep the subject centered, with generous space on both sides.` |
| Texte ou logo visible | `Remove all text and logos completely.` |

### Enchaînement

1. Enregistrer les 4 photos dans `ORIGIN-plateforme/assets/intro/photos/` sous les noms `P1.jpg`, `P2.jpg`, `P3.jpg`, `P4.jpg`.
2. Nous lançons `python3 assets/intro/build_keyframes.py` (je m'en occupe) : cela produit `K1.png` et `K2.png`.
3. Contrôle de K1, puis envoi à Minimax avec le prompt **M1** ci-dessous (image de début K1, image de fin K2).

---

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

## Note — Chantal (présentatrice officielle)

Chantal est une personne réelle. Avant d'envoyer son image à un outil de génération vidéo, vérifier :
1. **Son accord écrit** pour l'usage de son image dans une animation générée par IA.
2. **Les conditions du service** : certains outils encadrent l'usage de visages réels ; si le rendu est refusé ou altéré, on la place en code (cf. plan B) à partir de la vraie image.
3. **Cohérence** : ses images viennent d'un tournage réel ; les autres portraits sont générés. L'étalonnage des cadres les rapproche, mais on évite de la montrer en même temps qu'un portrait aux traits proches.

## Prompts complets — film de marque 15 s

### Version 7 images (6 portraits + logo)

Ordre : 1 foi · 2 témoignage · 3 Chantal · 4 réconciliation · 5 jugement · 6 silence · 7 logo ORIGIN argenté.

```
Make a short cinematic brand film for ORIGIN, a premium streaming platform of real human stories, within 15 seconds. The uploaded original portraits (images 1 to 6) are the protagonists: keep the faces, expressions, skin texture and clothing stable and faithful to the originals, no morphing. Image 3 is the official host of the platform, a real woman: keep her identity, smile and outfit exactly as in the original, and give her the central place in the final composition. Image 7 is the ORIGIN logo: reproduce the word exactly as shown for the final lockup.

Visual style: deep black, polished silver and glass with a very faint burgundy tint, panes of glass and prisms of cool silver-white light, fine dust in the light, restrained and premium, natural film-grade skin and colour, no neon, no saturated red.

Express four beats: (1) awakening in the dark: thin vertical light streaks and glass panes sweep through the black; (2) the stories: the six portraits appear one after another inside tall glass panes, in the order of images 1 to 6, each with subtle natural micro-movement (a breath, a blink, a tear), with a short elegant caption in clean wide-spaced capitals ("CROIRE", "TÉMOIGNER", "ACCUEILLIR", "PARDONNER", "ÊTRE JUGÉ", "SE TAIRE"); (3) convergence: the glass panes slide together and the portraits become the inside of the letters O-R-I-G-I-N; (4) finalization: the letters turn into polished silver, a single glint passes, and the tagline "LES HISTOIRES MÉRITENT PLUS QU'UN ÉCRAN" fades in under the logo.

Sound: a low cinematic drone, soft glass chimes with each pane, a deep clean hit on the final lockup, then silence. Smooth premium camera movement, no shake, no sudden cuts. The word ORIGIN must stay perfectly readable at every moment. No other text than the captions and the tagline.
```

### Version 5 images (4 portraits + logo), utilisable dès maintenant

Ordre : 1 foi · 2 témoignage · 3 Chantal · 4 réconciliation · 5 logo ORIGIN argenté.

```
Make a short cinematic brand film for ORIGIN, a premium streaming platform of real human stories, within 15 seconds. The uploaded original portraits (images 1 to 4) are the protagonists: keep the faces, expressions, skin texture and clothing stable and faithful to the originals, no morphing. Image 3 is the official host of the platform, a real woman: keep her identity, smile and outfit exactly as in the original, and give her the central place in the final composition. Image 5 is the ORIGIN logo: reproduce the word exactly as shown for the final lockup.

Visual style: deep black, polished silver and glass with a very faint burgundy tint, panes of glass and prisms of cool silver-white light, fine dust in the light, restrained and premium, natural film-grade skin and colour, no neon, no saturated red.

Express four beats: (1) awakening in the dark: thin vertical light streaks and glass panes sweep through the black; (2) the stories: the four portraits appear one after another inside tall glass panes, in the order of images 1 to 4, each with subtle natural micro-movement (a breath, a blink, a tear), with a short elegant caption in clean wide-spaced capitals ("CROIRE", "TÉMOIGNER", "ACCUEILLIR", "PARDONNER"); (3) convergence: the glass panes slide together and the portraits become the inside of the letters O-R-I-G-I-N; (4) finalization: the letters turn into polished silver, a single glint passes, and the tagline "LES HISTOIRES MÉRITENT PLUS QU'UN ÉCRAN" fades in under the logo.

Sound: a low cinematic drone, soft glass chimes with each pane, a deep clean hit on the final lockup, then silence. Smooth premium camera movement, no shake, no sudden cuts. The word ORIGIN must stay perfectly readable at every moment. No other text than the captions and the tagline.
```

# Version 6 — retours sur le premier sting Minimax (12/10)

Constats : lettres 3D en verre très réussies (niveau cible), éclats prismatiques réussis, mais :
1. Le montage contient des images **non publiables** (peinture « Matrix », trompettiste = personne réelle, visage au code, visage main sur la bouche) : le projet Minimax contenait encore d'anciennes pièces jointes. Seule Chantal est à nous.
2. La typographie finale n'est pas notre logo (lettres anguleuses recréées).
3. Les portraits originaux (foi, témoignage, réconciliation) n'apparaissent pas.
4. Son : pic à −0,3 dBFS, −15 LUFS intégrés : trop chaud pour le web, à renormaliser.

Décisions : plus d'images dans le montage (≈ 12 moments distincts, une carte-planche), son iconique à la harpe produit
**séparément** puis monté, finale « ORIGIN STUDIO » pour l'ident de production.
