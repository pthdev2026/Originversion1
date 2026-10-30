-- ORIGIN — repères de lecture saisis par l'éditorial : début/fin de l'intro (« Passer l'intro »)
-- et début du générique (« Épisode suivant »). Tous facultatifs, en secondes depuis le début du média.
ALTER TABLE media_assets
  ADD COLUMN intro_start_seconds   numeric(10, 3) CHECK (intro_start_seconds   IS NULL OR intro_start_seconds   >= 0),
  ADD COLUMN intro_end_seconds     numeric(10, 3) CHECK (intro_end_seconds     IS NULL OR intro_end_seconds     > 0),
  ADD COLUMN credits_start_seconds numeric(10, 3) CHECK (credits_start_seconds IS NULL OR credits_start_seconds > 0),
  ADD CONSTRAINT intro_markers_coherent CHECK (
    (intro_start_seconds IS NULL) = (intro_end_seconds IS NULL)
    AND (intro_start_seconds IS NULL OR intro_start_seconds < intro_end_seconds)
    AND (intro_end_seconds IS NULL OR credits_start_seconds IS NULL OR intro_end_seconds <= credits_start_seconds));
