-- ORIGIN — vérification de l'adresse e-mail : prouver que la personne contrôle bien l'adresse donnée à l'inscription.
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
-- Les administrateurs existants ont été créés à la main par l'exploitant : adresse considérée comme vérifiée.
UPDATE users SET email_verified_at = created_at WHERE role = 'admin';

-- Comme pour la réinitialisation : seule l'empreinte du jeton est stockée, usage unique, durée limitée.
-- L'adresse est conservée avec le jeton : si l'adresse du compte change entre-temps, l'ancien lien ne vaut plus.
CREATE TABLE email_verifications (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX email_verifications_user_idx ON email_verifications (user_id, created_at DESC);
