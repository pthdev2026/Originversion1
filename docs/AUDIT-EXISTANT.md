# ORIGIN — Audit de l'existant (front Lovable)

Dépôt : `git@github.com:pthdev2026/hero-stream-magic.git` · branche `main` · 47 commits · cloné dans `app/`
Périmètre : lecture du code uniquement. **Rien n'a été installé, lancé ni modifié.** Le rendu visuel n'a pas été vérifié.

---

## 1. Stack

| Élément | Constat |
|---|---|
| Framework | **TanStack Start** (React 19, TanStack Router, TanStack Query), SSR |
| Build | Vite 8, Nitro (cible **Cloudflare** par défaut via la config Lovable) |
| Style | Tailwind CSS v4, composants shadcn / Radix |
| Langage | TypeScript |
| Tests | Vitest : 1 seul test (routage de `/`) |
| Gestionnaire | `bun.lock` présent ; Bun absent du Mac, Node 24 + npm disponibles |
| Lien Lovable | `@lovable.dev/vite-tanstack-config` enveloppe toute la config Vite ; `src/lib/lovable-error-reporting.ts` |
| Backend | **Aucun** (pas de Supabase, pas d'API, pas de base) |

## 2. Périmètre livré

| Section | État |
|---|---|
| 01 Hero | ✅ Présente (5 programmes de démo, sélecteur, recherche, menu, compte en panneau « bientôt ») |
| 02 Top 10 | ✅ Présente (10 programmes de démo) |
| 03 Ce qui pourrait vous plaire | ✅ Présente (5 affiches, flèches, tactile) — navigation clavier restante au roadmap |
| 04 À découvrir sur ORIGIN | ⬜ Pas de composant (le commit « Ajouté la section 4 affichage » n'a pas laissé de fichier correspondant : à vérifier) |
| 05 à 09 | ⬜ Absentes |
| Fiche production, lecteur, catégories | ⬜ Absents : une seule route `/` |

## 3. Points solides à préserver

- **Données séparées de la présentation** : `src/lib/origin-programs.ts`, `origin-top-ten.ts`, `origin-suggestions.ts`, typés, avec `isDemo: true`. Conforme au brief.
- **`playbackUrl` et `trailerUrl` optionnels** : le brancher à une vraie source ne demande pas de refaire l'UI.
- **Honnêteté d'interface** : compte, lecture et bande-annonce affichent « pas encore disponible » au lieu de simuler.
- **Réduction des animations** respectée dans la Hero (`prefers-reduced-motion`).
- **Accessibilité de base** : `aria-label`, `aria-current`, `aria-live`, navigation clavier du carrousel Hero.
- **Composants séparés par section** (`components/origin/`).
- **Aucun couplage backend** : on peut brancher notre API sans démonter quoi que ce soit.

## 4. Écarts avec le brief et risques

| # | Constat | Gravité | Pourquoi |
|---|---|---|---|
| 1 | **Polices : Michroma** (titres, wordmark), Montserrat, Barlow Condensed | 🟠 À arbitrer | Le brief demande Manrope + Plus Jakarta Sans et écarte une typo « futuriste caricaturale ». Michroma est large et futuriste. Il est possible que ce soit validé par les maquettes : **les maquettes priment** |
| 2 | Cible de déploiement **Cloudflare** par défaut | 🟠 | Incompatible avec « tout en local » et avec un VPS ; il faudra choisir le preset Nitro (Node) |
| 3 | **Polices chargées depuis Google Fonts** | 🟡 | Dépendance externe et confidentialité : à héberger localement en production |
| 4 | **Historique relié à Lovable** (`AGENTS.md`) | 🟠 | Les commits poussés sur `main` se synchronisent dans Lovable. Pas de réécriture d'historique (force push, rebase, amend) |
| 5 | **Gestionnaire de paquets** : `bun.lock` mais pas de Bun installé | 🟡 | Choisir : installer Bun, ou régénérer un `package-lock.json`. Éviter d'avoir les deux |
| 6 | `src/components/ui/` : ~45 composants shadcn, dont beaucoup inutilisés (recharts, calendrier, etc.) | 🟡 | Dépendances inutiles ; nettoyage à faire plus tard, sans urgence |
| 7 | `origin-hero.tsx` : Hero + recherche + menu + panneaux dans un fichier de 90 lignes très denses | 🟡 | À scinder avant d'ajouter la fiche et le lecteur |
| 8 | Lecture lancée par `window.location.assign(playbackUrl)` | 🟡 | À remplacer par une route interne `/watch/:id` |
| 9 | Modèle `OriginProgram` incomplet vs brief | 🟡 | Manquent : durée, type de production, affiche verticale / horizontale, collection, épisodes, chapitres, métadonnées de lecture |
| 10 | Un seul test automatisé | 🟡 | Aucun filet de sécurité pour les futures évolutions |
| 11 | Le projet s'appelle `tanstack_start_ts` dans `package.json` | ⚪ | Cosmétique, à renommer |

## 5. Ce que je n'ai pas vérifié

- Le projet **s'installe-t-il et se lance-t-il** en local ? (`npm i`, `npm run dev`, `npm run build`)
- Le **rendu réel** par rapport aux maquettes finales (que je n'ai pas encore).
- La section 04 : présente dans l'historique Git ou non ?
- Les performances (poids des images : 90 à 310 Ko chacune, 2,1 Mo au total, plutôt sain).

## 6. Prochaines étapes proposées (sans rien modifier avant validation)

1. **Installer et lancer en local** pour vérifier que le projet tourne (je ne touche pas au code).
2. **Décision** sur le gestionnaire de paquets (Bun ou npm) et la cible de déploiement.
3. **Réception des maquettes finales** pour trancher la question des polices.
4. Définir le **contrat de données** (`Program`, `Season`, `Episode`, `PlaybackInfo`) partagé entre front et API.
5. Premier lot back-end : API catalogue + PostgreSQL + stockage, en conservant le front inchangé.
