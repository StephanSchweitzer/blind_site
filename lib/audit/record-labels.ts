import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getUserDisplayName } from '@/lib/users/displayName';
import type { AuditRecordLabel } from '@/types';

/**
 * Naming the records the journal talks about.
 *
 * « Livre n°4549 » tells a reader nothing. This resolves that id to
 * « Le Ventre de Paris » / « Émile Zola » so a line of the trail can be read
 * without opening the record it refers to.
 *
 * THREE THINGS MAKE THIS LESS OBVIOUS THAN A JOIN
 *
 *  1. AuditEvent is heterogeneous: `recordId` is text and points into a
 *     different table on every row. There is no foreign key to join on, so the
 *     page is resolved model by model — one indexed `IN (…)` per distinct model
 *     present, typically two or three for a page of fifty.
 *  2. A DELETE's record no longer exists, and that is precisely the row a reader
 *     most wants named. Those labels are rebuilt from the event's own snapshot
 *     instead, which still holds the title or the name.
 *  3. Four of the models are soft-deleted (User, Bill, Payment, Orders) and the
 *     extension in lib/prisma.ts hides those rows from findMany. Everything here
 *     is therefore raw SQL, for the same reason the actor lookup in
 *     app/api/stats/audit/route.ts is: the trail must keep naming a record after
 *     the record has been retired.
 */

type Row = Record<string, unknown>;

const str = (value: unknown): string | null => {
    if (typeof value === 'string') return value.trim() || null;
    if (typeof value === 'number') return String(value);
    return null;
};

/** Euros without cents — these amounts are read, not reconciled. */
function euros(value: unknown): string | null {
    const raw = str(value);
    if (raw === null) return null;
    const amount = Number(raw);
    return Number.isFinite(amount)
        ? amount.toLocaleString('fr-FR', {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0,
          })
        : null;
}

/** The name parts every user-bearing query below selects under the same aliases. */
const userName = (row: Row, prefix = ''): string =>
    getUserDisplayName({
        name: str(row[`${prefix}name`]),
        firstName: str(row[`${prefix}firstName`]),
        lastName: str(row[`${prefix}lastName`]),
        email: str(row[`${prefix}email`]),
        civility: str(row[`${prefix}civility`]),
    });

const label = (title: string | null, subtitle: string | null = null): AuditRecordLabel | null =>
    title === null ? null : { title, subtitle };

interface LabelSource {
    /** One statement per model, ids always parameterized. */
    query: (ids: number[]) => Prisma.Sql;
    build: (row: Row) => AuditRecordLabel | null;
    /**
     * Same label, rebuilt from a DELETE snapshot. Omitted where the snapshot
     * holds only foreign keys and would produce something worse than silence.
     */
    fromSnapshot?: (snapshot: Row) => AuditRecordLabel | null;
    /**
     * The book a deleted record was ABOUT, read out of its snapshot.
     *
     * A demande and an attribution are named by their book, and a snapshot only
     * carries `catalogueId` — so they would be the one thing the journal could
     * never name after a deletion, which is precisely when a reader needs it.
     * The id is followed in a second pass (see resolveRecordLabels).
     */
    snapshotBookId?: (snapshot: Row) => number | null;
}

const asId = (value: unknown): number | null =>
    typeof value === 'number' && Number.isInteger(value) ? value : null;

/** Selected by every query that names a person, so `userName` can stay generic. */
const USER_NAME_COLUMNS = Prisma.sql`u.name, u."firstName", u."lastName", u.email, c.name AS civility`;
const USER_CIVILITY_JOIN = Prisma.sql`LEFT JOIN "Civility" c ON c.id = u."civilityId"`;

const SOURCES: Record<string, LabelSource> = {
    Book: {
        query: (ids) => Prisma.sql`
            SELECT id::text AS key, title, author
            FROM "Book" WHERE id IN (${Prisma.join(ids)})`,
        build: (row) => label(str(row.title), str(row.author)),
        fromSnapshot: (snap) => label(str(snap.title), str(snap.author)),
    },

    User: {
        query: (ids) => Prisma.sql`
            SELECT u.id::text AS key, ${USER_NAME_COLUMNS}
            FROM "User" u ${USER_CIVILITY_JOIN} WHERE u.id IN (${Prisma.join(ids)})`,
        build: (row) => label(userName(row) || null, str(row.email)),
        // No civility in a snapshot (it is a foreign key), so the name comes back
        // as « Prénom Nom » rather than « Mme Prénom Nom ». Close enough to name a
        // deleted person.
        fromSnapshot: (snap) =>
            label(getUserDisplayName({
                name: str(snap.name),
                firstName: str(snap.firstName),
                lastName: str(snap.lastName),
                email: str(snap.email),
            }) || null, str(snap.email)),
    },

    Orders: {
        query: (ids) => Prisma.sql`
            SELECT o.id::text AS key, b.title, ${USER_NAME_COLUMNS}
            FROM "Orders" o
            JOIN "Book" b ON b.id = o."catalogueId"
            JOIN "User" u ON u.id = o."aveugleId"
            ${USER_CIVILITY_JOIN}
            WHERE o.id IN (${Prisma.join(ids)})`,
        build: (row) => {
            const who = userName(row);
            return label(str(row.title), who ? `pour ${who}` : null);
        },
        snapshotBookId: (snap) => asId(snap.catalogueId),
    },

    Assignment: {
        query: (ids) => Prisma.sql`
            SELECT a.id::text AS key, b.title, b.author
            FROM "Assignment" a
            JOIN "Book" b ON b.id = a."catalogueId"
            WHERE a.id IN (${Prisma.join(ids)})`,
        build: (row) => label(str(row.title), str(row.author)),
        snapshotBookId: (snap) => asId(snap.catalogueId),
    },

    Bill: {
        query: (ids) => Prisma.sql`
            SELECT bl.id::text AS key, bl."invoiceAmount"::text AS amount, ${USER_NAME_COLUMNS}
            FROM "Bill" bl
            JOIN "User" u ON u.id = bl."clientId"
            ${USER_CIVILITY_JOIN}
            WHERE bl.id IN (${Prisma.join(ids)})`,
        build: (row) => label(userName(row) || null, euros(row.amount)),
    },

    Payment: {
        query: (ids) => Prisma.sql`
            SELECT p.id::text AS key, p.amount::text AS amount, ${USER_NAME_COLUMNS}
            FROM "Payment" p
            LEFT JOIN "User" u ON u.id = p."clientId"
            ${USER_CIVILITY_JOIN}
            WHERE p.id IN (${Prisma.join(ids)})`,
        build: (row) => label(euros(row.amount), userName(row) || null),
        // Deleting a paiement is exactly when the amount matters most, and the
        // snapshot carries it.
        fromSnapshot: (snap) => label(euros(snap.amount)),
    },

    CoupsDeCoeur: {
        query: (ids) => Prisma.sql`
            SELECT id::text AS key, title FROM "CoupsDeCoeur" WHERE id IN (${Prisma.join(ids)})`,
        build: (row) => label(str(row.title)),
        fromSnapshot: (snap) => label(str(snap.title)),
    },

    News: {
        query: (ids) => Prisma.sql`
            SELECT id::text AS key, title FROM "News" WHERE id IN (${Prisma.join(ids)})`,
        build: (row) => label(str(row.title)),
        fromSnapshot: (snap) => label(str(snap.title)),
    },

    // The small reference tables all name themselves the same way.
    ...Object.fromEntries(
        (['Genre', 'Status', 'MediaFormat', 'Civility', 'TeamMember'] as const).map((model) => [
            model,
            {
                query: (ids: number[]) => Prisma.sql`
                    SELECT id::text AS key, name
                    FROM ${Prisma.raw(`"${model}"`)} WHERE id IN (${Prisma.join(ids)})`,
                build: (row: Row) => label(str(row.name)),
                fromSnapshot: (snap: Row) => label(str(snap.name)),
            } satisfies LabelSource,
        ])
    ),
};

/** Models this module can name at all — the audit route uses it to skip the rest. */
export const isLabelledModel = (model: string): boolean => model in SOURCES;

export interface LabelRequest {
    model: string;
    recordId: string;
    /** Parsed DELETE snapshot, when the event carries one. */
    snapshot: Row | null;
}

export const labelKey = (model: string, recordId: string): string => `${model}:${recordId}`;

/**
 * Resolve a page of events to display labels, keyed `model:recordId`.
 *
 * One query per distinct model that still has live rows to look up; a model
 * whose rows are all deletions costs nothing. Bulk events (`recordId = '*'`) and
 * composite keys are skipped — there is no single record to name.
 */
export async function resolveRecordLabels(
    requests: LabelRequest[]
): Promise<Map<string, AuditRecordLabel>> {
    const labels = new Map<string, AuditRecordLabel>();
    const pending = new Map<string, Set<number>>();

    for (const { model, recordId, snapshot } of requests) {
        const source = SOURCES[model];
        if (!source) continue;

        const key = labelKey(model, recordId);
        if (labels.has(key)) continue;

        // A snapshot is the only way to name a record that no longer exists, and
        // it is also cheaper than a lookup — so it wins whenever it can answer.
        if (snapshot && source.fromSnapshot) {
            const fromSnapshot = source.fromSnapshot(snapshot);
            if (fromSnapshot) {
                labels.set(key, fromSnapshot);
                continue;
            }
        }

        const id = /^\d+$/.test(recordId) ? Number(recordId) : null;
        if (id === null) continue;
        const ids = pending.get(model);
        if (ids) ids.add(id);
        else pending.set(model, new Set([id]));
    }

    await Promise.all(
        [...pending].map(async ([model, ids]) => {
            const source = SOURCES[model];
            try {
                const rows = await prisma.$queryRaw<Row[]>(source.query([...ids]));
                for (const row of rows) {
                    const key = str(row.key);
                    const built = key === null ? null : source.build(row);
                    if (key !== null && built) labels.set(labelKey(model, key), built);
                }
            } catch (error) {
                // A label is a convenience. Losing one must never cost the journal
                // the page it was decorating.
                console.error(`[audit] libellés ${model} — abandon:`, error);
            }
        })
    );

    await nameByReferencedBook(requests, labels);
    return labels;
}

/**
 * Second pass, for the records the first one could not name: a deleted demande
 * or attribution, whose own row is gone and whose snapshot holds a `catalogueId`
 * rather than a title.
 *
 * Runs at most one extra query, and only when such a deletion is on the page.
 */
async function nameByReferencedBook(
    requests: LabelRequest[],
    labels: Map<string, AuditRecordLabel>
): Promise<void> {
    const wanted = new Map<string, number>();
    for (const { model, recordId, snapshot } of requests) {
        const follow = SOURCES[model]?.snapshotBookId;
        if (!follow || !snapshot) continue;
        const key = labelKey(model, recordId);
        if (labels.has(key) || wanted.has(key)) continue;
        const bookId = follow(snapshot);
        if (bookId !== null) wanted.set(key, bookId);
    }
    if (wanted.size === 0) return;

    try {
        const ids = [...new Set(wanted.values())];
        const rows = await prisma.$queryRaw<Row[]>`
            SELECT id::text AS key, title, author
            FROM "Book" WHERE id IN (${Prisma.join(ids)})`;
        const books = new Map(rows.map((row) => [str(row.key), row]));

        for (const [key, bookId] of wanted) {
            const book = books.get(String(bookId));
            const title = book ? str(book.title) : null;
            // Named after the book it concerned, said plainly — the record itself
            // is gone, and its title was never its own.
            if (title) labels.set(key, { title, subtitle: str(book?.author) });
        }
    } catch (error) {
        console.error('[audit] libellés par livre référencé — abandon:', error);
    }
}

/**
 * Ids of records whose label matches `term`, for the « Enregistrement » search.
 *
 * Searching AuditEvent itself is not an option: `recordId` is text pointing at a
 * dozen different tables, so a LIKE over it would seq-scan the trail and match
 * nothing useful. The search runs against the real tables instead — where the
 * titles live and are indexed — and comes back as the id list the journal query
 * then filters on, which its own [model, recordId] index serves.
 *
 * Capped: a two-letter term must not turn into an IN list of ten thousand ids.
 */
const SUBJECT_SEARCH_LIMIT = 200;

export interface SubjectMatch {
    model: string;
    recordIds: string[];
}

export async function findRecordsByTerm(term: string): Promise<SubjectMatch[]> {
    const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

    const [books, users] = await Promise.all([
        prisma.$queryRaw<Array<{ id: number }>>`
            SELECT id FROM "Book"
            WHERE title ILIKE ${like} OR author ILIKE ${like}
            ORDER BY id DESC LIMIT ${SUBJECT_SEARCH_LIMIT}`,
        prisma.$queryRaw<Array<{ id: number }>>`
            SELECT id FROM "User"
            WHERE name ILIKE ${like}
               OR email ILIKE ${like}
               OR concat_ws(' ', "firstName", "lastName") ILIKE ${like}
            ORDER BY id DESC LIMIT ${SUBJECT_SEARCH_LIMIT}`,
    ]);

    const bookIds = books.map((b) => String(b.id));
    const userIds = users.map((u) => String(u.id));

    // A demande or an attribution is *about* a book, so a book match should find
    // the events on them too — that is what someone typing a title is after.
    const [orders, assignments] = await Promise.all([
        bookIds.length
            ? prisma.$queryRaw<Array<{ id: number }>>`
                SELECT id FROM "Orders"
                WHERE "catalogueId" IN (${Prisma.join(books.map((b) => b.id))})
                ORDER BY id DESC LIMIT ${SUBJECT_SEARCH_LIMIT}`
            : [],
        bookIds.length
            ? prisma.$queryRaw<Array<{ id: number }>>`
                SELECT id FROM "Assignment"
                WHERE "catalogueId" IN (${Prisma.join(books.map((b) => b.id))})
                ORDER BY id DESC LIMIT ${SUBJECT_SEARCH_LIMIT}`
            : [],
    ]);

    return [
        { model: 'Book', recordIds: bookIds },
        { model: 'User', recordIds: userIds },
        { model: 'Orders', recordIds: orders.map((o) => String(o.id)) },
        { model: 'Assignment', recordIds: assignments.map((a) => String(a.id)) },
    ].filter((match) => match.recordIds.length > 0);
}
