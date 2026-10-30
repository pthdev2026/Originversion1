-- ORIGIN — recherche par mots-clés, historique de recherche, appareils connus (alerte de nouvelle connexion).

-- Mots-clés éditoriaux (synonymes, thèmes, noms propres…) : cherchés comme le titre, saisis dans le back-office.
ALTER TABLE programs ADD COLUMN keywords text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION programs_search_text() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_text := origin_fold(
    concat_ws(' ', NEW.title, NEW.category, NEW.tagline, NEW.presenter, array_to_string(NEW.genres, ' '), array_to_string(NEW.keywords, ' ')));
  RETURN NEW;
END $$;

UPDATE programs SET title = title;

-- Dernières recherches d'un compte (une ligne par requête, la plus récente d'abord). Effacée avec l'historique et avec le compte.
CREATE TABLE search_history (
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  folded      text NOT NULL CHECK (char_length(folded) BETWEEN 2 AND 80),
  query       text NOT NULL CHECK (char_length(query) BETWEEN 2 AND 80),
  searched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, folded)
);
CREATE INDEX search_history_recent_idx ON search_history (user_id, searched_at DESC);

-- Appareils déjà vus pour un compte : une connexion depuis un appareil inconnu déclenche un e-mail d'alerte.
CREATE TABLE login_devices (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device     text NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device)
);
