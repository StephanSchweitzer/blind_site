-- User."searchKey": a lower-cased, accent-folded copy of everything a person
-- is searched by (prénom, nom, name, email), so the Prisma search bars can
-- find « Müller » from « Muller » and « Noël » from « Noel ».
--
-- Why a column at all: Prisma cannot wrap a column in unaccent(), so the only
-- accent-insensitive search it can express is a `contains` against data that
-- is ALREADY folded. The query side is folded in JavaScript by
-- foldForSearchKey (lib/search-normalize.ts), which must agree with
-- search_fold below character for character — scripts/search-fold.e2e.ts
-- checks that, and should be re-run after any change to either.
--
-- Why a trigger and not a GENERATED column: Postgres rejects any explicit
-- write to a generated column, and Prisma writes whatever an update spreads
-- into `data`. A BEFORE trigger just overwrites what arrives, so the column
-- can be an ordinary field to Prisma. The trigger also fires for rows written
-- by raw SQL, imports and seeds.
--
-- Why the fallback: the trigger runs on EVERY insert and update of a User.
-- If immutable_unaccent breaks again (as it did on Supabase, see
-- 20260916120000_fix_immutable_unaccent_search_path.sql), a plain trigger
-- would stop anyone creating or editing a person. Instead the key degrades to
-- lower-case only, with a WARNING in the Postgres log; re-running the backfill
-- at the bottom of this file repairs those rows once the function is fixed.
--
-- Size: ~40 kB of text over ~860 rows in production. No index: a sequential
-- scan of the table is already instant.
--
-- Safe to re-run.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "searchKey" TEXT NOT NULL DEFAULT '';

-- The fold. The translate() runs the same punctuation classes as
-- normalizeSearchText (lib/search-normalize.ts) BEFORE unaccent — apostrophes,
-- dashes, quotes, exotic spaces — so « ´ » and « ` », which unaccent leaves
-- alone, and « « » », which it would turn into « << », fold exactly as the
-- JavaScript side folds them.
CREATE OR REPLACE FUNCTION public.search_fold(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $function$
    SELECT btrim(regexp_replace(
        lower(immutable_unaccent(translate(
            $1,
            -- 8 apostrophes, 7 dashes, 5 quotes, 19 spaces
            U&'\2018\2019\201B\02BC\02B9\2032\00B4`'
                || U&'\2010\2011\2012\2013\2014\2015\2212'
                || U&'\201C\201D\201E\00AB\00BB'
                || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF',
            repeat('''', 8) || repeat('-', 7) || repeat('"', 5) || repeat(' ', 19)
        ))),
        '[[:space:]]+', ' ', 'g'
    ))
$function$;

CREATE OR REPLACE FUNCTION public.user_search_key_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $function$
DECLARE
    source text := concat_ws(' ', NEW."firstName", NEW."lastName", NEW.name, NEW.email);
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

DROP TRIGGER IF EXISTS user_search_key ON "User";
CREATE TRIGGER user_search_key
    BEFORE INSERT OR UPDATE ON "User"
    FOR EACH ROW EXECUTE FUNCTION public.user_search_key_trigger();

-- Backfill: a no-op assignment is enough, the trigger recomputes the key.
UPDATE "User" SET "searchKey" = "searchKey";
