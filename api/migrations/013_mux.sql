-- ORIGIN — Mux : un média peut être préparé, stocké et diffusé par Mux au lieu de notre chaîne FFmpeg + Bunny.
--
-- `provider` dit QUI possède les fichiers : 'self' (notre pipeline, rendus dans storage/ ou chez Bunny) ou 'mux'.
-- Pour un média Mux, `provider_playback_id` est l'identifiant de lecture Mux (stream.mux.com/<id>.m3u8) et
-- `provider_policy` sa politique d'accès fixée à la création (public = lien sans jeton ; signed = jeton JWT obligatoire).
ALTER TABLE media_assets
  ADD COLUMN provider             text NOT NULL DEFAULT 'self' CHECK (provider IN ('self', 'mux')),
  ADD COLUMN provider_asset_id    text,
  ADD COLUMN provider_playback_id text,
  ADD COLUMN provider_policy      text CHECK (provider_policy IS NULL OR provider_policy IN ('public', 'signed')),
  ADD CONSTRAINT mux_asset_has_playback_id CHECK (provider <> 'mux' OR (provider_playback_id IS NOT NULL AND provider_policy IS NOT NULL));

-- Suivi des envois vers Mux (l'envoi lui-même va du navigateur vers Mux ; notre serveur ne garde que l'état).
-- On NE stocke PAS l'adresse d'envoi (quiconque la connaît peut déposer un fichier) : elle n'est renvoyée qu'à la création.
CREATE TABLE mux_uploads (
  id             uuid PRIMARY KEY,
  mux_upload_id  text NOT NULL UNIQUE,
  mux_asset_id   text,
  playback_id    text NOT NULL CHECK (playback_id ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  program_slug   text NOT NULL CHECK (program_slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  kind           text NOT NULL CHECK (kind IN ('film', 'serie', 'documentaire')),
  title          text NOT NULL,
  is_demo        boolean NOT NULL DEFAULT false,
  status         text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'processing', 'ready', 'failed', 'canceled')),
  error          text,
  created_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);
-- Un seul envoi actif par média : impossible de lancer deux préparations simultanées du même contenu.
CREATE UNIQUE INDEX mux_uploads_one_active_idx ON mux_uploads (playback_id) WHERE status IN ('waiting', 'processing');
CREATE INDEX mux_uploads_status_idx ON mux_uploads (status, updated_at);
