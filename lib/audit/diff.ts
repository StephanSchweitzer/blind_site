import { Prisma } from '@prisma/client';
import {
    MAX_PAYLOAD_CHARS,
    MAX_VALUE_CHARS,
    isNoiseField,
    isSecretField,
} from './config';

/**
 * Turning Prisma rows into the small, safe JSON the audit trail stores.
 *
 * Two rules govern everything below:
 *   - nothing secret goes in (see isSecretField);
 *   - nothing big goes in. Long text and binary are replaced by a marker, so a
 *     diff records THAT a field changed without carrying a copy of its content.
 */

export type AuditValue = string | number | boolean | null;
/** `{ champ: [avant, après] }` — the only shape stored in AuditEvent.changes. */
export type AuditChanges = Record<string, [AuditValue, AuditValue]>;
export type AuditSnapshot = Record<string, AuditValue>;

const sizeMarker = (chars: number) => `[texte de ${chars} caractères]`;

/** Collapse one field value to something small, printable and JSON-safe. */
export function encodeValue(value: unknown): AuditValue {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Prisma.Decimal) return value.toString();
    if (value instanceof Uint8Array || Buffer.isBuffer(value)) return '[binaire]';

    if (typeof value === 'string') {
        return value.length > MAX_VALUE_CHARS ? sizeMarker(value.length) : value;
    }

    // Json columns and anything else structured: keep it only while it stays small.
    try {
        const serialized = JSON.stringify(value);
        if (serialized === undefined) return null;
        return serialized.length > MAX_VALUE_CHARS ? sizeMarker(serialized.length) : serialized;
    } catch {
        return '[valeur illisible]';
    }
}

/** Full row, secrets removed — what a delete stores so a restore can replay it. */
export function encodeSnapshot(row: Record<string, unknown>): AuditSnapshot {
    const snapshot: AuditSnapshot = {};
    for (const [field, value] of Object.entries(row)) {
        if (isSecretField(field)) continue;
        // Relations arrive as arrays/objects when a caller used `include`; the
        // snapshot describes ONE row, so they are dropped rather than encoded.
        if (isRelationValue(value)) continue;
        snapshot[field] = encodeValue(value);
    }
    return snapshot;
}

function isRelationValue(value: unknown): boolean {
    if (Array.isArray(value)) return true;
    return (
        typeof value === 'object' &&
        value !== null &&
        !(value instanceof Date) &&
        !(value instanceof Prisma.Decimal) &&
        !(value instanceof Uint8Array) &&
        !Buffer.isBuffer(value) &&
        // A Json column is a plain object too; it is kept, relations are not.
        // Prisma model objects always carry their own primary key.
        'id' in (value as Record<string, unknown>)
    );
}

/**
 * True when both sides are the same decimal amount, written two different ways.
 *
 * A Decimal column read back from Postgres arrives as a Prisma.Decimal and
 * encodes to a string ("21"), while the value the write supplied is usually a
 * plain number — the user routes build theirs with parseFloat — and encodes to
 * 21. Encoded, `"21" !== 21`, so the trail recorded « Solde 0 → 0 » and « Seuil
 * de paiement 21 → 21 » on every save of a form where nobody had touched the
 * money.
 *
 * A Decimal on one of the two sides is what licenses the numeric comparison, so
 * a genuine string column holding "1" still reads as different from the number 1.
 */
function sameDecimalValue(before: unknown, after: unknown): boolean {
    if (!(before instanceof Prisma.Decimal) && !(after instanceof Prisma.Decimal)) return false;
    // null/undefined on either side is a real change; booleans are not amounts.
    for (const side of [before, after]) {
        if (side === null || side === undefined || typeof side === 'boolean') return false;
    }
    try {
        type DecimalInput = ConstructorParameters<typeof Prisma.Decimal>[0];
        return new Prisma.Decimal(before as DecimalInput)
            .equals(new Prisma.Decimal(after as DecimalInput));
    } catch {
        // Not a number on one of the sides — treat it as a genuine change.
        return false;
    }
}

/** Field-level diff. Only fields whose value actually moved are included. */
export function diffRows(
    before: Record<string, unknown>,
    after: Record<string, unknown>
): AuditChanges {
    const changes: AuditChanges = {};
    for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (isSecretField(field) || isNoiseField(field)) continue;
        if (isRelationValue(before[field]) || isRelationValue(after[field])) continue;

        const from = encodeValue(before[field]);
        const to = encodeValue(after[field]);
        if (from !== to && !sameDecimalValue(before[field], after[field])) {
            changes[field] = [from, to];
        }
    }
    return changes;
}

/**
 * A creation reads as a diff out of nothing: `{ champ: [null, valeur] }`.
 * `keyFields` are the row's primary key columns, left out because AuditEvent
 * already carries them as recordId.
 */
export function creationChanges(
    row: Record<string, unknown>,
    keyFields: string[] = []
): AuditChanges {
    const changes: AuditChanges = {};
    for (const [field, value] of Object.entries(row)) {
        if (isSecretField(field) || isNoiseField(field)) continue;
        if (keyFields.includes(field)) continue;
        if (isRelationValue(value)) continue;

        const to = encodeValue(value);
        // Columns left at null add nothing to "what was created".
        if (to === null) continue;
        changes[field] = [null, to];
    }
    return changes;
}

/**
 * Last-resort guard on the stored payload. A row that somehow still serializes
 * huge (a very wide model, a long bulk summary) is replaced by a marker rather
 * than written — the trail must never be the reason the 500 MB cap is hit.
 */
export function withinPayloadBudget(payload: object): boolean {
    try {
        return JSON.stringify(payload).length <= MAX_PAYLOAD_CHARS;
    } catch {
        return false;
    }
}
