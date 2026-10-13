-- ORIGIN — envoi de gros fichiers (reprenable) et file de tâches d'encodage.

CREATE TABLE uploads (
  id            uuid PRIMARY KEY,
  user_id       uuid REFERENCES users (id) ON DELETE SET NULL,
  filename      text NOT NULL,
  size_bytes    bigint NOT NULL CHECK (size_bytes > 0),
  offset_bytes  bigint NOT NULL DEFAULT 0 CHECK (offset_bytes >= 0 AND offset_bytes <= size_bytes),
  status        text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'complete', 'aborted')),
  -- Informations de publication fournies à la création (playbackId, kind, title…).
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE media_jobs (
  id             uuid PRIMARY KEY,
  type           text NOT NULL DEFAULT 'encode' CHECK (type IN ('encode')),
  playback_id    text NOT NULL CHECK (playback_id ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  program_slug   text NOT NULL CHECK (program_slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  kind           text NOT NULL CHECK (kind IN ('film', 'serie', 'documentaire')),
  title          text NOT NULL,
  is_demo        boolean NOT NULL DEFAULT false,
  source_path    text NOT NULL,                       -- relatif à storage/videos/sources
  preset         text NOT NULL DEFAULT 'medium',
  status         text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  step           text,                                -- étape en cours (lisible)
  progress       numeric(5, 2) NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  attempts       integer NOT NULL DEFAULT 0,
  max_attempts   integer NOT NULL DEFAULT 3,
  run_after      timestamptz NOT NULL DEFAULT now(),  -- reprise différée après un échec
  locked_by      text,
  locked_until   timestamptz,                         -- « bail » : un travailleur disparu perd son travail à l'expiration
  state          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- points de reprise (qualités déjà encodées…)
  last_error     text,
  upload_id      uuid REFERENCES uploads (id) ON DELETE SET NULL,
  created_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- Une seule tâche active par média : impossible d'encoder deux fois le même contenu en parallèle.
CREATE UNIQUE INDEX media_jobs_one_active_idx ON media_jobs (playback_id) WHERE status IN ('queued', 'running');
CREATE INDEX media_jobs_claim_idx ON media_jobs (status, run_after, created_at);
