import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getUserDisplayName } from '@/lib/users/displayName';
import type { AuditChangeMap, AuditFieldLabelEntry, AuditRecordLabel } from '@/types';

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

/**
 * A label that names a BOOK the audited row merely refers to, and carries the
 * link to it. Used where the row itself has no name and no screen — an audio
 * track event is « une piste du Ventre de Paris », never a record of its own.
 */
const bookLabel = (
    title: string | null,
    author: string | null,
    bookId: unknown
): AuditRecordLabel | null => {
    if (title === null) return null;
    const id = asId(bookId);
    return {
        title,
        subtitle: author,
        linked: id === null ? null : { model: 'Book', recordId: String(id) },
    };
};

/**
 * A label that names the ATTRIBUTION (by its book) an AssignmentReader row
 * belongs to, and carries the link to it. Used the same way as `bookLabel` —
 * a lecteur d'attribution is a history line on the attribution's timeline,
 * never a record with a screen of its own.
 */
const assignmentLabel = (
    title: string | null,
    author: string | null,
    assignmentId: unknown
): AuditRecordLabel | null => {
    if (title === null) return null;
    const id = asId(assignmentId);
    return {
        title,
        subtitle: author,
        linked: id === null ? null : { model: 'Assignment', recordId: String(id) },
    };
};

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
    /**
     * The book a record was about, read out of the event's own diff — the only
     * trace left when the write was a BATCH.
     *
     * Prisma's createMany returns no rows, so such an event is stored under
     * recordId '*' and there is nothing to join on. What the extension keeps
     * instead is what every inserted row agreed on (see sharedChanges), and for
     * a folder upload or a « vider le dossier » that includes the bookId.
     */
    changesBookId?: (changes: Row) => number | null;
    /**
     * True when a label built from that book should also LINK to it. Set only
     * where the audited row has no screen of its own: opening the book is then
     * the only useful destination, and it is the one a reader wants.
     */
    linksToBook?: boolean;
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

    // No fromSnapshot: AudioTrackEvent rows are create-only, so a DELETE
    // snapshot never happens. The live join names a row inserted one at a time
    // (a renommage, a restauration); a batch — a folder upload, « vider le
    // dossier » — has no id to join on and is named from its diff instead.
    AudioTrackEvent: {
        query: (ids) => Prisma.sql`
            SELECT e.id::text AS key, e."bookId", b.title, b.author
            FROM "AudioTrackEvent" e
            LEFT JOIN "Book" b ON b.id = e."bookId"
            WHERE e.id IN (${Prisma.join(ids)})`,
        build: (row) => bookLabel(str(row.title), str(row.author), row.bookId),
        changesBookId: (changes) => asId(changes.bookId),
        linksToBook: true,
    },

    // No fromSnapshot: the snapshot carries only assignmentId/readerId, and a
    // second join back to Assignment → Book from a plain id would duplicate
    // the live query for no benefit — a deleted row is left unnamed instead,
    // same trade-off AssignmentReader accepts everywhere else here.
    AssignmentReader: {
        query: (ids) => Prisma.sql`
            SELECT ar.id::text AS key, ar."assignmentId", b.title, b.author
            FROM "AssignmentReader" ar
            JOIN "Assignment" a ON a.id = ar."assignmentId"
            JOIN "Book" b ON b.id = a."catalogueId"
            WHERE ar.id IN (${Prisma.join(ids)})`,
        build: (row) => assignmentLabel(str(row.title), str(row.author), row.assignmentId),
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

/**
 * Model.field → the model an id-valued diff field points at.
 *
 * `recordLabel` above names the audited row itself; this is the analogous map
 * for the OTHER ids that show up inside a diff — a demande's `statusId`
 * changing, an attribution's `readerId` moving from one lecteur to another.
 * Only plain foreign keys belong here, not every Int column (Book.pageCount
 * is just a count with nothing to join on).
 */
const FK_FIELD_TARGETS: Record<string, string> = {
    'Orders.aveugleId': 'User',
    'Orders.catalogueId': 'Book',
    'Orders.statusId': 'Status',
    'Orders.mediaFormatId': 'MediaFormat',
    'Orders.processedByStaffId': 'User',
    'Orders.billId': 'Bill',
    'Assignment.catalogueId': 'Book',
    'Assignment.orderId': 'Orders',
    'Assignment.statusId': 'Status',
    'Assignment.processedByStaffId': 'User',
    'AssignmentReader.assignmentId': 'Assignment',
    'AssignmentReader.readerId': 'User',
    'User.civilityId': 'Civility',
    'User.preferredMediaFormatId': 'MediaFormat',
    'Bill.clientId': 'User',
    'Payment.clientId': 'User',
    'Payment.billId': 'Bill',
    'Book.addedById': 'User',
    'News.authorId': 'User',
    'AudioTrackEvent.performedById': 'User',
    'AudioTrackEvent.bookId': 'Book',
};

/** Same label a record's own name uses, flattened to one line for a diff cell. */
const flatten = (built: AuditRecordLabel | null): string | null =>
    built === null ? null : built.subtitle ? `${built.title} — ${built.subtitle}` : built.title;

/**
 * Resolve the foreign-key ids inside a page's diffs to display names.
 *
 * One query per distinct target model, exactly like `resolveRecordLabels` —
 * reuses the same `SOURCES` so a book or a person is never named two
 * different ways depending on which side of the journal is reading it. A
 * field whose id fails to resolve (the row it pointed at was itself deleted)
 * is left out of the result; the caller falls back to the raw id, same as
 * for any other unlabelled value.
 */
export async function resolveFieldLabels(
    requests: Array<Pick<LabelRequest, 'id' | 'model' | 'changes'>>
): Promise<Map<number, Record<string, AuditFieldLabelEntry>>> {
    const result = new Map<number, Record<string, AuditFieldLabelEntry>>();

    interface Slot {
        eventId: number;
        field: string;
        side: 'before' | 'after';
        targetModel: string;
        id: number;
    }
    const slots: Slot[] = [];
    const pending = new Map<string, Set<number>>();

    const queue = (eventId: number, field: string, side: 'before' | 'after', targetModel: string, value: unknown) => {
        const id = asId(value);
        if (id === null) return;
        slots.push({ eventId, field, side, targetModel, id });
        const ids = pending.get(targetModel);
        if (ids) ids.add(id);
        else pending.set(targetModel, new Set([id]));
    };

    for (const { id: eventId, model, changes } of requests) {
        if (!changes) continue;
        for (const [field, [before, after]] of Object.entries(changes)) {
            const targetModel = FK_FIELD_TARGETS[`${model}.${field}`];
            if (!targetModel || !SOURCES[targetModel]) continue;
            queue(eventId, field, 'before', targetModel, before);
            queue(eventId, field, 'after', targetModel, after);
        }
    }
    if (slots.length === 0) return result;

    const namesByModel = new Map<string, Map<number, string>>();
    await Promise.all(
        [...pending].map(async ([targetModel, ids]) => {
            const source = SOURCES[targetModel];
            try {
                const rows = await prisma.$queryRaw<Row[]>(source.query([...ids]));
                const names = new Map<number, string>();
                for (const row of rows) {
                    const key = str(row.key);
                    const name = key === null ? null : flatten(source.build(row));
                    if (key !== null && name !== null) names.set(Number(key), name);
                }
                namesByModel.set(targetModel, names);
            } catch (error) {
                // Same trade-off as resolveRecordLabels: a name is a convenience,
                // never worth losing the page it was decorating.
                console.error(`[audit] libellés de champ ${targetModel} — abandon:`, error);
            }
        })
    );

    for (const { eventId, field, side, targetModel, id } of slots) {
        const name = namesByModel.get(targetModel)?.get(id);
        if (name === undefined) continue;
        const forEvent = result.get(eventId) ?? {};
        const entry = forEvent[field] ?? { before: null, after: null };
        entry[side] = name;
        forEvent[field] = entry;
        result.set(eventId, forEvent);
    }

    return result;
}

export interface LabelRequest {
    /**
     * The event's own id. Labels come back keyed on THIS rather than on
     * `model:recordId`, because a batch write is stored under recordId '*' for
     * every one of them: two folder uploads on one page would otherwise both
     * wear the name of whichever book was resolved first.
     */
    id: number;
    model: string;
    recordId: string;
    /** Parsed DELETE snapshot, when the event carries one. */
    snapshot: Row | null;
    /** The event's own diff — how a batch event names what it was about. */
    changes: AuditChangeMap | null;
}

const labelKey = (model: string, recordId: string): string => `${model}:${recordId}`;

/** A diff read as a row: only the « après » side names anything. */
const afterOf = (changes: AuditChangeMap): Row =>
    Object.fromEntries(Object.entries(changes).map(([field, [, after]]) => [field, after]));

/**
 * Resolve a page of events to display labels, keyed on the event id.
 *
 * One query per distinct model that still has live rows to look up — several
 * events on one record share a single lookup, and a model whose rows are all
 * deletions costs nothing. Composite keys are skipped; a batch event has no
 * single record to name and is handled by the second pass below.
 */
export async function resolveRecordLabels(
    requests: LabelRequest[]
): Promise<Map<number, AuditRecordLabel>> {
    const labels = new Map<number, AuditRecordLabel>();
    /** One label per distinct record, so N events on it cost one lookup. */
    const byRecord = new Map<string, AuditRecordLabel>();
    const pending = new Map<string, Set<number>>();
    /** Events waiting on a lookup, filled in once it lands. */
    const waiting: Array<{ id: number; key: string }> = [];

    for (const { id, model, recordId, snapshot } of requests) {
        const source = SOURCES[model];
        if (!source) continue;

        const key = labelKey(model, recordId);
        const known = byRecord.get(key);
        if (known) {
            labels.set(id, known);
            continue;
        }

        // A snapshot is the only way to name a record that no longer exists, and
        // it is also cheaper than a lookup — so it wins whenever it can answer.
        if (snapshot && source.fromSnapshot) {
            const fromSnapshot = source.fromSnapshot(snapshot);
            if (fromSnapshot) {
                byRecord.set(key, fromSnapshot);
                labels.set(id, fromSnapshot);
                continue;
            }
        }

        const numericId = /^\d+$/.test(recordId) ? Number(recordId) : null;
        if (numericId === null) continue;
        waiting.push({ id, key });
        const ids = pending.get(model);
        if (ids) ids.add(numericId);
        else pending.set(model, new Set([numericId]));
    }

    await Promise.all(
        [...pending].map(async ([model, ids]) => {
            const source = SOURCES[model];
            try {
                const rows = await prisma.$queryRaw<Row[]>(source.query([...ids]));
                for (const row of rows) {
                    const key = str(row.key);
                    const built = key === null ? null : source.build(row);
                    if (key !== null && built) byRecord.set(labelKey(model, key), built);
                }
            } catch (error) {
                // A label is a convenience. Losing one must never cost the journal
                // the page it was decorating.
                console.error(`[audit] libellés ${model} — abandon:`, error);
            }
        })
    );

    for (const { id, key } of waiting) {
        const built = byRecord.get(key);
        if (built) labels.set(id, built);
    }

    await nameByReferencedBook(requests, labels);
    return labels;
}

/**
 * Second pass, for the events the first one could not name — the two cases
 * where the record itself cannot answer:
 *
 *   - a deleted demande or attribution, whose own row is gone and whose
 *     snapshot holds a `catalogueId` rather than a title;
 *   - a batch of pistes audio, stored under recordId '*' because createMany
 *     hands back no rows, and whose bookId survives only in its diff.
 *
 * Runs at most one extra query, and only when such an event is on the page.
 */
async function nameByReferencedBook(
    requests: LabelRequest[],
    labels: Map<number, AuditRecordLabel>
): Promise<void> {
    const wanted = new Map<number, { bookId: number; link: boolean }>();
    for (const { id, model, snapshot, changes } of requests) {
        const source = SOURCES[model];
        if (!source || labels.has(id) || wanted.has(id)) continue;

        const bookId =
            (snapshot ? source.snapshotBookId?.(snapshot) ?? null : null) ??
            (changes ? source.changesBookId?.(afterOf(changes)) ?? null : null);
        if (bookId !== null) wanted.set(id, { bookId, link: source.linksToBook === true });
    }
    if (wanted.size === 0) return;

    try {
        const ids = [...new Set([...wanted.values()].map((w) => w.bookId))];
        const rows = await prisma.$queryRaw<Row[]>`
            SELECT id::text AS key, title, author
            FROM "Book" WHERE id IN (${Prisma.join(ids)})`;
        const books = new Map(rows.map((row) => [str(row.key), row]));

        for (const [id, { bookId, link }] of wanted) {
            const book = books.get(String(bookId));
            const title = book ? str(book.title) : null;
            if (title === null) continue;
            // Named after the book it concerned, said plainly — the record
            // itself is gone (or was never one), and its title was never its own.
            const author = str(book?.author);
            const built = link ? bookLabel(title, author, bookId) : { title, subtitle: author };
            if (built) labels.set(id, built);
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
