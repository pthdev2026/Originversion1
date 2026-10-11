-- ORIGIN — schéma initial : catalogue lisible et médias encodés.

CREATE TABLE programs (
  slug        text PRIMARY KEY CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  kind        text NOT NULL CHECK (kind IN ('film', 'serie', 'documentaire')),
  title       text NOT NULL,
  synopsis    text,
  is_demo     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Un média encodé et lisible. playback_id suit la convention du front :
-- « <slug> » pour un film, « <slug>-<épisode> » pour un épisode de série.
CREATE TABLE media_assets (
  playback_id       text PRIMARY KEY CHECK (playback_id ~ '^[a-z0-9][a-z0-9-]*$'),
  program_slug      text NOT NULL REFERENCES programs (slug) ON UPDATE CASCADE ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
  storage_path      text NOT NULL,
  duration_seconds  numeric(10, 3) CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  source_width      integer,
  source_height     integer,
  renditions        jsonb NOT NULL DEFAULT '[]'::jsonb,
  preset            text,
  encode_seconds    numeric(10, 1),
  encoded_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ready_requires_duration CHECK (status <> 'ready' OR duration_seconds IS NOT NULL)
);

CREATE INDEX media_assets_program_idx ON media_assets (program_slug);
CREATE INDEX media_assets_ready_idx ON media_assets (playback_id) WHERE status = 'ready';
