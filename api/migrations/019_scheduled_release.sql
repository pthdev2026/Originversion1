-- ORIGIN — programmation éditoriale : sortie planifiée, retrait planifié, annonce « Prochainement ».
-- `published` reste l'unique interrupteur lu par tout le catalogue ; une tâche périodique le bascule aux dates prévues.
ALTER TABLE programs
  ADD COLUMN publish_at   timestamptz,
  ADD COLUMN unpublish_at timestamptz,
  ADD COLUMN announced    boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT program_schedule_coherent CHECK (
    (publish_at IS NULL OR unpublish_at IS NULL OR publish_at < unpublish_at)
    AND (NOT announced OR publish_at IS NOT NULL));
CREATE INDEX programs_publish_at_idx ON programs (publish_at) WHERE publish_at IS NOT NULL;
CREATE INDEX programs_unpublish_at_idx ON programs (unpublish_at) WHERE unpublish_at IS NOT NULL;
