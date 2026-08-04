import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
    AUDIT_RETENTION_DAYS,
    AUDIT_RETENTION_DAYS_UNDER_PRESSURE,
    AUDIT_TABLE_SOFT_LIMIT_MB,
} from './config';

/**
 * Retention for the audit trail.
 *
 * The database is a Supabase free tier: 500 MB, and it goes READ-ONLY past that
 * — an audit log that grows without bound would take the whole portal down. So
 * the trail keeps 14 days, and if it ever gets fat enough to matter on its own
 * (AUDIT_TABLE_SOFT_LIMIT_MB) it drops itself to 7 without waiting for anyone.
 */

export interface AuditTableSize {
    /** Table + indexes + toast, as reported by pg_total_relation_size. */
    megabytes: number;
    rows: number;
    /** True once the table alone justifies the shorter window. */
    underPressure: boolean;
    /** Days currently retained — 14, or 7 under pressure. */
    retentionDays: number;
}

const BYTES_PER_MB = 1024 * 1024;

export async function measureAuditTable(): Promise<AuditTableSize> {
    const [row] = await prisma.$queryRaw<Array<{ bytes: bigint | null; rows: bigint }>>`
        SELECT pg_total_relation_size(to_regclass('"AuditEvent"')) AS bytes,
               (SELECT COUNT(*) FROM "AuditEvent") AS rows`;

    const megabytes = Number(row?.bytes ?? 0) / BYTES_PER_MB;
    const underPressure = megabytes >= AUDIT_TABLE_SOFT_LIMIT_MB;

    return {
        megabytes: Math.round(megabytes * 10) / 10,
        rows: Number(row?.rows ?? 0),
        underPressure,
        retentionDays: underPressure ? AUDIT_RETENTION_DAYS_UNDER_PRESSURE : AUDIT_RETENTION_DAYS,
    };
}

export interface PurgeResult extends AuditTableSize {
    deleted: number;
}

/**
 * Drop everything past the window. Raw SQL on purpose: this is the one bulk
 * delete in the codebase that must not be observed by the audit extension, and
 * a DELETE of tens of thousands of rows has no business going through the
 * client's per-row machinery.
 *
 * Postgres only marks the space reusable, it doesn't hand it back to the OS —
 * autovacuum reclaims it. Nothing here runs VACUUM: it can't run inside a
 * transaction and the pooled role may not own the table.
 */
export async function purgeAuditEvents(): Promise<PurgeResult> {
    const before = await measureAuditTable();
    const days = before.retentionDays;

    const deleted = await prisma.$executeRaw`
        DELETE FROM "AuditEvent"
        WHERE "createdAt" < (now() - make_interval(days => ${days}))`;

    const after = await measureAuditTable();
    return { ...after, deleted };
}

/** Cut-off timestamp the UI queries against — same window the purge applies. */
export function retentionCutoff(retentionDays: number): Date {
    return new Date(Date.now() - retentionDays * 86_400_000);
}

/** Bound used by the timeline query so it never scans past what is kept. */
export function retentionCutoffSql(retentionDays: number): Prisma.Sql {
    return Prisma.sql`(now() - make_interval(days => ${retentionDays}))`;
}
