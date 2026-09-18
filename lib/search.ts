import { Prisma } from '@prisma/client';
import {
    foldForLabelMatch,
    normalizeSearchText,
    searchKeyVariants,
    searchVariants,
} from '@/lib/search-normalize';
import { newsTypeLabels } from '@/types/news';

/**
 * Split a query into search tokens.
 *
 * A leading « # » is dropped from each token, not just from the head of the
 * query, so « morvan #25485 » works as well as « #25485 » does — see
 * `lib/search-query.ts` for why the « # » has to go before an id is parsed.
 *
 * Normalized first so that a non-breaking space pasted out of Word splits the
 * query the way a typed space does, and so every token reaches the field
 * builders in one canonical spelling — see `lib/search-normalize.ts`.
 */
export function searchTokens(searchTerm: string): string[] {
    return normalizeSearchText(searchTerm)
        .split(/\s+/)
        .map((token) => token.replace(/^#+/, ''))
        .filter(Boolean);
}

/**
 * One clause per typographic spelling of `token`, for a single field.
 *
 * Prisma compares raw bytes: there is no `unaccent(col)` to wrap the column in,
 * so the only way to match a stored « d’éternité » from a typed « d'éternité »
 * is to look for both. `searchVariants` returns exactly one string for a token
 * with no apostrophe and no hyphen — almost every token — so the ordinary query
 * builds the same single clause it always did.
 */
export function fieldVariants<W>(token: string, build: (value: string) => W): W[] {
    return searchVariants(token).map(build);
}

/**
 * The User clause a single token must satisfy. Deliberately one token: callers
 * that search across MORE than a person (a demande's auditeur *and* its book)
 * do their own token loop and hand each token in here, so a name and a title
 * can satisfy different tokens of the same query.
 *
 * Matched against `searchKey` — prénom, nom, name and email in one column,
 * lower-cased and accent-folded by a trigger — rather than the four columns
 * themselves, because Prisma compares those byte for byte: « Muller » never
 * found « Müller », nor « Noel » « Noël ». The token is folded the same way on
 * this side (see foldForSearchKey), so the comparison is a plain, case-
 * sensitive `contains`.
 *
 * `searchKeyVariants` keeps the hyphen expansion, so « Jean-Pierre » is still
 * found by « Jean Pierre » — 77 of the 858 people on file carry a hyphenated
 * name, and nobody remembers which half took the hyphen.
 */
export function userNameFieldsForToken(token: string): Prisma.UserWhereInput {
    return {
        OR: searchKeyVariants(token).map((v) => ({ searchKey: { contains: v } })),
    };
}

/**
 * Build a case- and accent-insensitive, multi-token name search over a User relation.
 *
 * The search is split on whitespace and the tokens are AND-ed together, so a
 * full-name query like "steffy ref" matches firstName="Steffy" + lastName="Ref"
 * — which a single `contains "steffy ref"` never could, because no one column
 * holds both words. Each token must match somewhere in firstName / lastName /
 * name / email (through `searchKey`).
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
 * The AND clauses a where object already carries, as an array.
 *
 * Prisma types `AND` as a clause, an array of clauses, or absent, so every
 * filter wanting to add one has to handle all three — and the inline spelling
 * of that got copied around until somewhere got it wrong. The demandes tab of a
 * dossier ASSIGNED `AND` for « à rendre » and « en retard », which silently
 * discarded whatever the search had put there.
 */
export function andClauses<W>(where: { AND?: W | W[] | undefined }): W[] {
    if (!where.AND) return [];
    return Array.isArray(where.AND) ? where.AND : [where.AND];
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

/**
 * `contains`, case-insensitive — the comparison every text search here uses.
 *
 * Exported so a list that has to build its own field map spells the comparison
 * the way the shared builders do; pair it with `fieldVariants`, never on its
 * own, or that list is back to matching raw bytes.
 */
export const containsInsensitive = (value: string) => ({
    contains: value,
    mode: Prisma.QueryMode.insensitive,
});

const contains = containsInsensitive;

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

/**
 * Title / sous-titre / auteur of a Book, for one token.
 *
 * This is the set that made staff distrust the demandes and attributions bars:
 * « L'étranger » typed with a straight apostrophe never reached a title stored
 * with a curly one. `fieldVariants` is what closes that, here and everywhere
 * else a book is searched through Prisma.
 */
const bookTextFieldsForToken = (token: string) => [
    ...fieldVariants(token, (v) => ({ title: contains(v) })),
    ...fieldVariants(token, (v) => ({ subtitle: contains(v) })),
    ...fieldVariants(token, (v) => ({ author: contains(v) })),
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

/**
 * Attributions: the lecteur (current or past), the auditeur, the book, the
 * attribution's own number — AND the number of the demande it's linked to.
 * The latter is what lets an admin blocked from creating a second attribution
 * on a demande ("Cette demande possède déjà une attribution") search that
 * demande's id here and land straight on the one already holding it, the same
 * ambiguous-token trick buildBillSearchWhere uses for facture numbers.
 */
export function buildAssignmentSearchWhere(searchTerm: string): Prisma.AssignmentWhereInput[] | null {
    return buildTokenizedSearch<Prisma.AssignmentWhereInput>(searchTerm, (token) => {
        const person = userNameFieldsForToken(token);
        const clauses: Prisma.AssignmentWhereInput[] = [
            { catalogue: { OR: bookTextFieldsForToken(token) } },
            { readerHistory: { some: { reader: person } } },
            { order: { aveugle: person } },
        ];
        const id = tokenAsId(token);
        if (id !== null) {
            clauses.push({ id });
            clauses.push({ orderId: id });
        }
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
            ...fieldVariants(token, (v) => ({ paymentReference: contains(v) })),
        ];
        const id = tokenAsId(token);
        if (id !== null) clauses.push({ id });
        return clauses;
    });
}

/**
 * Paiements : la personne, la référence du règlement, le n° de reçu, l'année de
 * cotisation, le numéro du paiement — et le numéro de la FACTURE réglée.
 *
 * Ce dernier est la raison d'être de cette fonction. La liste ne cherchait que
 * le nom du client (`buildUserNameSearch`), si bien qu'un permanent tenant une
 * facture en main n'avait aucun moyen de retrouver le paiement qui l'a réglée
 * autrement qu'en devinant le nom de l'auditeur. « 412 » trouve maintenant le
 * paiement n° 412 ET les paiements de la facture n° 412 — les deux lectures du
 * même chiffre, laissée au lecteur, comme partout ailleurs (voir tokenAsId).
 *
 * Les rows de cette liste sont des paiements, pas des jointures, mais elle
 * cherche sur plus que la personne : c'est donc `buildTokenizedSearch` et non
 * `buildUserNameSearch`, comme pour les demandes et les factures.
 */
export function buildPaymentSearchWhere(searchTerm: string): Prisma.PaymentWhereInput[] | null {
    return buildTokenizedSearch<Prisma.PaymentWhereInput>(searchTerm, (token) => {
        const clauses: Prisma.PaymentWhereInput[] = [
            { client: userNameFieldsForToken(token) },
            ...fieldVariants(token, (v) => ({ paymentReference: contains(v) })),
            ...fieldVariants(token, (v) => ({ receiptNumber: contains(v) })),
            ...fieldVariants(token, (v) => ({ observations: contains(v) })),
        ];
        const id = tokenAsId(token);
        if (id !== null) {
            clauses.push({ id });
            clauses.push({ billId: id });
            // Une année de cotisation est un nombre à quatre chiffres ; la
            // borner évite d'ajouter une clause qui ne peut rien rendre.
            if (id >= 1900 && id <= 2200) clauses.push({ cotisationYear: id });
        }
        return clauses;
    });
}

/**
 * Livres, for one token — the Prisma spelling of the field list.
 *
 * The book list has a THIRD implementation, the accent-insensitive raw SQL in
 * `lib/books/bookList.ts`, which mirrors this set in SQL. Keep the three in
 * step: the count beside the list is built from this one, so a field that only
 * one of them searches shows up as a list and a count that disagree.
 */
export function bookFieldsForToken(token: string): Prisma.BookWhereInput[] {
    const clauses: Prisma.BookWhereInput[] = [
        ...bookTextFieldsForToken(token),
        ...fieldVariants(token, (v) => ({ publisher: contains(v) })),
        ...fieldVariants(token, (v) => ({ isbn: contains(v) })),
        ...fieldVariants(token, (v) => ({ description: contains(v) })),
        ...fieldVariants(token, (v) => ({ genres: { some: { genre: { name: contains(v) } } } })),
    ];
    const id = tokenAsId(token);
    if (id !== null) clauses.push({ id });
    return clauses;
}

/**
 * Genres: nom et description.
 *
 * Tokenisé comme le reste depuis qu'il ne l'était pas : la recherche testait la
 * saisie entière contre chaque colonne, si bien que « roman policier » ne
 * trouvait pas le genre « Policier / Roman noir ».
 */
export function buildGenreSearchWhere(searchTerm: string): Prisma.GenreWhereInput[] | null {
    return buildTokenizedSearch<Prisma.GenreWhereInput>(searchTerm, (token) => [
        ...fieldVariants(token, (v) => ({ name: contains(v) })),
        ...fieldVariants(token, (v) => ({ description: contains(v) })),
    ]);
}

/**
 * Les valeurs de type dont le LIBELLÉ FRANÇAIS contient ce token.
 *
 * `News.type` stocke la valeur brute (« EVENEMENT »), mais ce que le permanent
 * lit à l'écran est « Événement » — et `contains` en base est insensible à la
 * casse, pas aux accents : taper le mot affiché ne rendait donc rien. Le
 * rapprochement se fait ici, en mémoire, où les accents peuvent être repliés
 * proprement (voir foldForLabelMatch).
 */
export function newsTypesMatchingLabel(token: string): string[] {
    const needle = foldForLabelMatch(token);
    if (!needle) return [];
    return Object.entries(newsTypeLabels)
        .filter(([, label]) => foldForLabelMatch(label).includes(needle))
        .map(([value]) => value);
}

/** Listes de livres : le titre de la liste, sa description, qui l'a créée, les livres dedans. */
export function buildCoupsDeCoeurSearchWhere(
    searchTerm: string,
): Prisma.CoupsDeCoeurWhereInput[] | null {
    return buildTokenizedSearch<Prisma.CoupsDeCoeurWhereInput>(searchTerm, (token) => {
        const clauses: Prisma.CoupsDeCoeurWhereInput[] = [
            ...fieldVariants(token, (v) => ({ title: contains(v) })),
            ...fieldVariants(token, (v) => ({ description: contains(v) })),
            ...fieldVariants(token, (v) => ({ addedBy: { name: contains(v) } })),
            { books: { some: { book: { OR: bookTextFieldsForToken(token) } } } },
        ];
        const id = tokenAsId(token);
        if (id !== null) clauses.push({ id });
        return clauses;
    });
}

/**
 * La même recherche, côté PUBLIC.
 *
 * Volontairement une fonction distincte plutôt qu'un drapeau : elle ne cherche
 * ni le nom du permanent qui a créé la liste, ni les livres masqués du
 * catalogue. Les deux contraintes sont écrites ici, comme `listPublicBooks`
 * écrit les siennes (lib/books/bookList.ts), pour qu'aucun appelant public ne
 * puisse oublier de les passer.
 */
export function buildPublicCoupsDeCoeurSearchWhere(
    searchTerm: string,
): Prisma.CoupsDeCoeurWhereInput[] | null {
    return buildTokenizedSearch<Prisma.CoupsDeCoeurWhereInput>(searchTerm, (token) => [
        ...fieldVariants(token, (v) => ({ title: contains(v) })),
        ...fieldVariants(token, (v) => ({ description: contains(v) })),
        {
            books: {
                some: {
                    // A nested relation filter, not a top-level Book read: the global
                    // soft-delete extension (lib/prisma.ts) only patches direct
                    // `book.*` calls, so `deletedAt` needs stating here explicitly —
                    // same reason `hiddenFromCatalogue` already is, just below it.
                    book: {
                        OR: bookTextFieldsForToken(token),
                        hiddenFromCatalogue: false,
                        deletedAt: null,
                    },
                },
            },
        },
    ]);
}

/** Corbeille audio : le fichier, sa clé, le titre du livre d'origine, son numéro. */
export function buildDeletedAudioSearchWhere(
    searchTerm: string,
): Prisma.DeletedAudioTrackWhereInput[] | null {
    return buildTokenizedSearch<Prisma.DeletedAudioTrackWhereInput>(searchTerm, (token) => {
        const clauses: Prisma.DeletedAudioTrackWhereInput[] = [
            ...fieldVariants(token, (v) => ({ filename: contains(v) })),
            ...fieldVariants(token, (v) => ({ originalKey: contains(v) })),
            ...fieldVariants(token, (v) => ({ originBookTitle: contains(v) })),
            ...fieldVariants(token, (v) => ({ book: { title: contains(v) } })),
        ];
        const id = tokenAsId(token);
        if (id !== null) {
            clauses.push({ originBookId: id });
            clauses.push({ bookId: id });
        }
        return clauses;
    });
}

/** Audio orphelin : le titre du dossier, son préfixe dans le bucket, son numéro. */
export function buildOrphanFolderSearchWhere(
    searchTerm: string,
): Prisma.OrphanAudioFolderWhereInput[] | null {
    return buildTokenizedSearch<Prisma.OrphanAudioFolderWhereInput>(searchTerm, (token) => {
        const clauses: Prisma.OrphanAudioFolderWhereInput[] = [
            ...fieldVariants(token, (v) => ({ title: contains(v) })),
            ...fieldVariants(token, (v) => ({ prefix: contains(v) })),
        ];
        const id = tokenAsId(token);
        if (id !== null) clauses.push({ folderNum: id });
        return clauses;
    });
}

/**
 * Doublons : titre, auteur, ISBN — plus les trois numéros sous lesquels un
 * livre de la file se connaît (le sien, celui de l'import Access, l'id_arbre
 * qui désigne son jumeau).
 */
export function buildBookReviewSearchWhere(searchTerm: string): Prisma.BookWhereInput[] | null {
    return buildTokenizedSearch<Prisma.BookWhereInput>(searchTerm, (token) => {
        const clauses: Prisma.BookWhereInput[] = [
            ...fieldVariants(token, (v) => ({ title: contains(v) })),
            ...fieldVariants(token, (v) => ({ author: contains(v) })),
            ...fieldVariants(token, (v) => ({ isbn: contains(v) })),
        ];
        clauses.push(...bookReviewIdClauses(token));
        return clauses;
    });
}

/** Les trois numéros d'un livre de la file des doublons, pour un token. */
export function bookReviewIdClauses(token: string): Prisma.BookWhereInput[] {
    const id = tokenAsId(token);
    if (id === null) return [];
    return [{ id }, { source_access_id: id }, { id_arbre: id }];
}
