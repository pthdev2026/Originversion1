-- ORIGIN — porte de publication : une sortie planifiée n'est appliquée automatiquement que si TOUS les médias obligatoires sont prêts.
-- Sinon la publication est bloquée (trace + alerte) et ne repart que par une validation éditoriale ou une nouvelle date.
ALTER TABLE programs
  ADD COLUMN release_blocked_at      timestamptz,
  ADD COLUMN release_blocked_missing jsonb NOT NULL DEFAULT '[]'::jsonb;
