# ORIGIN — première intégration : la Hero uniquement

## Compréhension et périmètre
ORIGIN est l’expérience de streaming de PTH — Partage Ton Histoire : des récits humains de tension, de reconstruction et de transformation. La foi est son fondement éditorial, sans esthétique religieuse stéréotypée. L’interface doit préparer une rencontre avec une histoire, pas simplement afficher des vidéos.

Lovable réalise uniquement l’interface et ses interactions. Claude Code conserve la responsabilité des comptes, des APIs, des paiements et de la diffusion vidéo. Aucun service connecté ni backend ne sera ajouté.

## Reproduction de la maquette
- Image cinématographique plein écran : personnages au centre, lumière du coucher de soleil à droite, zone sombre à gauche pour la lecture.
- Navigation discrète en haut : burger à gauche, ORIGIN centré indépendamment des autres éléments, recherche et accès au compte à droite.
- Production initiale : « Deux fois oui », titre sur deux lignes, signature « ORIGIN ORIGINAL », accroche et synopsis de la maquette.
- Deux actions : « Regarder maintenant » en champagne et « Voir la bande-annonce » en contour discret.
- Sélection horizontale intégrée au bas de la Hero : cinq programmes issus de la maquette, visuels 16:9, titres, catégories et indication de sélection.
- Index vertical discret à droite ; proportions, espaces et placement conformes à la référence.
- Aucune section Top 10, aucun catalogue supplémentaire, aucune ouverture immersive ni pied de page.

## Interactions et adaptation
La sélection d’une miniature ou d’un numéro change l’image, le titre et le synopsis, sans déplacer les éléments. Transition douce et respect de la réduction des animations. Navigation au clavier, indication de focus et défilement horizontal accessibles.

Sur petit écran, conserver le logo centré, réduire la navigation aux accès essentiels et adapter le cadrage pour préserver les personnages et la lisibilité. La sélection de programmes reste accessible en bas.

Les actions de lecture et de compte resteront des points d’intégration : aucune vidéo, connexion ou session réelle ne sera simulée.

## Visuels et limites à confirmer
La maquette sert de référence, et ne sera pas affichée comme une image de page complète. En l’absence des photographies sources, des images de démonstration pourront être générées dans une composition proche ; elles ne seront pas les photos exactes de la maquette.

Le logo ORIGIN officiel et les logos-titres n’ont pas encore été fournis. Utiliser provisoirement un nom typographique, sans prétendre recréer le véritable logo ; remplacer par les fichiers officiels dès réception. Les programmes autres que le premier auront des synopsis de démonstration clairement séparés des données définitives.

## Organisation technique
- Conserver React, TypeScript et le framework existant, sans migration.
- Afficher la Hero à l’adresse principale `/`.
- Séparer les données typées des programmes, la navigation, la présentation de la Hero et la sélection de contenus.
- Prévoir des champs pour les images, logos-titres, métadonnées et futures destinations de lecture.
- Centraliser les couleurs officielles et les styles partagés ; prévoir les états de visuels manquants et de liste vide.
- Ajouter les métadonnées ORIGIN et vérifier le rendu, le changement de programme et l’absence d’erreurs.

## GitHub et intégration locale
La synchronisation passe par la connexion GitHub du projet dans Lovable. Si elle n’est pas déjà configurée, elle devra être activée dans l’éditeur. Claude Code pourra ensuite récupérer le code du dépôt et intégrer progressivement les éléments dans l’application locale. Aucune synchronisation bidirectionnelle automatique ni opération d’écrasement de l’application locale ne sera mise en place.

## Progression et validation
1. Valider cette analyse et les limites concernant les visuels sources.
2. Créer uniquement la Hero et les données de démonstration séparées.
3. Vérifier les proportions, couleurs, typographies et interactions sur ordinateur et mobile.
4. Présenter le résultat pour validation avant tout autre bloc.