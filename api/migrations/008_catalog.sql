-- ORIGIN — catalogue éditorial : tout ce que le front affichait « en dur » devient une donnée pilotable.
--
-- Principe : un programme (programs) garde son identité ; on y ajoute sa présentation (accroche, visuels, genres),
-- ses saisons/épisodes, ses thématiques, et des « collections » ordonnées (Hero, Top 10, rails…) qui composent l'accueil.
-- Les chemins d'images sont soit une adresse absolue (https://…), soit un chemin servi par l'API (/images/<slug>/<fichier>).

ALTER TABLE programs
  ADD COLUMN tagline        text,
  ADD COLUMN title_lines    text[]  NOT NULL DEFAULT '{}',   -- titre en lignes, pour la mise en page typographique
  ADD COLUMN category       text,                            -- libellé affiché : « Film original », « Série documentaire »…
  ADD COLUMN duration_label text,                            -- libellé éditorial : « 52 min », « 6 épisodes »
  ADD COLUMN year           integer CHECK (year IS NULL OR year BETWEEN 1900 AND 2100),
  ADD COLUMN language       text,
  ADD COLUMN rating         text,
  ADD COLUMN presenter      text,
  ADD COLUMN genres         text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN badges         text[]  NOT NULL DEFAULT '{}',   -- « Nouveau », « Nouvelle saison »…
  ADD COLUMN poster_url     text,
  ADD COLUMN hero_url       text,
  ADD COLUMN logo_url       text,
  ADD COLUMN hero_video_url text,
  ADD COLUMN trailer_url    text,
  ADD COLUMN image_alt      text,
  ADD COLUMN image_focus    text,                            -- position CSS gardant le visage visible
  ADD COLUMN title_style    text CHECK (title_style IS NULL OR title_style IN ('condensed', 'serif', 'bebas', 'italic-serif')),
  ADD COLUMN published      boolean NOT NULL DEFAULT true;   -- brouillon = false : invisible du public

CREATE TABLE seasons (
  program_slug text    NOT NULL REFERENCES programs (slug) ON UPDATE CASCADE ON DELETE CASCADE,
  number       integer NOT NULL CHECK (number > 0),
  title        text,
  PRIMARY KEY (program_slug, number)
);

-- L'identifiant de lecture d'un épisode est « <slug>-<key> » (convention du front : key = s1-e2).
CREATE TABLE episodes (
  program_slug   text    NOT NULL,
  season_number  integer NOT NULL,
  number         integer NOT NULL CHECK (number > 0),
  key            text    NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9-]*$'),
  title          text    NOT NULL,
  synopsis       text,
  duration_label text,
  image_url      text,
  image_alt      text,
  PRIMARY KEY (program_slug, season_number, number),
  UNIQUE (program_slug, key),
  FOREIGN KEY (program_slug, season_number) REFERENCES seasons (program_slug, number) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE themes (
  slug      text PRIMARY KEY CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  title     text NOT NULL,
  image_url text,
  position  integer NOT NULL DEFAULT 0
);

CREATE TABLE program_themes (
  program_slug text NOT NULL REFERENCES programs (slug) ON UPDATE CASCADE ON DELETE CASCADE,
  theme_slug   text NOT NULL REFERENCES themes (slug) ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY (program_slug, theme_slug)
);
CREATE INDEX program_themes_theme_idx ON program_themes (theme_slug);

CREATE TABLE creators (
  slug           text PRIMARY KEY CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name           text NOT NULL,
  show_title     text,
  intro          text,
  themes         text[] NOT NULL DEFAULT '{}',
  ambience       text CHECK (ambience IS NULL OR ambience IN ('ember', 'bordeaux', 'graphite', 'amber', 'night')),
  image_url      text,
  image_alt      text,
  image_focus    text,
  is_provisional boolean NOT NULL DEFAULT true,
  published      boolean NOT NULL DEFAULT false,
  position       integer NOT NULL DEFAULT 0
);

-- Une collection = une liste ordonnée de programmes. `layout` dit au front COMMENT l'afficher.
-- `home_position` : place sur la page d'accueil (NULL = pas sur l'accueil).
CREATE TABLE collections (
  slug          text PRIMARY KEY CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  title         text NOT NULL,
  layout        text NOT NULL CHECK (layout IN ('hero', 'ranked', 'rail', 'portrait', 'panels', 'universes')),
  badge         text,
  view_all_url  text,
  home_position integer,
  published     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE collection_items (
  collection_slug text    NOT NULL REFERENCES collections (slug) ON UPDATE CASCADE ON DELETE CASCADE,
  program_slug    text    NOT NULL REFERENCES programs (slug) ON UPDATE CASCADE ON DELETE CASCADE,
  position        integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (collection_slug, program_slug),
  UNIQUE (collection_slug, position)
);
