-- ORIGIN — double authentification (TOTP, RFC 6238) et codes de secours.
ALTER TABLE users ADD COLUMN two_factor_enabled boolean NOT NULL DEFAULT false;

-- Le secret est chiffré (AES-256-GCM) avec une clé qui n'est PAS dans la base : une fuite de la base seule ne suffit pas.
-- `enabled_at` NULL = enrôlement commencé mais pas confirmé. `last_step` empêche de rejouer un code déjà utilisé.
CREATE TABLE user_totp (
  user_id     uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  secret_enc  text NOT NULL,
  enabled_at  timestamptz,
  last_step   bigint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Codes de secours à usage unique (affichés une seule fois) : seule l'empreinte est stockée.
CREATE TABLE user_recovery_codes (
  code_hash  text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  used_at    timestamptz
);
CREATE INDEX user_recovery_codes_user_idx ON user_recovery_codes (user_id);
