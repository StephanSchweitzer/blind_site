-- search_vocabulary: every word the search bars can find, folded, indexed by
-- trigram — the dictionary behind « Vouliez-vous dire … ? » (lib/search-suggest.ts).
--
-- Only ever read when a search has returned NOTHING, to propose a spelling
-- that exists. A proposal is shown only after the list's own search has
-- confirmed it finds rows, so this view deciding a word « exists » never puts
-- a row in front of anyone who could not already see it — the public
-- catalogue included, although the view holds words from hidden books.
--
-- Why a MATERIALIZED view: computing the vocabulary live (split ~15 000 book
-- titles into words, fold them, compare) took 0.2–1.5 s on dev. Materialized,
-- with the trigram index below, a lookup is a few milliseconds. The price is
-- staleness: a word first entered today is proposed from tomorrow, after the
-- nightly refresh (/api/cron/refresh-search-vocabulary). Searching for it
-- works immediately — only the spelling suggestion waits.
--
-- Size on dev: see the check at the bottom of this file (a few MB with its
-- indexes, against ~310 MB of headroom in production).
--
-- Depends on search_fold (20260916150000_user_search_key.sql).
-- Safe to re-run — but re-running does NOT change an existing view's
-- definition (CREATE … IF NOT EXISTS). To change it, DROP MATERIALIZED VIEW
-- search_vocabulary first.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE MATERIALIZED VIEW IF NOT EXISTS search_vocabulary AS
WITH sources (domain, text) AS (
    SELECT 'people', concat_ws(' ', "firstName", "lastName", name)
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
    -- Split on spaces, ASCII punctuation and the typographic marks French
    -- text carries, so « d’éternité » yields « éternité ». The same split runs
    -- on the typed side (SUGGESTION_PIECE_SPLIT in lib/search-suggest.ts).
    SELECT domain, w AS word
    FROM sources,
        LATERAL regexp_split_to_table(
            lower(text),
            U&'[[:space:][:punct:]\2018\2019\201B\02BC\00B4\00AB\00BB\201C\201D\201E\2010\2013\2014\2026]+'
        ) AS w
    -- No digits at all: « 1984 » is searched as a number, and a word like
    -- « histoi8re » is a typo in the data that must never be proposed.
    WHERE length(w) >= 3 AND w ~ '[a-z]|[^[:ascii:]]' AND w !~ '[0-9]'
)
-- One row per folded spelling. When « etranger » and « étranger » both occur,
-- the suggestion shows the commonest written form.
SELECT
    domain,
    search_fold(word) AS fold,
    mode() WITHIN GROUP (ORDER BY word) AS word,
    count(*)::int AS freq
FROM words
GROUP BY domain, search_fold(word);

-- Unique: required by REFRESH … CONCURRENTLY, and serves the exact-word check.
CREATE UNIQUE INDEX IF NOT EXISTS search_vocabulary_domain_fold ON search_vocabulary (domain, fold);
CREATE INDEX IF NOT EXISTS search_vocabulary_fold_trgm ON search_vocabulary USING gin (fold gin_trgm_ops);

-- Called by the nightly cron. SECURITY DEFINER is not needed: the app role
-- owns the view.
CREATE OR REPLACE FUNCTION public.refresh_search_vocabulary()
RETURNS void
LANGUAGE sql
SET search_path = public, extensions
AS $function$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.search_vocabulary $function$;

-- Re-running this file on an existing view picks up today's words.
REFRESH MATERIALIZED VIEW search_vocabulary;

-- Size check (read it before and after applying on production):
--   SELECT pg_size_pretty(pg_total_relation_size('search_vocabulary'));
