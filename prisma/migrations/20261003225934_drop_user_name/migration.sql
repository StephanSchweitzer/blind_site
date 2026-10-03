-- Suppression de la colonne héritée User.name.
--
-- Venue de l'import Access, elle doublait prénom + nom, souvent avec une autre
-- casse ou sans les accents, et le reste du code ne s'en servait plus qu'en
-- dernier recours pour l'affichage. Le nom d'une personne, c'est désormais
-- uniquement « firstName » et « lastName ».
--
-- SQL brut, donc hors journal d'audit, volontairement : c'est un nettoyage de
-- schéma, pas une décision sur une fiche.

-- Supabase range pg_trgm (gin_trgm_ops, plus bas) dans le schéma `extensions`.
SET search_path TO public, extensions;

-- 1. Les fiches qui n'avaient QUE ce nom-là le gardent, en nom de famille, pour
--    ne pas devenir « Sans nom ». L'affichage (« Prénom Nom ») ne change pas.
UPDATE "User"
   SET "lastName" = btrim("name")
 WHERE "firstName" IS NULL
   AND "lastName" IS NULL
   AND btrim(coalesce("name", '')) <> '';

-- 2. La clé de recherche ne lit plus la colonne (sinon le trigger échoue à la
--    première écriture une fois la colonne partie). Mêmes repli et message
--    qu'en 0_baseline, Part 2.
CREATE OR REPLACE FUNCTION public.user_search_key_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $function$
DECLARE
    source text := concat_ws(' ', NEW."firstName", NEW."lastName", NEW.email);
BEGIN
    BEGIN
        NEW."searchKey" := search_fold(source);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'search_fold a échoué pour User %, clé non dés-accentuée : %', NEW.id, SQLERRM;
        NEW."searchKey" := btrim(regexp_replace(lower(source), '[[:space:]]+', ' ', 'g'));
    END;
    RETURN NEW;
END
$function$;

-- 3. La vue du « Vouliez-vous dire … ? » lit la colonne : elle doit tomber avant
--    elle, et revenir sans elle (définition de 0_baseline, Part 2, au domaine
--    « people » près).
DROP MATERIALIZED VIEW search_vocabulary;

ALTER TABLE "User" DROP COLUMN "name";

CREATE MATERIALIZED VIEW search_vocabulary AS
WITH sources (domain, text) AS (
    SELECT 'people', concat_ws(' ', "firstName", "lastName")
        FROM "User" WHERE "deletedAt" IS NULL
    UNION ALL
    SELECT 'books', concat_ws(' ', title, subtitle, author, publisher)
        FROM "Book" WHERE "deletedAt" IS NULL
    UNION ALL
    SELECT 'genres', name FROM "Genre"
    UNION ALL
    SELECT 'news', title FROM "News"
    UNION ALL
    SELECT 'listes', title FROM "CoupsDeCoeur"
    UNION ALL
    SELECT 'orphans', title FROM "OrphanAudioFolder"
    UNION ALL
    SELECT 'trash', concat_ws(' ', "originBookTitle", filename) FROM "DeletedAudioTrack"
),
words AS (
    SELECT domain, w AS word
    FROM sources,
        LATERAL regexp_split_to_table(
            lower(text),
            U&'[[:space:][:punct:]\2018\2019\201B\02BC\00B4\00AB\00BB\201C\201D\201E\2010\2013\2014\2026]+'
        ) AS w
    WHERE length(w) >= 3 AND w ~ '[a-z]|[^[:ascii:]]' AND w !~ '[0-9]'
)
SELECT
    domain,
    search_fold(word) AS fold,
    mode() WITHIN GROUP (ORDER BY word) AS word,
    count(*)::int AS freq
FROM words
GROUP BY domain, search_fold(word);

-- Unique : exigé par REFRESH … CONCURRENTLY.
CREATE UNIQUE INDEX search_vocabulary_domain_fold ON search_vocabulary (domain, fold);
CREATE INDEX search_vocabulary_fold_trgm ON search_vocabulary USING gin (fold gin_trgm_ops);

-- 4. Toutes les clés recalculées sans l'ancien nom (le trigger les réécrit).
UPDATE "User" SET "searchKey" = '';
