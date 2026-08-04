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
        if (from !== to) changes[field] = [from, to];
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
