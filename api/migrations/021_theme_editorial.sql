-- Cadrage éditorial d'une thématique : promesse en une ligne et contenu « phare » affiché en premier.
-- Jusqu'ici ces deux informations étaient codées en dur dans le front (themeShowcase).
ALTER TABLE themes
  ADD COLUMN subtitle     text CHECK (subtitle IS NULL OR length(subtitle) BETWEEN 1 AND 160),
  ADD COLUMN featured_slug text REFERENCES programs (slug) ON UPDATE CASCADE ON DELETE SET NULL;
