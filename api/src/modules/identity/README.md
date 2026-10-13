# Module « identity » — comptes et sessions (étape B2, réalisé)

**Rôle :** savoir QUI est la personne et CE QU'ELLE A LE DROIT de faire.

| Fichier | Rôle |
|---|---|
| `routes.ts` | HTTP : valide la requête (zod), appelle le service, écrit la réponse |
| `service.ts` | Règles : inscription, connexion, verrouillage, réinitialisation, suppression, invitations |
| `repository.ts` | SQL : utilisateurs, sessions, réinitialisations, invitations, journal d'audit |
| `password.ts` | argon2id et politique de mot de passe |
| `session-cookie.ts` | Lecture / écriture du cookie de session |
| `middleware.ts` | `loadSession` (qui est connecté ?), `requireUser`, `requireAdmin` |

Principes : message d'échec unique à la connexion, jetons de session jamais stockés en clair, toute action sensible dans le journal d'audit,
aucune donnée inutile (pas d'IP, pas de user-agent). Voir `docs/SECURITE-BACKEND.md` §7.

Accès : ouvert pour le moment (`REGISTRATION_MODE=open`). Le passage à l'invitation est un réglage (`invite`), le code est déjà en place.
Premier administrateur : `npm run user:create-admin -- adresse@exemple.fr`.
