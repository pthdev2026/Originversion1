-- ORIGIN — reprise de lecture et « Ma liste » (données propres à chaque compte).
-- Supprimées automatiquement avec le compte (ON DELETE CASCADE) : droit à l'effacement.

CREATE TABLE watch_progress (
  user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  playback_id       text NOT NULL CHECK (playback_id ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  program_slug      text,
  position_seconds  numeric(10, 1) NOT NULL CHECK (position_seconds >= 0),
  duration_seconds  numeric(10, 1) CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  completed         boolean NOT NULL DEFAULT false,
  -- Horodatage envoyé par le navigateur : permet d'ignorer un envoi arrivé en retard (réseau mobile).
  client_ts         bigint NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, playback_id)
);
CREATE INDEX watch_progress_recent_idx ON watch_progress (user_id, updated_at DESC);

CREATE TABLE my_list (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  slug       text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slug)
);
CREATE INDEX my_list_recent_idx ON my_list (user_id, added_at DESC);
