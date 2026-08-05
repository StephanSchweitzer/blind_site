/**
 * What the audit trail watches, what it refuses to store, and how big it may get.
 *
 * Everything here is deliberately conservative: the database is a Supabase free
 * tier with a 500 MB hard cap, and it flips to read-only when it is exceeded.
 */

/**
 * Models whose writes are captured. Deliberately the business core.
 *
 * Not audited, on purpose:
 *   - AuditEvent itself (it would audit its own writes forever);
 *   - the other append-only logs — BillEvent, UserActivityEvent, BookMergeEvent,
 *     DeletedAudioTrack — which already are their own history;
 *   - machine-written tables rewritten wholesale by scripts (OrphanAudioFolder,
 *     AudioFilepathBackup): pure churn, no human decision behind them;
 *   - the pure join tables (BookGenre, CoupsDeCoeurBooks): they only ever move
 *     with the Book / CoupsDeCoeur row that owns them, which IS audited.
 */
export const AUDITED_MODELS = new Set([
    'User',
    'Address',
    'ReaderLanguage',
    'Book',
    'Genre',
    'CoupsDeCoeur',
    'Orders',
    'Assignment',
    'AssignmentReader',
    'Bill',
    'Payment',
    'News',
    'Status',
    'MediaFormat',
    'Civility',
    'SiteContact',
    'TeamMember',
    'HistoryEvent',
    'PracticalInfo',
    'MembershipOption',
]);

export function isAuditedModel(model: string | undefined): boolean {
    return model !== undefined && AUDITED_MODELS.has(model);
}

/** Prisma operations that change data. Reads never produce an event. */
export const AUDITED_OPERATIONS = new Set([
    'create',
    'createMany',
    'createManyAndReturn',
    'update',
    'updateMany',
    'updateManyAndReturn',
    'upsert',
    'delete',
    'deleteMany',
]);

/** Primary key columns per model; every model not listed here is keyed on `id`. */
const PRIMARY_KEYS: Record<string, string[]> = {
    AudioFilepathBackup: ['bookId'],
    BookGenre: ['bookId', 'genreId'],
    CoupsDeCoeurBooks: ['coupsDeCoeurId', 'bookId'],
};

export function primaryKeyFields(model: string): string[] {
    return PRIMARY_KEYS[model] ?? ['id'];
}

/** recordId for a row: the pk as text, composite keys joined on ":". */
export function recordIdOf(model: string, row: Record<string, unknown>): string | null {
    const parts = primaryKeyFields(model).map((field) => row[field]);
    if (parts.some((part) => part === undefined || part === null)) return null;
    return parts.map(String).join(':');
}

/** recordId used by the summary event written for an uncapturable bulk write. */
export const BULK_RECORD_ID = '*';

/** Reserved diff key carrying the row count of a bulk summary event. */
export const BULK_COUNT_KEY = '_count';

/**
 * Never written to the trail, in a diff or in a delete snapshot. Matched against
 * the field name, case-insensitively. An audit log is read by humans and kept in
 * the same database as the data — it must not become a second place where
 * credentials live.
 *
 * Consequence for restore: a restored User comes back without its password hash
 * and has to go through a password reset. That is the intended trade-off.
 */
const SECRET_FIELD_RE = /pass(word|wd)|token|secret|hash|salt|apikey|api_key|credential|authorization/i;

export function isSecretField(field: string): boolean {
    return SECRET_FIELD_RE.test(field);
}

/**
 * Fields excluded from DIFFS (they still travel in a delete snapshot, where a
 * restore needs them). These move on their own — @updatedAt columns and
 * script-maintained timestamps — so listing them would add a line of noise to
 * every single change without ever explaining one.
 *
 * `audioCheckedAt` belongs here for the same reason, even though it is not an
 * @updatedAt: refreshBookAudioState() stamps it on every single call, and every
 * audio route calls through it. Nobody decides to change it. Left in the diff it
 * was a quarter of the whole trail — one « Audio vérifié le 07:52 → 07:52 » line
 * per bucket re-read — and it shredded one admin's workflow on a book into five
 * or fifteen separate events. The *state* it comes with (audioLinkStatus,
 * audioTrackCount, audioSizeKb) is handled one step further down, by
 * DERIVED_FIELDS: it stays readable next to a real edit, but can no longer put a
 * row in the journal by itself.
 */
const NOISE_FIELDS = new Set(['updatedAt', 'lastUpdated', 'lastSeenAt', 'audioCheckedAt']);

export function isNoiseField(field: string): boolean {
    return NOISE_FIELDS.has(field);
}

/**
 * DERIVED columns: machine-computed caches and bookkeeping stamps. The trail
 * records *decisions*, not *observations* — and nobody decides these. They are
 * recomputed from somewhere else (the bucket, a SUM over other rows) whenever
 * something happens to look.
 *
 * Unlike NOISE_FIELDS they are NOT stripped from a diff. They still travel, and
 * still read usefully, when they move alongside a field a human did change — an
 * admin who edits `audio_filepath` gets one event showing the path AND the state
 * it produced. What they cannot do is justify an event on their own: a diff made
 * of nothing but derived fields is a re-read, and is dropped (see
 * changesAreAllDerived).
 *
 * Model-scoped rather than global, because these are far more specific than an
 * @updatedAt: `invoiceAmount` is derived on Bill, but nothing stops a future
 * model from having a column of the same name that someone types by hand.
 *
 * Why each one is here:
 *   Book.audioLinkStatus / audioTrackCount / audioSizeKb
 *       refreshBookAudioState() rewrites all three on every bucket re-read, and
 *       GET /api/books/[id]/audio/manage calls it just to open the dialogue.
 *       Merely LOOKING at a book's audio was writing « État du lien audio
 *       UNVERIFIED → NO_PATH » to the journal under the reader's name.
 *   Book.escalatedAt
 *       stamped so the signalement mail isn't re-sent on the next visit
 *       (app/admin/review/actions.ts). Bookkeeping for a mail, not an edit.
 *   Bill.invoiceAmount
 *       recomputeBillTotal() sums the linked orders' costs. Those costs are
 *       themselves traced, so the total restates what the journal already says —
 *       and BillEvent is the bill's real, append-only history.
 *
 * Deliberately NOT here, though both were considered:
 *   Orders.cost — repriced automatically by audio weight, but also editable by
 *       hand, and it is money. A cost that moves is worth a line either way.
 *   User.currentBalance — looks derived, is actually typed in the user form.
 */
const DERIVED_FIELDS: Record<string, Set<string>> = {
    Book: new Set(['audioLinkStatus', 'audioTrackCount', 'audioSizeKb', 'escalatedAt']),
    Bill: new Set(['invoiceAmount']),
};

export function isDerivedField(model: string, field: string): boolean {
    return DERIVED_FIELDS[model]?.has(field) ?? false;
}

/**
 * True when a diff says nothing a human decided — so the write behind it was an
 * observation and does not belong in the journal.
 *
 * An empty diff is not "all derived": that case is already handled upstream (a
 * write that moved nothing produces no event) and a DELETE legitimately carries
 * no changes at all.
 */
export function changesAreAllDerived(model: string, changes: Record<string, unknown>): boolean {
    const fields = Object.keys(changes);
    return fields.length > 0 && fields.every((field) => isDerivedField(model, field));
}

/**
 * Longest string kept verbatim. Anything longer is replaced by a size marker:
 * the trail records THAT a description or a markdown body changed, never a copy
 * of it. Base64 and file contents can never land here as a result.
 */
export const MAX_VALUE_CHARS = 500;

/** Largest serialized `changes` / `snapshot` payload, in characters. */
export const MAX_PAYLOAD_CHARS = 20_000;

/**
 * Rows a single updateMany / deleteMany may expand into. Past this the trail
 * writes one summary event instead — a mass operation is worth one line, not
 * hundreds.
 */
export const BULK_ROW_LIMIT = 50;

// ── retention ───────────────────────────────────────────────────────────────

/** Normal window. Anything older is purged nightly. */
export const AUDIT_RETENTION_DAYS = 14;

/** Window applied instead once the table passes the soft limit below. */
export const AUDIT_RETENTION_DAYS_UNDER_PRESSURE = 7;

/** Table size (MB, including indexes and toast) that trips the shorter window. */
export const AUDIT_TABLE_SOFT_LIMIT_MB = 100;
