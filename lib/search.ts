import { Prisma } from '@prisma/client';

/**
 * Split a query into search tokens.
 *
 * A leading « # » is dropped from each token, not just from the head of the
 * query, so « morvan #25485 » works as well as « #25485 » does — see
 * `lib/search-query.ts` for why the « # » has to go before an id is parsed.
 */
export function searchTokens(searchTerm: string): string[] {
    return searchTerm
        .trim()
        .split(/\s+/)
        .map((token) => token.replace(/^#+/, ''))
        .filter(Boolean);
}

/**
 * The User columns a single token may match. Deliberately one token: callers
 * that search across MORE than a person (a demande's auditeur *and* its book)
 * do their own token loop and hand each token in here, so a name and a title
 * can satisfy different tokens of the same query.
 */
export function userNameFieldsForToken(token: string): Prisma.UserWhereInput {
    const mode = Prisma.QueryMode.insensitive;
    return {
        OR: [
            { firstName: { contains: token, mode } },
            { lastName: { contains: token, mode } },
            { name: { contains: token, mode } },
            { email: { contains: token, mode } },
        ],
    };
}

/**
 * Build a case-insensitive, multi-token name search over a User relation.
 *
 * The search is split on whitespace and the tokens are AND-ed together, so a
 * full-name query like "steffy ref" matches firstName="Steffy" + lastName="Ref"
 * — which a single `contains "steffy ref"` never could, because no one column
 * holds both words. Each token must match at least one of firstName / lastName /
 * name / email.
 *
 * Returns null when the term has no usable tokens (empty / whitespace only), so
 * callers can skip adding a person clause entirely.
 *
 * For a list whose rows are people (paiements, the lecteurs in a dossier) this
 * is the whole search. For a list whose rows JOIN a person to something else
 * (demandes, attributions, factures) use `buildTokenizedSearch` instead —
 * see the note there.
 */
export function buildUserNameSearch(searchTerm: string): Prisma.UserWhereInput | null {
    const tokens = searchTokens(searchTerm);
    if (tokens.length === 0) return null;

    return { AND: tokens.map(userNameFieldsForToken) };
}

/**
 * Spread one query's tokens across every searchable field of a row, wherever
 * those fields live.
 *
 * The nesting is the whole point, and it's the opposite of what these lists
 * used to do. They tested the WHOLE query string against each field group in
 * turn — « does the auditeur's name contain "bernard morvan instructions"? does
 * the book's title? » — so a query naming two different things could never
 * match anything, however obviously it identified one row.
 *
 * Inverting it to AND-over-tokens( OR-over-fields ) means « bernard » and
 * « morvan » can be satisfied by the auditeur while « instructions » is
 * satisfied by the book, and the row matches. A one-token query is unchanged:
 * AND of a single OR is that OR.
 *
 * The trade-off is that every token must now hit something, so an extra word
 * that names no field ("bernard morvan facture") narrows to nothing rather than
 * being ignored. That is the intended reading of a multi-word query, and the
 * result count in the UI makes an over-narrowed search visible.
 *
 * Returns null for an empty query so callers can skip the clause entirely.
 */
export function buildTokenizedSearch<W>(
    searchTerm: string,
    fieldsForToken: (token: string) => W[]
): { OR: W[] }[] | null {
    const tokens = searchTokens(searchTerm);
    if (tokens.length === 0) return null;

    return tokens.map((token) => ({ OR: fieldsForToken(token) }));
}

/**
 * Per-list field maps.
 *
 * These live here, not in the routes, because every one of these lists is
 * searched from TWO places — the server page that renders it and the API route
 * that pages it — which until now each carried their own copy of the same
 * where-clause. Two copies of a search is two searches that drift.
 *
 * Each returns the AND-ed token clauses, or null for an empty query. Callers
 * assign them to `whereClause.AND` before adding their own filters (which all
 * merge into an existing AND).
 */

const contains = (token: string) => ({
    contains: token,
    mode: Prisma.QueryMode.insensitive,
});

/**
 * A token read as a row number, or null.
 *
 * OR-ed in alongside the text fields rather than replacing them, so « 100 »
 * still finds every title containing those digits as well as row 100 — and so
 * a mixed query like « morvan 25485 » can satisfy one token by name and the
 * other by number.
 */
function tokenAsId(token: string): number | null {
    if (!/^\d+$/.test(token)) return null;
    const id = Number(token);
    // Past int4 the query throws rather than simply missing.
    if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647) return null;
    return id;
}

/** Title / sous-titre / auteur of a Book, for one token. */
const bookTextFieldsForToken = (token: string) => [
    { title: contains(token) },
    { subtitle: contains(token) },
    { author: contains(token) },
];

/** Demandes: the auditeur, the book, and the demande's own number. */
export function buildOrderSearchWhere(searchTerm: string): Prisma.OrdersWhereInput[] | null {
    return buildTokenizedSearch<Prisma.OrdersWhereInput>(searchTerm, (token) => {
        const clauses: Prisma.OrdersWhereInput[] = [
            { aveugle: userNameFieldsForToken(token) },
            { catalogue: { OR: bookTextFieldsForToken(token) } },
        ];
        const id = tokenAsId(token);
        if (id !== null) clauses.push({ id });
        return clauses;
    });
}

/** Attributions: the lecteur (current or past), the auditeur, the book, the number. */
export function buildAssignmentSearchWhere(searchTerm: string): Prisma.AssignmentWhereInput[] | null {
    return buildTokenizedSearch<Prisma.AssignmentWhereInput>(searchTerm, (token) => {
        const person = userNameFieldsForToken(token);
        const clauses: Prisma.AssignmentWhereInput[] = [
            { catalogue: { OR: bookTextFieldsForToken(token) } },
            { readerHistory: { some: { reader: person } } },
            { order: { aveugle: person } },
        ];
        const id = tokenAsId(token);
        if (id !== null) clauses.push({ id });
        return clauses;
    });
}

/**
 * Factures: the auditeur, the books on the demandes the facture covers, the
 * payment reference (a cheque number is a thing people look a facture up by),
 * and the facture's own number.
 */
export function buildBillSearchWhere(searchTerm: string): Prisma.BillWhereInput[] | null {
    return buildTokenizedSearch<Prisma.BillWhereInput>(searchTerm, (token) => {
        const clauses: Prisma.BillWhereInput[] = [
            { client: userNameFieldsForToken(token) },
            { orders: { some: { catalogue: { OR: bookTextFieldsForToken(token) } } } },
            { paymentReference: contains(token) },
        ];
        const id = tokenAsId(token);
        if (id !== null) clauses.push({ id });
        return clauses;
    });
}

/**
 * Livres, for one token — the Prisma spelling of the field list.
 *
 * The book list has a THIRD implementation, the accent-insensitive raw SQL in
 * `app/api/books/route.ts`, which mirrors this set in SQL. Keep the three in
 * step: the count beside the list is built from this one, so a field that only
 * one of them searches shows up as a list and a count that disagree.
 */
export function bookFieldsForToken(token: string): Prisma.BookWhereInput[] {
    const clauses: Prisma.BookWhereInput[] = [
        ...bookTextFieldsForToken(token),
        { publisher: contains(token) },
        { isbn: contains(token) },
        { description: contains(token) },
        { genres: { some: { genre: { name: contains(token) } } } },
    ];
    const id = tokenAsId(token);
    if (id !== null) clauses.push({ id });
    return clauses;
}
