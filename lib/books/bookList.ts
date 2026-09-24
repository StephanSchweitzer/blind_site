// lib/books/bookList.ts
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { BookWithGenres } from '@/types/book';
import { PublicBook, toPublicBook } from '@/lib/books/publicBook';
import { audioMissingWhere, audioPresentWhere, AUDIO_MISSING_STATUSES } from '@/lib/books/audioFilter';
import { AudioFilter, buildBookScopeWhere } from '@/lib/books/searchWhere';
import { normalizeSearchQuery, parseEntityId } from '@/lib/search-query';
import { bookFieldsForToken, searchTokens } from '@/lib/search';
import { searchVariants } from '@/lib/search-normalize';
import { parsePageParam, parseLimitParam, pageSkip } from '@/lib/pagination';
import { isParisDay, parisDayStartUtc } from '@/lib/paris-day';
import { rescueEmptySearch, type RescueQuery } from '@/lib/search-rescue';
import { MAX_PREVIEW_ROWS } from '@/lib/search-suggestion-types';
import type { BookSearchSuggestion, CatalogueFilterKey } from '@/lib/books/book-suggestion-types';

/**
 * La liste de livres paginée, et les deux seules façons d'y accéder.
 *
 * Elle sert deux publics qui n'ont rien en commun : le catalogue public
 * (/api/catalogue) et le back-office (/api/books — table des livres, sélecteur
 * de Coup de cœur, BookSearchCombobox). Ils partageaient autrefois un seul
 * handler qui décidait à l'exécution quoi montrer, d'après la session puis
 * d'après un `?scope=public` que la page publique devait penser à envoyer. Un
 * permanent connecté qui parcourait le site public recevait les livres masqués,
 * et un appel anonyme pouvait demander `recent=true` (le titre d'une liste
 * dépubliée) ou `audio=missing` (l'état du pipeline audio).
 *
 * D'où la forme de ce module : la requête elle-même (`listBooks`) n'est PAS
 * exportée. On n'y entre que par `listPublicBooks`, dont le type n'accepte que
 * les critères d'un visiteur et qui fixe lui-même l'exclusion des livres masqués
 * et la réduction à `PublicBook`, ou par `listAdminBooks` /
 * `findAdminBooksByIds`, que seule une route `withAdmin` appelle. Aucun appelant
 * public ne peut oublier un drapeau : il n'y en a pas à passer.
 *
 * Le moteur de recherche, lui, reste unique — SQL insensible aux accents,
 * repli Prisma, promotion d'un identifiant exact, compteurs de disponibilité.
 * Deux copies, c'est ainsi que « etranger » a listé 684 livres sous un
 * compteur de 5.
 */

// Type definitions for raw SQL queries
interface CountResult {
    count: bigint;
}

interface RawBookResult {
    id: number;
    title: string;
    subtitle: string | null;
    author: string;
    publisher: string | null;
    publishedDate: Date;
    isbn: string | null;
    description: string | null;
    available: boolean;
    hiddenFromCatalogue: boolean;
    readingDurationMinutes: number | null;
    pageCount: number | null;
    addedById: number;
    createdAt: Date;
    updatedAt: Date;
}

// Type for query parameters
type QueryParam = string | number | number[];

/**
 * Move the row whose id the user searched for to the front.
 *
 * Asking for a book by number is an unambiguous request in a way a title
 * search never is, so it shouldn't have to be hunted for in a list sorted by
 * something else entirely. A no-op when the query wasn't an id, or when the
 * id didn't survive the other filters.
 */
function promoteExactId<T extends { id: number }>(rows: T[], entityId: number | null): T[] {
    if (entityId === null) return rows;
    const index = rows.findIndex((r) => r.id === entityId);
    if (index <= 0) return rows;
    return [rows[index], ...rows.filter((_, i) => i !== index)];
}

interface RawBookWhereOptions {
    search: string;
    filter: string;
    genres: number[];
    includeHidden: boolean;
    available?: boolean;
    hiddenFilter?: boolean;
    audio?: AudioFilter;
    /**
     * Match each word at the START of a word, on titles, subtitles, authors,
     * publishers and genres only — never inside a word, never in descriptions
     * or ISBNs. For checking a spelling correction: the list's own match (any
     * fragment, descriptions included) lets almost any ordinary word « find »
     * something, so « sagese FERY » was « corrected » to « sagesse fer » on
     * the strength of 77 descriptions. Lists always search loosely.
     */
    strict?: boolean;
}

/** Escaped for a Postgres regular expression — the words searched are user input. */
const escapeRegex = (text: string) => text.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&');

/**
 * The accent-insensitive WHERE clause, shared by the book list and by the
 * availability counts printed beside it.
 *
 * Extracted because those two were built by different code — raw SQL through
 * `immutable_unaccent` for the list, Prisma `contains` for the counts — so an
 * accented title was counted differently from how it was listed. Searching
 * « etranger » listed 684 books above a count of 5.
 *
 * `available` is optional on purpose: the counts scope themselves by every
 * other filter and then split ON availability, so they need this same clause
 * built without it.
 */
function buildRawBookWhere({
    search,
    filter,
    genres,
    includeHidden,
    available,
    hiddenFilter,
    audio,
    strict = false,
}: RawBookWhereOptions): { whereClause: string; params: QueryParam[] } {
    // Build the base query
    const whereConditions: string[] = [];
    const params: QueryParam[] = [];
    let paramCount = 0;

    // One condition group per token, AND-ed together by the join below — so
    // « camus étranger » can satisfy one word from the author and the other
    // from the title. Each token gets its own positional parameter; the
    // remaining params (genres, skip, limit) are pushed after this loop and
    // numbered from wherever it left off.
    for (const token of searchTokens(search)) {
        // One placeholder per typographic spelling of the token.
        //
        // `immutable_unaccent` already folds « ’ » and « ‘ » onto « ' » — which
        // is the only reason the catalogue ever appeared to handle apostrophes
        // — but it leaves « ´ » and « ` » alone, and it cannot turn
        // « Jean-Pierre » into « Jean Pierre ». Expanding here rather than
        // leaning on unaccent also keeps this engine looking for exactly the
        // set `fieldVariants` looks for on the Prisma side: when the two
        // disagree the list and the count printed beside it disagree with it,
        // which is how « etranger » once listed 684 books above a count of 5.
        const placeholders = searchVariants(token).map((variant) => {
            paramCount++;
            params.push(strict ? escapeRegex(variant.toLowerCase()) : `%${variant.toLowerCase()}%`);
            return `$${paramCount}`;
        });
        if (placeholders.length === 0) continue;

        /**
         * `expr` matches ANY spelling of this token. Parenthesised by every
         * caller that sits next to an AND — OR binds loosest in SQL.
         *
         * `unaccent: false` is for the description, too large to fold on every
         * row. The isbn carries no accents but is folded all the same: its
         * index has to be an expression — a plain-column index is one Prisma
         * can see, and `migrate dev` would drop it as drift.
         *
         * Every expression here is the exact one a trigram index was built on
         * (migration 20260924175521_book_search_trgm_indexes, and
         * idx_book_description_gin for `description ILIKE`) — which is why a
         * column is never wrapped in COALESCE: a NULL just fails its LIKE.
         * Change one side without the other and Postgres silently goes back to
         * reading every book, which on Supabase's free tier took 0.5–2 s per
         * query and, with a few people searching at once, the whole database
         * down with it (2026-09-24).
         */
        const anyVariant = (expr: string, unaccent = true) =>
            placeholders
                .map((ph) =>
                    strict
                        // A word start: the beginning, or anything but a letter
                        // or digit just before (space, apostrophe, hyphen…).
                        ? `LOWER(immutable_unaccent(${expr})) ~ ('(^|[^[:alnum:]])' || LOWER(immutable_unaccent(${ph})))`
                        : unaccent
                            ? `LOWER(immutable_unaccent(${expr})) LIKE LOWER(immutable_unaccent(${ph}))`
                            : `${expr} ILIKE ${ph}`,
                )
                .join(' OR ');

        // Staff look books up by the id shown in « Modifier le livre #42 ».
        // Inlined rather than parameterised for the same reason the booleans
        // below are: parseEntityId returns a validated positive int4 or null,
        // never raw user input.
        const tokenId = parseEntityId(token);
        const idClause = tokenId !== null ? `b.id = ${tokenId} OR ` : '';

        // The books of every genre whose name matches, gathered ONCE into an
        // array (an InitPlan) and matched on the primary key. A correlated
        // EXISTS here was a per-row subplan, and a single arm Postgres cannot
        // serve from an index makes it scan the whole table for the entire OR
        // — trigram indexes on the other columns included.
        const genreExists = `
                b.id = ANY(ARRAY(
                    SELECT bg."bookId" FROM "BookGenre" bg
                    JOIN "Genre" g ON bg."genreId" = g.id
                    WHERE ${anyVariant('g.name')}
                ))`;

        if (filter === 'all' && strict) {
            whereConditions.push(`(
                ${idClause}
                ${anyVariant('b.title')} OR
                ${anyVariant('b.subtitle')} OR
                ${anyVariant('b.author')} OR
                ${anyVariant('b.publisher')} OR
                ${genreExists}
            )`);
        } else if (filter === 'all') {
            whereConditions.push(`(
                ${idClause}
                ${anyVariant('b.title')} OR
                ${anyVariant('b.subtitle')} OR
                ${anyVariant('b.author')} OR
                ${anyVariant('b.publisher')} OR
                ${anyVariant('b.isbn')} OR
                ${anyVariant('b.description', false)} OR
                ${genreExists}
            )`);
        } else if (filter === 'genre') {
            whereConditions.push(genreExists);
        } else {
            const columnMap: Record<string, string> = {
                'title': 'b.title',
                'author': 'b.author',
                'description': 'b.description',
                'subtitle': 'b.subtitle',
                'publisher': 'b.publisher',
                'isbn': 'b.isbn'
            };
            const column = columnMap[filter] || 'b.title';

            // Special handling for description due to size
            if (filter === 'description') {
                whereConditions.push(`(${anyVariant('b.description', false)})`);
            } else if (filter === 'isbn') {
                whereConditions.push(`(${anyVariant('b.isbn')})`);
            } else {
                whereConditions.push(`(${anyVariant(column)})`);
            }
        }
    }

    // Soft-deleted books never appear, admin or not: this path runs raw SQL,
    // which bypasses the global Prisma extension (lib/prisma.ts) that hides
    // them everywhere else. Unconditional, unlike hiddenFromCatalogue below —
    // there is no "includeDeleted" caller, deleted means gone from every list.
    whereConditions.push(`b."deletedAt" IS NULL`);

    // Exclude books hidden from the public catalogue, unless the caller is admin
    if (!includeHidden) {
        whereConditions.push(`b."hiddenFromCatalogue" = false`);
    } else if (hiddenFilter !== undefined) {
        whereConditions.push(`b."hiddenFromCatalogue" = ${hiddenFilter}`);
    }

    // available/hiddenFilter/audio are all derived above (never raw user
    // input), so inlining them is safe and sidesteps $queryRawUnsafe's
    // boolean-param typing quirks.
    if (available !== undefined) {
        whereConditions.push(`b.available = ${available}`);
    }

    if (audio === 'missing' || audio === 'present') {
        const missingStatusList = AUDIO_MISSING_STATUSES.map((s) => `'${s}'`).join(',');
        const missingCondition = `(
            b.audio_filepath IS NULL OR b.audio_filepath = '' OR
            b."audioLinkStatus" IN (${missingStatusList}) OR
            b."audioTrackCount" <= 0
        )`;
        whereConditions.push(audio === 'missing' ? missingCondition : `NOT ${missingCondition}`);
    }

    // Add genre filter if specified
    if (genres.length > 0) {
        paramCount++;
        params.push(genres);
        whereConditions.push(`
            EXISTS (
                SELECT 1 FROM "BookGenre" bg
                WHERE bg."bookId" = b.id AND bg."genreId" = ANY($${paramCount})
            )
        `);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    return { whereClause, params };
}

/**
 * Availability breakdown for the current search, counted through the SAME
 * clause the list uses — one query, split with FILTER, scoped by every filter
 * except availability itself.
 *
 * Returns null when the raw path is unavailable (no `immutable_unaccent`), so
 * the caller can fall back to the Prisma count the way the search does.
 */
async function countAvailabilityRaw(
    options: Omit<RawBookWhereOptions, 'available'>
): Promise<{ availableCount: number; unavailableCount: number } | null> {
    const { whereClause, params } = buildRawBookWhere({ ...options, available: undefined });
    const query = `
        SELECT
            COUNT(DISTINCT b.id) FILTER (WHERE b.available) as available,
            COUNT(DISTINCT b.id) FILTER (WHERE NOT b.available) as unavailable
        FROM "Book" b
            ${whereClause}
    `;
    try {
        const rows = await prisma.$queryRawUnsafe<
            { available: bigint; unavailable: bigint }[]
        >(query, ...params);
        return {
            availableCount: Number(rows[0]?.available ?? 0),
            unavailableCount: Number(rows[0]?.unavailable ?? 0),
        };
    } catch (error) {
        console.error('Accent-insensitive availability count failed, falling back:', error);
        return null;
    }
}

/**
 * How many books a search finds, through the same accent-insensitive WHERE as
 * the list — for checking a « Vouliez-vous dire » candidate. Falls back to the
 * Prisma scope where, like the list does, if the raw path is unavailable.
 */
async function countBooksForSearch(
    options: RawBookWhereOptions & { hiddenFilter?: boolean }
): Promise<number> {
    const { whereClause, params } = buildRawBookWhere(options);
    try {
        const rows = await prisma.$queryRawUnsafe<CountResult[]>(
            `SELECT COUNT(*) as count FROM "Book" b ${whereClause}`,
            ...params,
        );
        return Number(rows[0]?.count ?? 0);
    } catch {
        const scoped = buildBookScopeWhere({
            searchTerm: options.search,
            filter: options.filter,
            genreIds: options.genres,
            includeHidden: options.includeHidden,
            hidden: options.hiddenFilter,
            audio: options.audio,
        });
        return prisma.book.count({
            where: { AND: [scoped, ...(options.available !== undefined ? [{ available: options.available }] : [])] },
        });
    }
}

/**
 * The few books a proposal shows, closest to the words typed first — not
 * newest first like the list: a preview of three has to show the book being
 * looked for, not whichever three were catalogued last. Ranked here in SQL
 * with pg_trgm; the shared engine re-ranks them in memory with the same
 * measure, which leaves this order alone.
 *
 * `rankBy` is what was TYPED, not the proposal's query: a word the proposal
 * dropped, or could not correct, still says which book was meant. « Carbets
 * CLrRC » proposes « carnets » (14 books); ranked on the words typed, the
 * one by Christine CLERC makes the three shown.
 *
 * Returns nothing when the raw path is unavailable: a preview is a nicety.
 */
async function previewBooksForSearch(options: RawBookWhereOptions, rankBy: string): Promise<BookWithGenres[]> {
    const { whereClause, params } = buildRawBookWhere(options);
    try {
        const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
            `SELECT b.id
             FROM "Book" b
             ${whereClause}
             ORDER BY similarity(
                        LOWER(immutable_unaccent(concat_ws(' ', b.title, b.subtitle, b.author))),
                        LOWER(immutable_unaccent($${params.length + 1}))
                      ) DESC,
                      b."createdAt" DESC
             LIMIT ${MAX_PREVIEW_ROWS}`,
            ...params,
            rankBy,
        );
        if (rows.length === 0) return [];
        const found = await prisma.book.findMany({
            where: { id: { in: rows.map((r) => r.id) } },
            include: { genres: { include: { genre: true } } },
        });
        return rows
            .map((r) => found.find((b) => b.id === r.id))
            .filter((b): b is BookWithGenres => b !== undefined);
    } catch (error) {
        console.error('Aperçu des livres suggérés impossible :', error);
        return [];
    }
}

/**
 * What to propose when a catalogue search found nothing — the shared engine
 * (lib/search-rescue.ts) with the catalogue's own counts and previews.
 *
 * Corrections are counted with `strict` (word starts, no descriptions), so a
 * proposal only survives if a title, author, publisher or genre supports it.
 * Filter lifts are counted with the list's own search, so « Retirer ce filtre
 * (2 livres) » shows exactly those two.
 *
 * Every filter lifted here is one the caller was allowed to set: the public
 * catalogue passes includeHidden false and no back-office filter, so nothing it
 * could not already see can surface.
 *
 * The labels are the keys themselves: the catalogue names its filters on the
 * client, which knows the genre names (components/ui/book-search-suggestions.tsx).
 */
async function rescueEmptyBookSearch(
    options: Omit<RawBookWhereOptions, 'strict'>,
): Promise<BookSearchSuggestion<BookWithGenres>[]> {
    const active: CatalogueFilterKey[] = [];
    if (options.filter !== 'all') active.push('filter');
    if (options.genres.length > 0) active.push('genres');
    if (options.available !== undefined) active.push('available');
    if (options.hiddenFilter !== undefined) active.push('hidden');
    if (options.audio === 'missing' || options.audio === 'present') active.push('audio');

    const scoped = (q: RescueQuery): RawBookWhereOptions => ({
        ...options,
        search: q.query,
        filter: q.lifted.includes('filter') ? 'all' : options.filter,
        genres: q.lifted.includes('genres') ? [] : options.genres,
        available: q.lifted.includes('available') ? undefined : options.available,
        hiddenFilter: q.lifted.includes('hidden') ? undefined : options.hiddenFilter,
        audio: q.lifted.includes('audio') ? undefined : options.audio,
        strict: q.purpose === 'correction',
    });

    const suggestions = await rescueEmptySearch<BookWithGenres, BookWithGenres>({
        search: options.search,
        domains: ['books', 'genres'],
        filters: active.map((key) => ({ key, label: key })),
        count: (q) => countBooksForSearch(scoped(q)),
        find: (q) => previewBooksForSearch(scoped(q), options.search),
        rankText: (b) => [b.title, b.subtitle, b.author].filter(Boolean).join(' '),
        toRow: (b) => b,
    });
    return suggestions as BookSearchSuggestion<BookWithGenres>[];
}

// Perform accent-insensitive search using raw SQL
async function performAccentInsensitiveSearch(
    search: string,
    filter: string,
    genres: number[],
    skip: number,
    limit: number,
    includeHidden: boolean,
    available?: boolean,
    hiddenFilter?: boolean,
    audio?: AudioFilter
): Promise<{ books: BookWithGenres[]; total: number }> {
    const { whereClause, params } = buildRawBookWhere({
        search, filter, genres, includeHidden, available, hiddenFilter, audio,
    });
    let paramCount = params.length;

    // Get count
    const countQuery = `
        SELECT COUNT(DISTINCT b.id) as count
        FROM "Book" b
            ${whereClause}
    `;

    // Get data with pagination
    paramCount++;
    params.push(skip);
    paramCount++;
    params.push(limit);

    const dataQuery = `
        SELECT DISTINCT b.*
        FROM "Book" b
            ${whereClause}
        ORDER BY b."createdAt" DESC
        OFFSET $${paramCount - 1} LIMIT $${paramCount}
    `;

    try {
        const [countResult, books] = await Promise.all([
            prisma.$queryRawUnsafe<CountResult[]>(countQuery, ...params.slice(0, -2)),
            prisma.$queryRawUnsafe<RawBookResult[]>(dataQuery, ...params)
        ]);

        const total = Number(countResult[0]?.count || 0);

        // The real total even when this page is empty: past the last page the
        // search did find books, just not this far, and both the admin page's
        // redirectPastLastPage and the table's own fallback to the last page
        // only fire on « no rows, total > 0 ». Returning 0 here made them read
        // it as a search that found nothing.
        if (books.length === 0) {
            return { books: [], total };
        }

        // Get genres for the books
        const bookIds = books.map(b => b.id);
        const booksWithGenres = await prisma.book.findMany({
            where: { id: { in: bookIds } },
            include: {
                genres: {
                    include: { genre: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // La promotion d'un identifiant exact ne se fait PAS ici — elle vit
        // dans listBooks, après le choix de la branche, parce qu'elle doit
        // valoir aussi pour la recherche Prisma et pour le filtre par genre.
        return { books: booksWithGenres, total };
    } catch (error) {
        // The accent-insensitive path relies on the immutable_unaccent SQL function.
        // If it isn't present in this database it throws here — fall back to a
        // standard Prisma contains search instead of silently returning nothing.
        console.error('Accent-insensitive search failed, falling back to standard search:', error);
        return fallbackSearch(search, filter, genres, skip, limit, includeHidden, available, hiddenFilter, audio);
    }
}

// Standard (accent-sensitive) search used when the raw SQL path is unavailable
async function fallbackSearch(
    search: string,
    filter: string,
    genres: number[],
    skip: number,
    limit: number,
    includeHidden: boolean,
    available?: boolean,
    hiddenFilter?: boolean,
    audio?: AudioFilter
): Promise<{ books: BookWithGenres[]; total: number }> {
    const mode = Prisma.QueryMode.insensitive;

    // Tokenized to match the raw path above: each word AND-ed, satisfiable by
    // any searched column. `bookFieldsForToken` is the shared field list.
    const tokenClauses: Prisma.BookWhereInput[] = searchTokens(search).map((token) => {
        if (filter === 'genre') {
            return { genres: { some: { genre: { name: { contains: token, mode } } } } };
        }
        if (filter === 'all') {
            return { OR: bookFieldsForToken(token) };
        }
        const allowed = ['title', 'author', 'description', 'subtitle', 'publisher', 'isbn'] as const;
        const column = (allowed as readonly string[]).includes(filter) ? filter : 'title';
        return { [column]: { contains: token, mode } } as Prisma.BookWhereInput;
    });

    // Everything below appends to AND — the search owns it first now, so the
    // genre filter has to merge rather than assign, which it used to do back
    // when the search lived in `where.OR`.
    const where: Prisma.BookWhereInput = {};
    const andClauses: Prisma.BookWhereInput[] = [...tokenClauses];
    if (genres.length > 0) {
        andClauses.push({ genres: { some: { genreId: { in: genres } } } });
    }
    if (andClauses.length > 0) where.AND = andClauses;
    if (!includeHidden) {
        where.hiddenFromCatalogue = false;
    } else if (hiddenFilter !== undefined) {
        where.hiddenFromCatalogue = hiddenFilter;
    }
    if (available !== undefined) {
        where.available = available;
    }
    if (audio === 'missing' || audio === 'present') {
        const audioCondition = audio === 'missing' ? audioMissingWhere() : audioPresentWhere();
        where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), audioCondition];
    }

    const [books, total] = await Promise.all([
        prisma.book.findMany({
            where,
            include: { genres: { include: { genre: true } } },
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.book.count({ where }),
    ]);

    return { books, total };
}

/**
 * De quoi étiqueter la fenêtre des nouveautés côté back-office : la coupure
 * appliquée, celle par défaut, et le titre de la liste qui la porte. Présent
 * seulement quand `recent=true` — une option que `listPublicBooks` n'expose pas.
 *
 * `defaultActive` dit si cette liste est encore publiée : la coupure se prend
 * sur la dernière liste créée, dépubliée comprise, et le permanent doit
 * pouvoir constater qu'elle ne figure plus sur le site.
 */
export interface RecentWindow {
    since: string | null;
    defaultSince: string | null;
    defaultLabel: string | null;
    defaultActive: boolean | null;
}

/** Les critères qu'un visiteur du catalogue public peut formuler — rien d'autre. */
export interface BookListQuery {
    search: string;
    filter: string;
    genres: number[];
    page: number;
    limit: number;
    /**
     * Calculer les « Vouliez-vous dire … ? » quand la recherche ne trouve rien.
     * Opt-in (`?suggest=1`) : le sélecteur de livre passe par la même route et
     * vérifie ses suggestions lui-même — les calculer ici aussi doublerait le
     * travail. Voir lib/search-suggest.ts.
     */
    suggest?: boolean;
}

/** Ce que le back-office peut demander en plus. */
export interface AdminBookListQuery extends BookListQuery {
    available?: boolean;
    hidden?: boolean;
    audio?: AudioFilter;
    recent: boolean;
    /** Jour parisien 'YYYY-MM-DD' — n'a de sens qu'avec `recent`. */
    since: string | null;
}

interface BookListPage<B> {
    books: B[];
    total: number;
    page: number;
    totalPages: number;
    availableCount: number;
    unavailableCount: number;
    recentWindow?: RecentWindow;
    /** Seulement avec `suggest`, et seulement quand la recherche n'a rien trouvé. */
    searchSuggestions?: BookSearchSuggestion<B>[];
}

/**
 * Le socle commun aux deux lectures d'URL : mêmes valeurs par défaut, même
 * normalisation — une divergence ici et le catalogue et le back-office ne
 * trouveraient plus les mêmes livres pour la même saisie.
 */
export function parseBookListQuery(searchParams: URLSearchParams): BookListQuery {
    return {
        // Normalized so a pasted « #42 » resolves to book 42 — « # » is never
        // meaningful in a title search either way.
        search: normalizeSearchQuery(searchParams.get('search') || ''),
        filter: searchParams.get('filter') || 'all',
        page: parsePageParam(searchParams.get('page')),
        limit: parseLimitParam(searchParams.get('limit'), 9),
        genres: searchParams.getAll('genres').map(Number).filter(id => !isNaN(id)),
        suggest: searchParams.get('suggest') === '1',
    };
}

export function parseAdminBookListQuery(searchParams: URLSearchParams): AdminBookListQuery {
    const availableParam = searchParams.get('available');
    const hiddenParam = searchParams.get('hidden');
    const audioParam = searchParams.get('audio');
    return {
        ...parseBookListQuery(searchParams),
        available: availableParam === 'true' ? true : availableParam === 'false' ? false : undefined,
        hidden: hiddenParam === 'true' ? true : hiddenParam === 'false' ? false : undefined,
        audio: audioParam === 'missing' ? 'missing' : audioParam === 'present' ? 'present' : undefined,
        recent: searchParams.get('recent') === 'true',
        since: searchParams.get('since'),
    };
}

/**
 * The one list query. Not exported — see the module comment: every caller goes
 * through a wrapper that has already decided, from which route it lives behind,
 * whether hidden books and back-office filters are in play.
 */
async function listBooks(
    query: AdminBookListQuery & { includeHidden: boolean }
): Promise<BookListPage<BookWithGenres>> {
    const { search, filter, genres, page, limit, available, audio, recent, since, includeHidden, suggest } = query;
    // `hidden` only means something to a caller that may see hidden books.
    const hiddenFilter = includeHidden ? query.hidden : undefined;
    const skip = pageSkip(page, limit);

    // Build base where clause
    const whereClause: Prisma.BookWhereInput = {};
    if (!includeHidden) {
        whereClause.hiddenFromCatalogue = false;
    } else if (hiddenFilter !== undefined) {
        whereClause.hiddenFromCatalogue = hiddenFilter;
    }
    if (available !== undefined) {
        whereClause.available = available;
    }
    if (audio === 'missing' || audio === 'present') {
        const audioCondition = audio === 'missing' ? audioMissingWhere() : audioPresentWhere();
        whereClause.AND = [...(Array.isArray(whereClause.AND) ? whereClause.AND : whereClause.AND ? [whereClause.AND] : []), audioCondition];
    }

    // Handle recent books filter
    let recentWindow: RecentWindow | undefined;
    if (recent) {
        // Ici, et seulement ici, la coupure ignore `active` : elle se
        // prend sur la dernière liste CRÉÉE, publiée ou non. Dépublier
        // une liste la retire du site, pas de l'histoire — les livres
        // qu'elle annonce ont déjà été choisis, et une liste dépubliée
        // est le plus souvent une liste qu'on republiera. Filtré sur
        // `active: true`, le défaut reculait jusqu'à l'avant-dernière
        // liste publiée et re-proposait d'office, cochés, tous les
        // livres que la liste dépubliée contenait déjà.
        //
        // Les routes publiques (/api/listes-de-livres/{preview,position})
        // gardent `active: true` : elles décrivent ce que le site affiche,
        // quand celle-ci décrit ce qui existe.
        const lastCoupDeCoeur = await prisma.coupsDeCoeur.findFirst({
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true, title: true, active: true }
        });

        // La coupure par défaut, que `since` peut déplacer.
        //
        // « Depuis la dernière liste » a une propriété qu'on ne veut pas
        // perdre : elle ne saute aucun livre. Chaque nouveauté tombe dans
        // exactement une fenêtre, celle de la liste suivante. Mais quand
        // aucune liste n'a été publiée depuis longtemps, cette même
        // propriété propose des milliers de titres d'un coup — et un
        // plancher fixe (« deux mois ») rendrait définitivement invisibles
        // tous ceux d'avant, sans le dire.
        //
        // D'où un paramètre plutôt qu'une règle : le permanent voit la
        // coupure appliquée, il la déplace s'il veut une fenêtre plus
        // courte, et rien n'est jamais masqué à son insu. `recentWindow`
        // ci-dessous lui renvoie de quoi l'afficher.
        const sinceOverride = isParisDay(since) ? parisDayStartUtc(since) : null;
        const appliedSince = sinceOverride ?? lastCoupDeCoeur?.createdAt ?? null;
        if (appliedSince) {
            whereClause.createdAt = { gte: appliedSince };
        }
        recentWindow = {
            since: appliedSince?.toISOString() ?? null,
            defaultSince: lastCoupDeCoeur?.createdAt.toISOString() ?? null,
            defaultLabel: lastCoupDeCoeur?.title ?? null,
            defaultActive: lastCoupDeCoeur?.active ?? null,
        };

        // Une liste de livres annonce ce qu'on peut écouter MAINTENANT.
        // Un livre « en attente » est un enregistrement en cours : il n'a
        // rien à proposer, et il était pourtant présélectionné d'office
        // dans la nouvelle liste, à charge pour le permanent de le
        // décocher. `available` est justement le drapeau que la mise en
        // ligne d'un enregistrement lève (voir
        // /api/books/[id]/audio/commit) et que le catalogue public affiche
        // en « Disponible » / « En attente ».
        //
        // Passe après la coupure, jamais à sa place : la suggestion reste
        // « les nouveautés depuis la dernière liste », restreinte à celles
        // qui sont prêtes.
        whereClause.available = true;
    }

    // Perform search or regular query
    let books: BookWithGenres[];
    let total: number;

    if (search) {
        // Always use accent-insensitive search when there's a search term
        const result = await performAccentInsensitiveSearch(search, filter, genres, skip, limit, includeHidden, available, hiddenFilter, audio);
        books = result.books;
        total = result.total;
    } else {
        // No search: genre filter (if any) plus pagination
        if (genres.length > 0) {
            whereClause.genres = {
                some: { genreId: { in: genres } }
            };
        }
        [books, total] = await Promise.all([
            prisma.book.findMany({
                where: whereClause,
                include: {
                    genres: {
                        include: { genre: true }
                    }
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.book.count({ where: whereClause })
        ]);
    }

    // An exact id match leads the first page.
    //
    // Both search paths sort by createdAt, so the one book someone looked
    // up by number lands wherever its creation date puts it — and « 100 »
    // also matches every title and description containing those digits, so
    // it routinely sorts past the end of the page entirely. Promoting it
    // within the page isn't enough; when it's missing it's fetched on its
    // own, under the same visibility and genre filters the list obeys.
    const entityId = search ? parseEntityId(search) : null;
    if (entityId !== null && page === 1) {
        if (books.some((b) => b.id === entityId)) {
            books = promoteExactId(books, entityId);
        } else {
            const exact = await prisma.book.findFirst({
                where: {
                    AND: [
                        { id: entityId },
                        whereClause,
                        ...(genres.length > 0
                            ? [{ genres: { some: { genreId: { in: genres } } } }]
                            : []),
                    ],
                },
                include: { genres: { include: { genre: true } } },
            });
            if (exact) books = [exact, ...books.slice(0, -1)];
        }
    }

    // Scoped to every filter except availability, so these counts always
    // reflect the current search/genre/hidden/audio filters without being
    // gated by the availability filter they're meant to summarize.
    //
    // With a search term these go through the same accent-insensitive SQL
    // the list does — counting it any other way is how « etranger » came to
    // list 684 books above a count of 5. The Prisma path stays as the
    // fallback (and as the no-search path, where no unaccenting is
    // involved and one query beats two).
    let availableCount: number;
    let unavailableCount: number;

    const rawCounts = search
        ? await countAvailabilityRaw({ search, filter, genres, includeHidden, hiddenFilter, audio })
        : null;

    if (rawCounts) {
        ({ availableCount, unavailableCount } = rawCounts);
    } else {
        const scopedWhere = buildBookScopeWhere({
            searchTerm: search,
            filter,
            genreIds: genres,
            includeHidden,
            hidden: hiddenFilter,
            audio,
        });
        [availableCount, unavailableCount] = await Promise.all([
            prisma.book.count({ where: { AND: [scopedWhere, { available: true }] } }),
            prisma.book.count({ where: { AND: [scopedWhere, { available: false }] } }),
        ]);
    }

    // Only when the search found nothing — see rescueEmptyBookSearch.
    const searchSuggestions =
        suggest && search && total === 0
            ? await rescueEmptyBookSearch({ search, filter, genres, includeHidden, available, hiddenFilter, audio })
            : undefined;

    return {
        books,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        availableCount,
        unavailableCount,
        ...(recentWindow ? { recentWindow } : {}),
        ...(searchSuggestions ? { searchSuggestions } : {}),
    };
}

/**
 * Le catalogue public. Les contraintes publiques sont écrites ici, pas reçues :
 * jamais de livre masqué, jamais de filtre back-office, jamais autre chose que
 * `PublicBook` — quelle que soit la session de celui qui demande.
 */
export async function listPublicBooks(query: BookListQuery): Promise<BookListPage<PublicBook>> {
    const result = await listBooks({
        search: query.search,
        filter: query.filter,
        genres: query.genres,
        page: query.page,
        limit: query.limit,
        suggest: query.suggest,
        recent: false,
        since: null,
        includeHidden: false,
    });
    return {
        ...result,
        books: result.books.map(toPublicBook),
        ...(result.searchSuggestions
            ? {
                searchSuggestions: result.searchSuggestions.map((s) => ({
                    ...s,
                    rows: s.rows.map(toPublicBook),
                })),
            }
            : {}),
    };
}

/** Back-office only — call from behind `withAdmin`. Full rows, hidden books included. */
export function listAdminBooks(query: AdminBookListQuery): Promise<BookListPage<BookWithGenres>> {
    return listBooks({ ...query, includeHidden: true });
}

/** Back-office only — call from behind `withAdmin`. The Coup de cœur selector's lookup by id. */
export function findAdminBooksByIds(ids: number[]): Promise<BookWithGenres[]> {
    return prisma.book.findMany({
        where: { id: { in: ids } },
        include: { genres: { include: { genre: true } } },
    });
}
