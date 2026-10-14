-- ORIGIN — contenus de marque (l'ident « ORIGIN » diffusé avant un programme).
-- Un contenu de marque est un média comme un autre (même pipeline, même diffusion), mais il n'est jamais listé au catalogue.
ALTER TABLE programs DROP CONSTRAINT programs_kind_check;
ALTER TABLE programs ADD CONSTRAINT programs_kind_check CHECK (kind IN ('film', 'serie', 'documentaire', 'brand'));
ALTER TABLE media_jobs DROP CONSTRAINT media_jobs_kind_check;
ALTER TABLE media_jobs ADD CONSTRAINT media_jobs_kind_check CHECK (kind IN ('film', 'serie', 'documentaire', 'brand'));
