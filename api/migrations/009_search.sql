-- ORIGIN — recherche : texte « plié » (sans accents, en minuscules) maintenu par la base elle-même.
-- Sans extension (unaccent, pg_trgm) : fonctionne sur n'importe quel PostgreSQL, y compris géré.

CREATE FUNCTION origin_fold(value text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(translate(coalesce(value, ''),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝœŒæÆ’''',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUYooaa  '))
$$;

ALTER TABLE programs ADD COLUMN search_text text NOT NULL DEFAULT '';

CREATE FUNCTION programs_search_text() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_text := origin_fold(
    concat_ws(' ', NEW.title, NEW.category, NEW.tagline, NEW.presenter, array_to_string(NEW.genres, ' ')));
  RETURN NEW;
END $$;

CREATE TRIGGER programs_search_text_trigger
  BEFORE INSERT OR UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION programs_search_text();

-- Rattrapage des lignes existantes (déclenche le trigger).
UPDATE programs SET title = title;
