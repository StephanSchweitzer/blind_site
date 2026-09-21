-- immutable_unaccent(text) wraps the unaccent extension so it can be used in
-- an IMMUTABLE context (unaccent() itself is STABLE, since it depends on the
-- text search config at call time). Its body calls unaccent(...) with no
-- schema qualification and no fixed search_path, which works on a database
-- where the unaccent extension lives in `public` (true here, on dev) but
-- fails wherever it doesn't. Supabase installs extensions into a separate
-- `extensions` schema by default, so on a Supabase database this function
-- can throw `function unaccent(unknown, text) does not exist` at runtime —
-- not a missing function, a search_path that never looks in the schema the
-- extension actually lives in. See lib/books/bookList.ts's catch around the
-- raw-SQL search path, which was silently falling back to accent-sensitive
-- search whenever this happened.
--
-- Fix: pin search_path on the function itself so it checks both schemas
-- regardless of where the extension landed. Also recommended by Supabase's
-- own linter for any function touching extension code (a function without a
-- fixed search_path is flagged as a security advisory).
--
-- Safe to re-run (CREATE OR REPLACE, CREATE EXTENSION IF NOT EXISTS). No
-- index depends on this function — it's called at query time only — so
-- nothing needs rebuilding after this runs.
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $function$ SELECT unaccent('unaccent', $1) $function$;
