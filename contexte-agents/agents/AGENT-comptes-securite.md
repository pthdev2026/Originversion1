# Agent — Comptes, sécurité, RGPD

**Mission** : que l'identité des spectateurs et des administrateurs soit sûre, simple et conforme, sans jamais fuiter d'information.

## Périmètre
`api/src/modules/identity/` (`service.ts`, `repository.ts`, `routes.ts`, `middleware.ts`, `password.ts`, `totp.ts`, `session-cookie.ts`), `privacy/`, `platform/http/` (limites, CSRF, en-têtes, erreurs), `platform/mail.ts`, migrations 003, 011, 012, `docs/SECURITE-BACKEND.md`.

## Invariants
- Jamais de mot de passe, jeton, secret 2FA ou code de secours en clair en base, en journal ou en réponse (export compris).
- Connexion : **message d'échec unique**, temps de calcul constant, verrouillage 15 min après 5 échecs (mots de passe et codes 2FA).
- Réinitialisation : réponse **identique** (contenu et délai) que le compte existe ou non ; l'envoi d'e-mail est « sans attendre » et ses erreurs sont journalisées, jamais propagées.
- 2FA : TOTP RFC 6238 (±1 pas), anti-rejeu (`last_step`), codes de secours à usage unique, secret chiffré AES-256-GCM avec `AUTH_ENCRYPTION_KEY` ; sans cette clé en production, l'enrôlement est refusé (503).
- `REQUIRE_ADMIN_2FA=true` : `/api/admin/*`, `/uploads/*`, `/files/*` refusés (403 `two_factor_required`) aux administrateurs sans 2FA ; `/api/me/2fa/*` reste accessible.
- Cookie : `httpOnly`, `Secure` + `__Host-` en production, `SameSite=Lax`, même site que le front.
- Argon2 : au plus 2 hachages simultanés (sinon les fils de Node sont monopolisés) ; `UV_THREADPOOL_SIZE=16`.
- Le socle (`platform/`) ne dépend d'aucun module : le type `AuthenticatedUser` y est défini.
- Droit d'accès/effacement : `GET /api/me/export`, `POST /api/me/delete` ; conservation limitée (entretien horaire).

## Chantiers ouverts
1. Valider les e-mails sur un vrai domaine (Resend, SPF/DKIM) ; page `/reinitialiser` et `/verifier-email` côté front.
2. 2FA : écrans côté front (aucun aujourd'hui).
3. Décider : 2FA obligatoire pour les spectateurs ? passage à `REGISTRATION_MODE=invite` ?
4. Veille de vulnérabilités en CI (Dependabot, `npm audit`).
5. Journal d'audit d'exploitation pour la réinitialisation 2FA par l'exploitant (événement `two_factor_reset_by_operator`).

## Tests de référence
`identity/identity.test.ts`, `identity/totp.test.ts`, `identity/two-factor.test.ts`, `identity/password.test.ts`, `privacy/privacy.test.ts`, `robustness.test.ts`.

## Terminé quand
Test de non-fuite (le cas « compte inexistant » est indiscernable) · aucun secret dans les journaux · fiche `08-…` à jour · contrat à jour.

## Ne pas toucher
Les écrans du front, le pipeline vidéo, la logique éditoriale.
