# ORIGIN — Benchmark technique (v1)

Statut : **recherche initiale, à valider**. Les sources sont des synthèses tierces, pas les billets d'ingénierie officiels de Netflix / Amazon. Les prix doivent être revérifiés sur les pages officielles avant tout engagement.

---

## 1. Ce que font les grands, et ce qu'on en retient

### Netflix
| Brique | Principe | Pour ORIGIN |
|---|---|---|
| Ingest → encodage → distribution | Pipeline en 3 étapes, fichiers découpés en chunks encodés en parallèle | ✅ Reprendre le principe : pipeline asynchrone par job |
| Encodage **hors ligne** | Tout est encodé avant la sortie, pas à la volée | ✅ Indispensable : on pré-encode une fois |
| **Per-title / per-shot** | Échelle de débits adaptée à la complexité du contenu, mesurée avec VMAF | 🟡 Plus tard : échelle fixe d'abord, VMAF en optimisation |
| Streaming adaptatif (ABR) | Le lecteur change de qualité selon le réseau | ✅ HLS multi-débits |
| **Open Connect** | CDN propriétaire, serveurs dans les réseaux des FAI | ❌ Hors de portée et inutile : on loue un CDN |
| Microservices à très grande échelle | Des centaines de services, équipes dédiées | ❌ Ne pas copier |

### Amazon Prime Video
| Sujet | Constat | Pour ORIGIN |
|---|---|---|
| CDN | Repose sur CloudFront (CDN du fournisseur) | ✅ Même logique : CDN loué, pas construit |
| Service de monitoring qualité (2023) | Passé de microservices distribués à un seul déploiement : coûts d'infra −90 % selon Amazon | ✅ **Leçon n°1 de maintenance : commencer par un monolithe modulaire** |

**Conclusion benchmark** : la valeur de Netflix n'est pas dans sa taille mais dans 4 principes : *pré-encoder, découper en segments, laisser le lecteur adapter la qualité, servir depuis un cache proche du spectateur*. Ces 4 principes sont reproductibles à notre échelle.

---

## 2. Comparatif des options de streaming vidéo

| Option | Coût indicatif* | DRM | Maintenance | Verdict ORIGIN |
|---|---|---|---|---|
| **Auto-hébergé** : FFmpeg + stockage + nginx/Caddy + hls.js | 0 € en local ; serveur + bande passante ensuite | À construire | Élevée | ✅ **Phase locale**, par choix et pour apprendre |
| **Bunny Stream** | ~0,01 $/Go stocké, ~0,005–0,01 $/Go livré, encodage et lecteur inclus | Option payante | Faible | ✅ Meilleur candidat pour la mise en ligne à budget maîtrisé |
| **Cloudflare Stream** | 5 $ / 1000 min stockées, 1 $ / 1000 min livrées | Pas de multi-DRM natif (URLs signées) | Très faible | 🟡 Simple, mais protection limitée |
| **Mux** | À l'usage, par résolution ; 5–8× plus cher selon un comparatif | Fort, analytics avancés | Faible | 🟡 Si on a un jour besoin d'analytics fins et de DRM |
| **AWS MediaConvert + CloudFront** | ~0,0075–0,04 $/min encodée + ~85 $/To sorti | Via services AWS | Moyenne à élevée | ❌ Rarement optimal à notre taille |
| **Jellyfin** (serveur média) | 0 € | Non | Faible | ❌ Fait pour une médiathèque perso, pas une plateforme publique à identité propre |

*Ordres de grandeur issus d'articles comparatifs tiers, à vérifier.

---

## 3. Recommandation d'architecture

### Principe : un monolithe modulaire, des interfaces propres, des briques remplaçables

```
 Front (Lovable / React)
        │  HTTPS
        ▼
 API ORIGIN (TypeScript, un seul service, modules séparés)
   ├─ catalogue   (programmes, épisodes, thématiques, collections)
   ├─ auth        (comptes, sessions)
   ├─ lecture     (autorisation, URLs signées, progression)
   └─ ingest      (upload, file de jobs)
        │
   ┌────┴─────┬───────────────┐
   ▼          ▼               ▼
 PostgreSQL  File de jobs    Stockage objet (S3-compatible)
             → Worker        local : MinIO
               FFmpeg        prod  : Bunny / R2 / S3
               (HLS multi-débits + vignettes)
                                │
                                ▼
                         Serveur statique / CDN
                                │
                                ▼
                       Lecteur : hls.js ou Shaka Player
```

### Pourquoi ces choix
- **Monolithe modulaire** : leçon Prime Video, un seul service est plus simple à déployer, déboguer et maintenir. Les modules ont des frontières nettes pour pouvoir en extraire un plus tard si nécessaire.
- **Stockage « S3-compatible » dès le début** (MinIO en local) : le passage au cloud devient un changement de configuration, pas de code.
- **HLS (segments + playlists)** : standard, jouable partout, compatible CDN et TV.
- **Pré-encodage par worker** : le serveur web n'encode jamais ; l'encodage à la volée est très coûteux en CPU.
- **Séparation données / présentation** : le front ne connaît que l'API.

### Échelle d'encodage de départ (à affiner)
| Rendition | Débit vidéo indicatif |
|---|---|
| 1080p | ~4–5 Mb/s |
| 720p | ~2,5–3 Mb/s |
| 480p | ~1–1,5 Mb/s |
| 360p | ~0,6–0,8 Mb/s |

Estimation de stockage : **~3 à 5 Go par heure de vidéo** avec cette échelle. Un disque de 1 To contient donc de l'ordre de 200 à 300 heures.

### Ce qu'on ne fait pas (et pourquoi)
- Pas de microservices, pas de Kubernetes : coût de maintenance disproportionné.
- Pas de CDN maison.
- Pas de DRM commercial en V1 : voir point ouvert ci-dessous.
- Pas de recommandation algorithmique : pas de données réelles.

---

## 4. Maintenance : ce qui compte vraiment

1. **Observabilité minimale** : logs structurés, état de chaque job d'encodage, erreurs de lecture remontées du lecteur.
2. **Jobs idempotents** : un encodage qui échoue se relance sans effet de bord.
3. **Sauvegardes** : base de données + fichiers sources (les rendus HLS se régénèrent, les sources non).
4. **Configuration par environnement** : local / préproduction / production, mêmes images, variables différentes.
5. **Migrations de base versionnées**.
6. **Tests ciblés** : pipeline d'encodage, autorisation de lecture, API catalogue.

---

## 5. Points ouverts nécessitant ta décision

| # | Question | Pourquoi c'est important |
|---|---|---|
| 1 | **Protection du contenu** : URLs signées suffisent-elles, ou DRM (Widevine / FairPlay) exigé ? | Le DRM est le plus gros facteur de coût et de complexité |
| 2 | **Backend de Lovable** : Lovable génère par défaut du Supabase. On le garde seulement pour le front, ou on le remplace par l'API locale ? | Tu veux tout en local : il faut éviter deux sources de vérité |
| 3 | **Volume visé à 12 mois** : heures de contenu, spectateurs simultanés estimés | Dimensionne stockage et bande passante |
| 4 | **Cibles de lecture** : web desktop + mobile web d'abord, TV après ? | Impact sur formats et lecteur |
| 5 | **Mise en ligne** : budget mensuel acceptable ? | Départage Bunny / Cloudflare / auto-hébergé |

---

## 6. À approfondir (non vérifié)

- Billets officiels Netflix TechBlog (Open Connect, per-title, VMAF) et primevideotech.com.
- Shaka Packager (DASH / DRM) et alternatives libres.
- Tarifs et conditions DRM exacts de Bunny, Mux et licence Widevine / FairPlay.
- Hébergement serveur : machine dédiée vs VPS, et bande passante incluse.

## Sources consultées
- Netflix : [VdoCipher](https://www.vdocipher.com/blog/netflix-tech-stack-and-architecture/), [Aji Singh](https://singhajit.com/netflix-video-processing-pipeline/), [Broadpeak](https://broadpeak.tv/blog/how-does-netflix-ensure-quality/), [Fora Soft](https://www.forasoft.com/learn/video-encoding/glossary/terms/per-title-encoding)
- Prime Video : [System Design Sundays](https://codinginterviewsmadesimple.substack.com/p/amazon-prime-video-reduced-costs), [TechTarget](https://www.techtarget.com/it-infrastructure/tip/Architecting-beyond-microservices-and-monoliths), [CodeOpinion](https://codeopinion.com/distributed-isnt-microservices-in-process-isnt-a-monolith/), [AWS CloudFront](https://aws.amazon.com/cloudfront/streaming/)
- Services vidéo : [Swarmify – Bunny](https://swarmify.com/blog/bunny-stream-review/), [PkgPulse](https://www.pkgpulse.com/guides/mux-vs-cloudflare-stream-vs-bunny-stream-video-cdn-2026), [LeanOps](https://leanopstech.com/blog/mux-vs-cloudflare-stream-vs-cloudfront-2026/), [Kinescope](https://kinescope.com/blog/best-video-cdn-providers-2026)
- Auto-hébergement HLS : [DeepakNess](https://deepakness.com/raw/self-hosting-videos/), [Cincopa](https://www.cincopa.com/learn/hls-streaming-technical-guide-and-implementation)
