-- ORIGIN — « Votre espace » : nom, langue, photo de profil, préférences, appareils connectés, thématiques préférées, changement d'e-mail.

-- Appareils : chaque session reçoit un identifiant PUBLIC (le jeton et son empreinte ne sortent jamais) et un libellé approximatif
-- (« Chrome · macOS »). Ni adresse IP, ni agent utilisateur brut : voir identity/device.ts.
ALTER TABLE sessions
  ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN device    text CHECK (device IS NULL OR char_length(device) <= 80);
CREATE UNIQUE INDEX sessions_public_id_idx ON sessions (public_id);

-- Profil : langue de l'interface et photo. Photo = fichier rangé sous une clé aléatoire (storage/avatars/<clé>) ou avatar prédéfini.
ALTER TABLE users
  ADD COLUMN locale        text NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr', 'en')),
  ADD COLUMN avatar_kind   text CHECK (avatar_kind IS NULL OR avatar_kind IN ('preset', 'photo')),
  ADD COLUMN avatar_preset smallint CHECK (avatar_preset IS NULL OR avatar_preset BETWEEN 0 AND 7),
  ADD COLUMN avatar_key    text CHECK (avatar_key IS NULL OR avatar_key ~ '^[a-f0-9]{32}\.(jpg|png|webp)$'),
  ADD COLUMN avatar_zoom   real NOT NULL DEFAULT 1 CHECK (avatar_zoom BETWEEN 1 AND 4),
  ADD CONSTRAINT avatar_is_consistent CHECK (
    (avatar_kind IS NULL     AND avatar_preset IS NULL     AND avatar_key IS NULL) OR
    (avatar_kind = 'preset'  AND avatar_preset IS NOT NULL AND avatar_key IS NULL) OR
    (avatar_kind = 'photo'   AND avatar_preset IS NULL     AND avatar_key IS NOT NULL));

-- Préférences d'un compte (lecture, notifications, accessibilité) : un document validé par l'API ; les valeurs absentes = valeurs par défaut.
CREATE TABLE user_preferences (
  user_id    uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Thématiques préférées (choisies à l'inscription ou plus tard) : elles alimentent « Pour vous » dès le premier jour.
CREATE TABLE user_themes (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  theme_slug text NOT NULL REFERENCES themes (slug) ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY (user_id, theme_slug)
);

-- Changement d'adresse e-mail : un code à 6 chiffres envoyé à la NOUVELLE adresse (empreinte seulement), 5 essais, 15 minutes.
CREATE TABLE email_changes (
  user_id    uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  new_email  text NOT NULL CHECK (new_email = lower(btrim(new_email))),
  code_hash  text NOT NULL,
  attempts   integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
