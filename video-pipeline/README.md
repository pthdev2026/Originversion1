# Pipeline vidéo ORIGIN

Transforme une vidéo source en HLS multi-débits (segments fMP4 de 4 s, H.264 + AAC).

```bash
export FFMPEG_PATH="/chemin/vers/ffmpeg"    # sinon "ffmpeg" du PATH
export FFPROBE_PATH="/chemin/vers/ffprobe"  # sinon "ffprobe" du PATH
node encode-hls.mjs <source> <id-programme> --out ../storage/videos/hls [--preset medium] [--max-seconds 60]
```

- `id-programme` : minuscules, chiffres et tirets ; doit correspondre à l'`id` du programme dans le front.
- Paliers : 1080p / 720p / 480p / 360p, **jamais au-dessus de la hauteur de la source** (pas de sur-échantillonnage).
- `--preset slow` (défaut) : meilleure qualité par Mo, environ 5× le temps réel pour 4 paliers sur ce Mac. `medium` ≈ 3,7× (mesuré sur une source 1440p de 15 s : 82 s en `slow`, 56 s en `medium`).
- Sortie : `master.m3u8`, `v0/` à `vN/`, `poster.jpg`, `meta.json`.

Après l'encodage, enregistrer le programme en base : `npm run ingest` dans `../api` (voir son README).

Sur cette machine, FFmpeg 7.1 (avec libx264) est disponible dans `~/Library/Application Support/AutoCut/ffmpeg/`.

## Limites connues
- Une seule langue audio, pas de sous-titres.
- Pas de palier 4K ni de HEVC (prévu en V1.1, voir `docs/PLAN-1000-UTILISATEURS.md`).
- Échelle de débits fixe (pas de per-title / VMAF).
