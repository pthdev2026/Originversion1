-- ORIGIN — univers de créateur : page dédiée d'un créateur (alias, domaine, accroche, couleur d'ambiance, chapitres éditoriaux)
-- et SES contenus classés par rubrique (message, conférence, série, direct).

ALTER TABLE creators
  ADD COLUMN alias    text CHECK (alias IS NULL OR char_length(alias) BETWEEN 1 AND 60),     -- « Apôtre », « Pasteur », « Évangéliste »
  ADD COLUMN domain   text CHECK (domain IS NULL OR char_length(domain) BETWEEN 1 AND 60),  -- « Prédication », « Enseignement », « Louange »
  ADD COLUMN tagline  text CHECK (tagline IS NULL OR char_length(tagline) <= 400),
  ADD COLUMN accent   text CHECK (accent IS NULL OR accent ~ '^[0-9]{1,3} [0-9]{1,3} [0-9]{1,3}$'),  -- « R G B » (chaque valeur ≤ 255, vérifié par l'API)
  ADD COLUMN chapters jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(chapters) = 'array');   -- [{mark, title, text}], validé par l'API

-- Un contenu d'un créateur = un programme du catalogue, rangé dans une rubrique. Le programme garde sa propre fiche (affiche, durée, résumé) :
-- on ne duplique rien. `live` annonce un créneau (l'heure) ; la DIFFUSION en direct n'existe pas encore (le programme n'est pas lisible).
CREATE TABLE creator_contents (
  creator_slug  text NOT NULL REFERENCES creators (slug) ON UPDATE CASCADE ON DELETE CASCADE,
  program_slug  text NOT NULL REFERENCES programs (slug) ON UPDATE CASCADE ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('message', 'conference', 'serie', 'live')),
  featured      boolean NOT NULL DEFAULT false,        -- « À la une » (au plus un par créateur)
  episode_label text CHECK (episode_label IS NULL OR char_length(episode_label) <= 20),  -- « Ép. 01 »
  live_at       timestamptz,                           -- créneau d'un direct
  position      integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (creator_slug, program_slug),
  UNIQUE (creator_slug, position),
  CONSTRAINT live_at_only_for_live CHECK (live_at IS NULL OR kind = 'live')
);
CREATE UNIQUE INDEX creator_contents_one_featured_idx ON creator_contents (creator_slug) WHERE featured;
CREATE INDEX creator_contents_program_idx ON creator_contents (program_slug);
