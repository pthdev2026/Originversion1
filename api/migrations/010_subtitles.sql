-- ORIGIN — sous-titres : une piste WebVTT par (média, langue). Le fichier vit dans storage/subtitles/<playback_id>/<lang>.vtt.
CREATE TABLE subtitle_tracks (
  playback_id text NOT NULL REFERENCES media_assets (playback_id) ON UPDATE CASCADE ON DELETE CASCADE,
  lang        text NOT NULL CHECK (lang ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  label       text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60),
  is_default  boolean NOT NULL DEFAULT false,
  byte_size   integer NOT NULL CHECK (byte_size > 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playback_id, lang)
);
