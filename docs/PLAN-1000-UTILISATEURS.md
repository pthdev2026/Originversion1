# ORIGIN — Plan « 1 000 premiers utilisateurs »

Objectif : **lecture très fluide + coût minimal** pour les 1 000 premiers utilisateurs.
Statut : modèle de coût basé sur des **hypothèses explicites** (section 1). Les prix viennent de la doc Bunny et de sources tierces : à revérifier avant engagement.

---

## 1. Hypothèses (à corriger avec tes vraies attentes)

| Paramètre | Valeur retenue | Commentaire |
|---|---|---|
| Utilisateurs actifs | 1 000 (tous actifs chaque mois) | Hypothèse pessimiste |
| Catalogue V1 | 100 h de vidéo | À ajuster |
| Débit moyen livré | 2,5 Mb/s | Mix mobile / desktop avec streaming adaptatif |
| Pic de simultanéité | 5 à 10 % → **50 à 100 flux** | Soir et week-end |
| Temps de visionnage | 2 h / 5 h / 10 h par utilisateur et par mois | Scénarios bas / moyen / haut |

Conversion : 1 h livrée à 2,5 Mb/s ≈ **1,1 Go**.

## 2. Dimensionnement

| Besoin | Valeur |
|---|---|
| Bande passante au pic | 50 à 100 flux × 2,5 à 5 Mb/s ≈ **125 à 500 Mb/s** |
| Trafic mensuel (bas / moyen / haut) | **≈ 2,3 To / 5,6 To / 11 To** |
| Stockage diffusé (échelle 4 débits) | ≈ 4 Go/h → **≈ 400 Go** pour 100 h |
| Sources originales (sauvegarde, hors CDN) | ≈ 1 To, en local |

## 3. Coût mensuel selon la solution

| Solution | Bas (2 h) | Moyen (5 h) | Haut (10 h) | Remarque |
|---|---|---|---|---|
| **Bunny Storage + CDN, réseau Volume** (0,005 $/Go) | ~12 $ | ~28 $ | ~56 $ | Tarif plat mondial |
| **Bunny Storage + CDN, réseau Standard** (0,01 $/Go Europe/Amérique du Nord) | ~23 $ | ~56 $ | ~112 $ | Afrique 0,06 $/Go, Asie-Océanie 0,03 $/Go |
| **Cloudflare Stream** (1 $ / 1000 min livrées + 5 $ / 1000 min stockées) | ~150 $ | ~330 $ | ~630 $ | Simple mais 5× plus cher |
| **CloudFront** (~0,085 $/Go) | ~190 $ | ~475 $ | ~950 $ | Hors franchise gratuite |
| **R2 + Worker** (sortie gratuite) | ~6 $ | ~6 $ | ~6 $ | ⚠️ Conditions Cloudflare floues pour la vidéo, à confirmer par écrit |

À ajouter : stockage Bunny (~5 à 10 $), petit serveur API + base (~10 à 20 €).

**Budget total réaliste : ~50 à 150 $/mois**, soit **0,05 à 0,15 $ par utilisateur et par mois**.

## 4. Recommandation

### Choix : on encode nous-mêmes, on stocke et on diffuse via Bunny (Storage + CDN, sans le produit Bunny Stream)

| Étape | Où | Coût |
|---|---|---|
| Encodage FFmpeg → HLS multi-débits | **Sur ta machine** (accélération matérielle Apple Silicon) | 0 |
| Stockage des rendus HLS + diffusion | Bunny Storage + CDN | ~30 à 120 $/mois |
| API + base PostgreSQL + file de jobs | 1 petit VPS | ~10 à 20 €/mois |
| Sources originales | Disque local + sauvegarde | 0 à quelques € |
| Lecteur | hls.js, notre propre interface | 0 |
| Protection | URLs signées Bunny (token) | 0 |

### Pourquoi
- **Pas de paiement à la minute d'encodage ni de lecteur imposé** : c'est la différence avec Stream / Mux, et le gros du gain.
- **L'interface reste 100 % ORIGIN** : Bunny n'est qu'un tuyau, pas une marque ni un lecteur.
- **Réversible** : la couche stockage est abstraite, on peut basculer vers R2, S3 ou un serveur à nous sans toucher au front.
- **Cohérent avec « tout en local »** : le développement et l'encodage se font en local, seule la diffusion est déportée.

### Quand changer d'avis
- Si l'audience est **surtout en Afrique ou Asie** : prendre le réseau Volume (tarif plat), sinon le coût Standard explose.
- Si un partenaire ou ayant droit exige du **DRM** : passer à Mux ou à un service DRM, avec un surcoût important.
- Au-delà de **~10 000 utilisateurs actifs** : réévaluer, notamment l'auto-hébergement et le multi-CDN.

## 5. « Hyper fluide » : ce qui le garantit vraiment

**Vidéo**
- Démarrage sur un débit bas puis montée progressive : **démarrage < 2 s**.
- Segments de 4 à 6 s, images clés alignées entre débits.
- Barre basse de l'échelle à 360p pour les mauvaises connexions mobiles.
- Pré-chargement du programme suivant et de la bande-annonce de la fiche.
- Cible : **taux de rebuffering < 1 %**, mesuré dès le premier jour.

**Interface**
- Affiches et visuels Hero en WebP / AVIF aux bonnes tailles, chargement différé hors écran.
- Données du catalogue servies avec cache (la homepage ne doit pas recalculer à chaque visite).
- Aucun appel bloquant pendant les transitions card → fiche.

**Mesure**
- Remontée côté lecteur : temps de démarrage, coupures, débit moyen, erreurs.
- Sans mesure, « fluide » reste une impression.

## 6. Ce que je ne ferai pas à cette échelle
- Pas de multi-CDN, pas de Kubernetes, pas de microservices.
- Pas de recommandation algorithmique.
- Pas de DRM commercial en V1.
- Pas d'encodage à la volée sur le serveur.

## 7. Points à trancher
1. **D'où viennent tes utilisateurs** (France, Afrique francophone, Canada, DOM-TOM) ? Cela décide du réseau Bunny et du coût.
2. **Combien d'heures par mois** imagines-tu par utilisateur ? Les trois scénarios vont de 12 à 56 $ de diffusion.
3. **Taille du catalogue** à la sortie (10 h ? 100 h ?).
4. **Supabase de Lovable** : on le garde ou on le remplace par l'API locale ? (Point ouvert depuis le benchmark.)
5. **DRM** : confirmes-tu que les URLs signées suffisent pour la V1 ?

## Sources
- [Bunny CDN pricing](https://docs.bunny.net/cdn/pricing) · [Bunny Storage pricing](https://docs.bunny.net/storage/pricing) · [Bunny review 2026](https://www.bitdoze.com/bunny-net-review/)
- [Cloudflare : livrer des vidéos](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/delivering-videos-with-cloudflare/) · [Cloudflare Stream](https://stream.cloudflare.com/) · [Guide R2 + HLS](https://ittybit.com/guides/replace-cloudflare-stream-with-r2)
- [Comparatif Mux / Stream / Bunny](https://www.pkgpulse.com/guides/mux-vs-cloudflare-stream-vs-bunny-stream-video-cdn-2026) · [LeanOps](https://leanopstech.com/blog/mux-vs-cloudflare-stream-vs-cloudfront-2026/)
