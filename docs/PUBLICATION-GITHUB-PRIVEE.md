# ORIGIN — Publier et restaurer le code sur GitHub privé (procédure, 30/10/2026)

**Rien de ce document n'a été exécuté.** Aucune publication sans l'accord explicite du propriétaire.

## 1. État des dépôts
| Dépôt | Dossier | Distant | Remarque |
|---|---|---|---|
| Back-end + docs + déploiement | `ORIGIN-plateforme/` | **aucun** | le dossier `app/` (front) est un **autre dépôt** ignoré par celui-ci ; `storage/` est ignoré |
| Front MILLENIUM | `ORIGIN-plateforme/app/` | `pthdev2026/hero-stream-magic` (Lovable) | branche `front/integration-hero` publiée le 30/10 ; **ne pas pousser sur `main` sans accord** |
| Back-office | `~/Desktop/ORIGIN-back-office/` | **aucun** | dépôt de l'agent back-office |

## 2. Contrôles avant publication (déjà passés le 30/10, à REFAIRE juste avant chaque push)
```bash
cd ORIGIN-plateforme
git ls-files | grep -iE '(^|/)\.env($|\.)|\.pem$|\.key$' | grep -v '\.example'   # doit être vide
for p in 'BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY' 'AKIA[0-9A-Z]{16}' 'ghp_[A-Za-z0-9]{30,}' 'sk-[A-Za-z0-9]{32,}'; do
  echo "$p -> $(git grep -lE "$p" $(git rev-list --all) 2>/dev/null | wc -l)"; done                 # 0 partout
git status --short                                                                              # arbre propre
git branch -a                                                                                   # branches attendues
```
Résultat du 30/10 : aucun `.env` ni clé suivi ; aucun motif de secret dans les 305 commits du back-end ; le secret Mux n'apparaît pas dans l'historique. **`api/.env` (droits 600) est ignoré par Git : ne jamais le forcer.**
Même contrôle pour le back-office (`ORIGIN-back-office`) : fait le 30/10, aucun secret.

## 3. Publication (par vous, ou par moi **après votre accord écrit**)
1. Sur GitHub : **New repository** → nom `origin-backend`, **Private**, **sans README, sans licence, sans .gitignore** (dépôt vide). Idem `origin-back-office`.
2. Dans le dossier : `git remote add origin git@github.com:<organisation>/origin-backend.git`.
3. `git push -u origin main` puis `git push origin --tags` (s'il y en a).
4. Réglages du dépôt : protéger `main` (pas de poussée forcée), **activer l'analyse des secrets** (GitHub « secret scanning ») et l'alerte des dépendances.
5. **Clé de déploiement** (lecture seule) pour le futur serveur : `ssh-keygen -t ed25519 -f ~/.ssh/origin_deploy` ; ajouter la **clé publique** dans *Settings › Deploy keys* (cochez lecture seule) ; la clé privée reste sur le serveur.
6. L'intégration continue (`.github/workflows/api.yml`) se lance à la première poussée : vérifier les trois jobs (`verify`, `docker`, `deploy-smoke`).

## 4. Restauration depuis GitHub (poste vierge ou serveur neuf)
```bash
git clone git@github.com:<organisation>/origin-backend.git ORIGIN-plateforme
cd ORIGIN-plateforme/api && npm ci
# Secrets : recréer api/.env et deploy/.env.production depuis le GESTIONNAIRE DE MOTS DE PASSE (jamais depuis Git)
# Front : git clone git@github.com:pthdev2026/hero-stream-magic.git app
# Données : restaurer la base et les fichiers depuis la copie externe (docs/SAUVEGARDE-EXTERNE.md §4)
```

## 5. Filet de secours sans GitHub
`git bundle create ../ORIGIN-plateforme-AAAAMMJJ.bundle --all` puis `git bundle verify` : archive complète du dépôt (créée le 30/10 dans `~/Desktop/ORIGIN-sauvegardes/`, **à copier hors du Mac**, par exemple sur un disque externe).

## Contrôle des secrets refait le 31/10/2026
- **Backend** (`ORIGIN-plateforme`, 10 Mo d'objets git) et **back-office** (`ORIGIN-back-office`, 50 fichiers suivis) : aucun fichier `.env`, clé (`.pem`, `.key`), identifiant `.cred` ni jeton (Mux, Resend, GitHub, AWS, Stripe, clé privée PEM, JWT) dans les fichiers suivis ni dans l'historique ajouté ; seuls les modèles `*.example` sont suivis.
- `.env`, `deploy/.env.production`, `storage/` et `app/` (dépôt front séparé) sont exclus par `.gitignore`.
- Aucun gros média suivi (les plus lourds : images d'intro de ~1,3 Mo).
- Aucun dépôt n'a de remote : **rien n'est publié**. Dès que le propriétaire crée les deux dépôts privés vides et fournit les URL SSH, la procédure de ce document s'applique (`git remote add origin …` puis `git push -u origin --all`), après son accord explicite.
