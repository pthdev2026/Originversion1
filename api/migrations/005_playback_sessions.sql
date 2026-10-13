-- ORIGIN — mesure de lecture (qualité d'expérience). Aucune donnée personnelle :
-- pas d'adresse IP, pas d'identifiant de compte, pas de user-agent brut.

CREATE TABLE playback_sessions (
  id              uuid PRIMARY KEY,
  playback_id     text NOT NULL CHECK (playback_id ~ '^[a-z0-9][a-z0-9-]*$'),
  started_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Délai entre l'ouverture du lecteur et la première image jouée.
  startup_ms      integer CHECK (startup_ms IS NULL OR startup_ms BETWEEN 0 AND 300000),
  rebuffer_count  integer NOT NULL DEFAULT 0 CHECK (rebuffer_count >= 0),
  rebuffer_ms     integer NOT NULL DEFAULT 0 CHECK (rebuffer_ms >= 0),
  watch_seconds   numeric(10, 1) NOT NULL DEFAULT 0 CHECK (watch_seconds >= 0),
  -- Secondes regardées par hauteur de rendu : {"360": 12.5, "720": 40}
  level_seconds   jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_height      integer,
  fatal_error     text,
  device          text NOT NULL CHECK (device IN ('mobile', 'tablet', 'desktop')),
  browser         text NOT NULL,
  engine          text NOT NULL CHECK (engine IN ('hlsjs', 'native')),
  connection      text
);

CREATE INDEX playback_sessions_started_idx ON playback_sessions (started_at DESC);
CREATE INDEX playback_sessions_playback_idx ON playback_sessions (playback_id, started_at DESC);
