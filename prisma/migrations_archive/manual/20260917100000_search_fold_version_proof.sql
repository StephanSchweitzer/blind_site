-- search_fold, made independent of the unaccent rules shipped with Postgres.
--
-- scripts/search-fold.e2e.ts caught it on production: PostgreSQL 15
-- (Supabase) leaves « ª », « º » and « µ » alone, while PostgreSQL 18 (the
-- local dev database) folds them to « a », « o » and « μ ». foldForSearchKey
-- (lib/search-normalize.ts) can only mirror one of the two, so the column and
-- the typed query would disagree on whichever database it doesn't match — and
-- the next Supabase upgrade could move them again.
--
-- The fix is the one search_fold already uses for punctuation: translate those
-- characters BEFORE unaccent sees them, so no version of its rules decides.
-- foldForSearchKey keeps the same mapping it had.
--
-- No row needed rewriting when this was written: no stored name and no
-- vocabulary word contained any of the three (checked on production). If one
-- ever does before this runs, re-run the backfill at the bottom of
-- 20260916150000_user_search_key.sql and REFRESH MATERIALIZED VIEW
-- search_vocabulary.
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.search_fold(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $function$
    SELECT btrim(regexp_replace(
        lower(immutable_unaccent(translate(
            $1,
            -- 8 apostrophes, 7 dashes, 5 quotes, 19 spaces, 3 letters unaccent
            -- folds differently from one Postgres version to the next
            U&'\2018\2019\201B\02BC\02B9\2032\00B4`'
                || U&'\2010\2011\2012\2013\2014\2015\2212'
                || U&'\201C\201D\201E\00AB\00BB'
                || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
                || U&'\00AA\00BA\00B5',
            repeat('''', 8) || repeat('-', 7) || repeat('"', 5) || repeat(' ', 19)
                || U&'ao\03BC'
        ))),
        '[[:space:]]+', ' ', 'g'
    ))
$function$;
