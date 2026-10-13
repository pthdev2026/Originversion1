# ORIGIN — Analyse globale (13/10/2026)

Statut : état **mesuré** du code et des services au 13/10/2026. Les estimations d'effort sont des ordres de grandeur
(un développeur assisté par IA) et doivent être revues avec le périmètre réellement retenu.

## 1. Verdict

ORIGIN est aujourd'hui un **prototype crédible de la partie « regarder »** : une vitrine très soignée, une lecture vidéo
réelle (HLS adaptatif, URLs signées, base PostgreSQL) et un pipeline d'encodage. Ce n'est pas encore une plateforme :
**personne ne peut s'y connecter, chercher, reprendre une lecture ou payer, et rien n'est hébergé en ligne.**
Il manque la couche « produit » (comptes, catalogue pilotable, parcours) et la couche « exploitation » (hébergement, CDN,
sauvegardes, supervision, juridique). Les fondations techniques, elles, sont saines.

## 2. État par couche (mesuré)

| Couche | Ce qui existe | Maturité |
|---|---|---|
| **Vitrine / design** | Hero, Top 10, 11 sections de catalogue, page programme, intro « Prisme » (code). Build OK (6,6 Mo, 38 images) | ⬛⬛⬛⬛⬜ |
| **Lecture vidéo** | hls.js, 4 qualités, contrôles, qualité auto/manuelle, plein écran, clavier, états d'erreur honnêtes | ⬛⬛⬛⬜⬜ |
| **API** | 495 lignes : santé, lecture signée, liste des programmes lisibles, distribution HLS avec Range | ⬛⬛⬜⬜⬜ |
| **Base de données** | PostgreSQL 17, 2 tables (`programs`, `media_assets`), migrations | ⬛⬛⬜⬜⬜ |
| **Pipeline vidéo** | Script FFmpeg → HLS multi-débits, enregistrement en base | ⬛⬛⬜⬜⬜ |
| **Comptes / droits** | Aucun | ⬜⬜⬜⬜⬜ |
| **Recherche / reco** | Filtre local sur 5 programmes de la Hero | ⬛⬜⬜⬜⬜ |
| **Paiement / abonnement** | Aucun | ⬜⬜⬜⬜⬜ |
| **Contenu** | 2 vidéos jouables (un clip de 15 s), ~60 fiches de démonstration | ⬛⬜⬜⬜⬜ |
| **Hébergement / CDN** | Aucun : tout tourne sur un Mac | ⬜⬜⬜⬜⬜ |
| **Exploitation** | Aucune supervision, sauvegarde, CI/CD ; mesure de lecture rangée sur une branche | ⬛⬜⬜⬜⬜ |
| **Tests** | API : 12 (6 nécessitent la base) ; front : 4 | ⬛⬛⬜⬜⬜ |

## 3. Ce qui est solide

- Lecture **réellement branchée** de bout en bout et vérifiée (Hero → fiche → lecteur → image).
- Pas de faux contenu : « pas encore disponible » quand il n'y a pas de média.
- Séparation propre : front / API / base / pipeline ; le front accepte un backend sans refonte.
- Protection de base du média (jetons signés), pas de sortie de dossier possible, tests dédiés.
- Choix de coût cohérents avec l'objectif des 1 000 utilisateurs (≈ 50–150 $/mois, voir `PLAN-1000-UTILISATEURS.md`).

## 4. Ce qui manque, par ordre de nécessité

### A. Indispensable pour 1 000 vrais utilisateurs (« socle »)

| # | Chantier | Pourquoi | Effort indicatif |
|---|---|---|---|
| A1 | **Hébergement et mise en ligne** (VPS, domaine, HTTPS, CDN Bunny, stockage objet) | Sans ça, personne d'autre que toi ne peut regarder | 1 à 2 semaines |
| A2 | **Comptes** (inscription, connexion, session, réinitialisation) | Condition de tout le reste : historique, liste, droits | 1 à 2 semaines |
| A3 | **Catalogue réel en base + espace d'administration** (créer un programme, uploader, encoder, publier) | Aujourd'hui le catalogue est dans le code : chaque ajout = une livraison | 2 à 3 semaines |
| A4 | **Vrais contenus encodés** (sources HD, sous-titres) | Un clip de 15 s ne valide pas l'expérience | Dépend de toi (production) |
| A5 | **Reprendre la lecture + « Ma liste »** | Attente de base d'un streaming, section 08 du brief | 1 semaine |
| A6 | **Recherche réelle** (titres, thèmes, formats) | Le filtre actuel ne couvre que la Hero | 3 à 5 jours |
| A7 | **Mesure de lecture** (démarrage, coupures, erreurs) | Seul moyen de prouver « hyper fluide » | 3 à 5 jours (branche prête) |
| A8 | **Supervision et sauvegardes** (logs, alertes, sauvegarde base et sources) | Une panne sans alerte ni sauvegarde, c'est un projet qui s'arrête | 3 à 5 jours |
| A9 | **Juridique** : CGU, confidentialité (RGPD), mentions, droits des images et des personnes | Bloquant avant publication ; plusieurs visuels actuels ne sont pas libres de droits | Hors code |
| A10 | **Mobile propre** (lecture, plein écran, orientation, contrôles tactiles) | Une grande part de l'audience 24–35 ans | 1 semaine |

### B. Important dès qu'on a de l'audience

| # | Chantier | Effort |
|---|---|---|
| B1 | Sous-titres (WebVTT) et langues audio | 1 semaine |
| B2 | Épisodes : « épisode suivant », lecture automatique, saisons | 1 semaine |
| B3 | Page d'accueil dynamique (sections pilotées par la base) | 1 à 2 semaines |
| B4 | Emails transactionnels (confirmation, mot de passe) | 2 à 3 jours |
| B5 | Analytics d'usage (parcours, rétention) | 1 semaine |
| B6 | Accessibilité complète (clavier, lecteurs d'écran, contrastes) | 1 semaine |
| B7 | Abonnement / paiement, **si** modèle payant | 2 à 3 semaines |
| B8 | Droit de qualité par compte (4K réservée) | 3 à 5 jours |

### C. Ce que fait Netflix et qu'il ne faut **pas** viser à 1 000 utilisateurs

| Fonction Netflix | Pourquoi l'écarter maintenant |
|---|---|
| CDN maison (Open Connect), multi-CDN | Un CDN loué suffit largement |
| Recommandation algorithmique personnalisée | Pas assez de données ; une sélection éditoriale honnête vaut mieux |
| Encodage par plan (per-shot, VMAF) | Gain réel seulement à grande échelle |
| DRM multi-plateformes (Widevine, FairPlay, PlayReady) | Coût et complexité élevés ; les URLs signées suffisent en V1 |
| Applications TV, consoles, téléchargement hors ligne | Après validation de la traction |
| Microservices, A/B tests permanents, personnalisation des visuels | Disproportionnés |

## 5. Risques identifiés

| Risque | Gravité | Atténuation |
|---|---|---|
| **Droits des images et des personnes** : visuels du catalogue Lovable (personnalités réelles), références trouvées ailleurs dans les vidéos Minimax | Élevée | Inventaire des images, autorisations écrites, remplacement par des originaux |
| Dépendance à Lovable pour le front (synchronisation GitHub, historique à ne pas réécrire) | Moyenne | Branches d'intégration, PR relues avant fusion |
| Tout est sur un seul Mac (base, vidéos, code) | Élevée | Hébergement + sauvegardes (A1, A8) |
| Aucune mesure de qualité réelle | Moyenne | A7 avant le lancement |
| Contenu insuffisant : l'expérience dépend du catalogue réel | Élevée | Calendrier éditorial avant la mise en ligne |
| Outil de déploiement du front par défaut sur Cloudflare Workers | Faible | Choisir la cible d'hébergement (A1) |
| Bundle de la page programme : 594 Ko (hls.js inclus) | Faible | Charger hls.js uniquement à l'ouverture du lecteur |

## 6. Chemin vers 1 000 utilisateurs

| Étape | Contenu | Durée indicative | Résultat |
|---|---|---|---|
| **M1 — Fondations en ligne** | A1, A8, domaine, HTTPS, CDN, sauvegardes | 2 semaines | Les vidéos se lisent depuis Internet |
| **M2 — Comptes et parcours** | A2, A5, A6, B4, A10 | 3 à 4 semaines | On peut s'inscrire, chercher, reprendre, garder une liste |
| **M3 — Catalogue pilotable** | A3, B2, B1, B3 | 3 à 4 semaines | Un contenu se publie sans développeur |
| **M4 — Qualité et conformité** | A7, B6, A9, intro et identité sonore | 2 semaines | Mesure, accessibilité, juridique, signature |
| **M5 — Bêta fermée** | 50 à 100 invités, correction | 2 à 4 semaines | Retours réels |
| **M6 — Ouverture** | Montée vers 1 000 | continu | Premiers utilisateurs |

Total : **≈ 3 à 4 mois** pour un socle sérieux, avec un contenu réel prêt et les droits réglés. Le facteur qui décale le plus
n'est pas le code : c'est la **production des contenus** et les **droits**.

## 7. Décisions attendues de toi

1. **Modèle** : gratuit, sur invitation, ou abonnement (change B7 et le juridique).
2. **Audience géographique** (France, Afrique francophone, Canada…) : choix du CDN et du coût.
3. **Contenus de lancement** : combien d'heures, quels programmes, quelles sources.
4. **Droits** : qui valide l'usage des images de personnalités et de Chantal en animation IA.
5. **Hébergement** : Cloudflare, VPS en Europe, ou autre.
6. **Fusion de la PR** : quand synchroniser Lovable avec la lecture réelle.
