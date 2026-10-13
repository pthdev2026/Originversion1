-- ORIGIN — identité : comptes, sessions, réinitialisation, invitations, journal d'audit.
-- Aucune donnée inutile : pas d'adresse IP, pas de user-agent brut.

CREATE TABLE users (
  id                  uuid PRIMARY KEY,
  email               text NOT NULL,
  password_hash       text NOT NULL,
  display_name        text,
  role                text NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'admin')),
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  failed_login_count  integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until        timestamptz,
  last_login_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- L'adresse est toujours stockée normalisée (minuscules) : l'unicité est donc exacte.
  CONSTRAINT email_is_normalized CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254)
);
CREATE UNIQUE INDEX users_email_idx ON users (email);

-- Le jeton de session n'est JAMAIS stocké : seulement son empreinte SHA-256.
-- Une fuite de la base ne permet donc pas de se faire passer pour quelqu'un.
CREATE TABLE sessions (
  token_hash   text PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE password_resets (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX password_resets_user_idx ON password_resets (user_id);

-- Invitations : prêtes pour passer plus tard d'un accès ouvert à un accès sur invitation.
CREATE TABLE invitations (
  code_hash   text PRIMARY KEY,
  created_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  max_uses    integer NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  use_count   integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  CONSTRAINT invitation_not_overused CHECK (use_count <= max_uses)
);

-- Journal d'audit : QUI a fait QUOI et QUAND. user_id passe à NULL si le compte est supprimé (RGPD).
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  event       text NOT NULL,
  request_id  text,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_user_idx ON audit_log (user_id, created_at DESC);
CREATE INDEX audit_log_event_idx ON audit_log (event, created_at DESC);
