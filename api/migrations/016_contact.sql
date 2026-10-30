-- ORIGIN — « Nous contacter » : messages envoyés par les visiteurs (avec ou sans compte).
-- Donnée personnelle (nom, adresse, texte libre) : conservée au plus RETENTION_AUDIT_DAYS jours (entretien horaire).
CREATE TABLE contact_messages (
  id          uuid PRIMARY KEY,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email       text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  topic       text NOT NULL DEFAULT 'general' CHECK (topic IN ('general', 'account', 'playback', 'content', 'press', 'other')),
  message     text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 4000),
  user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'handled')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  handled_at  timestamptz
);
CREATE INDEX contact_messages_status_idx ON contact_messages (status, created_at DESC);
