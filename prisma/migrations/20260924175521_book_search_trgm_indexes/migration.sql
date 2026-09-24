-- Index trigrammes pour la recherche du catalogue (lib/books/bookList.ts).
--
-- La recherche cherche un fragment n'importe où dans le mot
-- (LIKE '%etranger%'), ce que les index btree idx_book_*_unaccent ne savent
-- pas servir : chaque recherche lisait les ~15 000 livres en dés-accentuant
-- quatre colonnes par ligne, trois fois (liste, total, compteurs de
-- disponibilité). Sur l'instance gratuite de Supabase, 0,5 à 2 s par requête ;
-- le 24/09/2026, des recherches simultanées ont saturé la base au point de
-- l'amener à « too many clients already » et le back-office en 504.
--
-- Un index GIN pg_trgm sert LIKE/ILIKE '%…%' et les expressions régulières.
-- Chaque expression ci-dessous doit rester IDENTIQUE à celle que bookList.ts
-- écrit, sinon Postgres ne s'en sert pas : lower(immutable_unaccent(colonne)),
-- sans COALESCE. La description a déjà le sien (idx_book_description_gin).
-- Quelques Mo en tout.
--
-- Prisma ne sait exprimer aucun de ces index : il ne les crée, ne les modifie
-- ni ne les supprime (voir la liste dans CLAUDE.md).

-- Supabase range pg_trgm dans le schéma `extensions`.
SET search_path TO public, extensions;

CREATE INDEX IF NOT EXISTS idx_book_title_trgm ON "Book" USING gin (lower(immutable_unaccent(title)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_book_subtitle_trgm ON "Book" USING gin (lower(immutable_unaccent(subtitle)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_book_author_trgm ON "Book" USING gin (lower(immutable_unaccent(author)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_book_publisher_trgm ON "Book" USING gin (lower(immutable_unaccent(publisher)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_book_isbn_trgm ON "Book" USING gin (lower(immutable_unaccent(isbn)) gin_trgm_ops);

ANALYZE "Book";
