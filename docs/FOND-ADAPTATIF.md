# Fond adaptatif (« background adaptatif »)

Principe de la plateforme : chaque surface prend la couleur du contenu affiché (verre teinté, fondus, halos), et change en fondu quand le contenu change.
Le code est **centralisé dans `app/src/lib/adaptive/`** ; aucune section ne recalcule ses couleurs elle-même.

## Architecture

| Couche | Fichier | Rôle |
|---|---|---|
| Cœur pur (sans React ni DOM) | `lib/adaptive/tint.ts` | `deriveTint(pixels)` → `Tint { c1, c2, c3 }` (lumineuse, sombre, claire), `NEUTRAL_TINT`, `tintVars(tint, prefix)` |
| Source : image | `lib/adaptive/use-image-tint.ts` | `useImageTint(src)` : échantillonne un visuel une fois (cache mémoire), `null` si illisible |
| Source : vidéo | `lib/adaptive/use-video-tint.ts` | `useVideoTint(videoRef, repli)` : mesure une image réduite (48×27) toutes les 2,5 s pendant la lecture ; si le flux est illisible (CORS), garde la teinte de l'affiche |
| Variables CSS | `styles.css` § « Fond adaptatif » | `@property --ad-c1/2/3` (couleurs animables) + `.adaptive-surface` (fondu de 1,6 s) |
| Point d'entrée | `lib/adaptive/index.ts` | tout s'importe de `@/lib/adaptive` |

La teinte est calculée sur la **moitié basse** de l'image (celle qui passe derrière le verre) ; les pixels colorés pèsent plus que les gris ; une image presque sans couleur donne un gris froid neutre, jamais une teinte au hasard. Le fondu entre deux teintes est fait **en CSS** (propriétés enregistrées), pas en JavaScript : aucune animation à gérer côté React.

## Utiliser le module dans une surface

```tsx
const tint = useImageTint(content.image);            // ou useVideoTint(videoRef, content.image)
<section className="adaptive-surface" style={tintVars(tint)}>…</section>
```
puis en CSS : `background: color-mix(in oklab, var(--ad-c2) 70%, transparent)`, halo `var(--ad-c1)`, accent `var(--ad-c3)`.
Un autre préfixe est possible (`tintVars(tint, 'hg')`) quand une section déclare ses propres variables (c'est le cas de la Hero : `--hg-*`).

## Où c'est utilisé
Hero mobile (verre, barre du bas) · Témoignages (fond par histoire) · Explorer par thématique (verre de la carte) · Cartes « Ce qui pourrait vous plaire » (halo intérieur) · **Lecteur vidéo** (fondus haut et bas, halo bas).

## Lecteur
Les bandeaux du haut et du bas utilisent `--ad-c2` (fond) et `--ad-c1` (halo) à la place du noir : la couleur suit la scène. Couleur d'accent de la progression : **champagne** (`--champagne`, définie sur `.player-shell`).
Commandes : retour, revenir au début, liste des épisodes (haut) ; lecture/pause, temps, progression, son, plein écran (ligne du bas) ; reculer/avancer de 10 s, sous-titres (pistes WebVTT de l'API, section absente s'il n'y en a pas), qualité (niveaux HLS) ; à l'arrêt : titre, épisode et synopsis.
Pas de choix de langue audio : une seule piste existe côté serveur. Pas de distribution (X-Ray) : l'API ne fournit pas de casting.

## À prévoir côté back-end
- **Teinte précalculée par contenu** (`tint: {c1,c2,c3}` dans la fiche du programme) : évite de mesurer côté client et fonctionne pour un flux d'une autre origine.
- **Flux avec CORS** (`crossorigin`) : sans lui, la teinte de la vidéo en direct n'est pas lisible et le lecteur garde la teinte de l'affiche.
- **Casting** (acteurs + rôles + photos) si l'on veut les cartes d'information du lecteur (comme sur la référence).
