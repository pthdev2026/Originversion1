# Architecture front — compte, session et profils

Tout ce qui touche à la création de compte, à la connexion, à la session et aux profils vit dans `app/src/features/account/`.
Les fichiers de `app/src/routes/` ne contiennent plus que la déclaration de la route (titre, `component`) : le dessin et la logique sont ici.

```
src/features/account/
  auth/       connexion, inscription, mot de passe oublié, bienvenue + gabarit commun (auth-layout)
  session/    session (cookie), espace de l'utilisateur, Ma liste, Continuer, export du compte
  profiles/   écran « Qui regarde ? » : cadre, carrés, hook de profils, teintes
  pages/      pages de l'espace : Mon compte, Ma liste, Continuer, Paramètres + coquille et dialogues
```

## Profils (`profiles/`)
| Fichier | Rôle |
|---|---|
| `types.ts` | `Profile`, `MAX_PROFILES` (5, comme Netflix) |
| `use-profiles.ts` | **seule source de données** : aujourd'hui un profil (nom + avatar du compte) ; l'aperçu à 4 profils (`?apercu=profils`) n'existe qu'en développement |
| `profile-tint.ts` | couleur et teinte d'un profil (préréglage, sinon couleur stable tirée du nom) |
| `profile-tile.tsx` | `ProfileTile` (carré plein) et `AddTile` (carré à lignes) |
| `profile-picker.tsx` | la page : cadre de verre, mode « Gérer », fond teinté par le carré survolé |

**Dessin.** Un cadre de verre contient des carrés : **plein** = un profil (fonds de couleurs floues tirés de l'avatar, numéro en police à chasse fixe, nom en bas à gauche) ;
**à lignes** = emplacement libre (transparent, hachuré). Un profil : un carré plein + un carré à lignes ; 3–4 profils : autant de carrés pleins puis le carré à lignes ;
5 profils : plus de carré à lignes. Téléphone : deux colonnes. Styles : bloc « Qui regarde ? » de `src/styles.css` (préfixe `.pk-`).

**Brancher plusieurs profils.** Le back-end ne gère qu'un profil par compte : demande ouverte dans `docs/API-REQUESTS.md` (« Profils multiples », jusqu'à 5).
Quand elle sera livrée, seul `use-profiles.ts` change (liste, création, suppression) ; `AddTile` devient actif.

## Règles
- Une route = une ligne de plus dans `src/routes/` qui importe sa page depuis `features/account/…`.
- Rien de simulé : un profil d'exemple n'existe que derrière `import.meta.env.DEV` et `?apercu=profils`.
- Les images, textes et boutons de la page programme restent figés (`docs/PAGE-ATTERRISSAGE-FILM.md`).
