import { PrismaClient, Prisma } from '@/generated/prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import { auditExtension } from '@/lib/audit/extension';
import { isAuditRead, runInAuditTransaction } from '@/lib/audit/context';

const getLogConfig = () => {
    if (process.env.NODE_ENV === "development" && process.env.PRISMA_QUERY_LOG === "true") {
        return ["query", "error", "warn"] as Prisma.LogLevel[];
    }
    return ["error"] as Prisma.LogLevel[];
};

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

/**
 * Soft-delete extension.
 *
 * Excludes soft-deleted rows (deletedAt != null) from every *list-style* read on
 * the models listed below, so deleted records genuinely disappear from searches,
 * dropdowns and lists app-wide without touching each call site.
 *
 * WHY THE LIST GREW BEYOND User
 *
 * Orders and Assignment are the two other models whose children are
 * `onDelete: Cascade` onto append-only history — OrderEvent, AssignmentEvent,
 * AssignmentReader. A physical delete on either of them silently destroyed the
 * very tables the schema calls "its own permanent history" and deliberately
 * exempts from the AuditEvent retention purge, and it moved the « Demandes
 * traitées » / « Attributions traitées » figures on /admin/stats for past
 * months. Both routes now soft-delete instead — which only works if every list
 * read hides those rows, and doing that at ~20 call sites is exactly the
 * per-call-site bookkeeping this extension exists to avoid. One place, or one of
 * them gets missed and a deleted attribution reappears in the charge des
 * lecteurs.
 *
 * Intentional scope:
 * - Only list reads are filtered: findMany / findFirst(OrThrow) / count /
 *   aggregate / groupBy. findUnique(OrThrow) is deliberately NOT filtered —
 *   (a) Prisma forbids non-unique filters like `deletedAt` in a findUnique
 *   `where`, and (b) by-id reads are intentional admin access (edit, dossier,
 *   delete/restore) that must still resolve a soft-deleted row.
 * - Relation reads (e.g. a historical Bill's `client`) are NOT filtered by a
 *   model-level query extension — desired: past records keep their reference.
 *   Where a relation's soft-deleted rows would change a DECISION rather than
 *   just a display, the include carries its own `where` — see the `assignments`
 *   include in PUT /api/orders/[id], which drives the status guards.
 * - Opt out / see deleted rows by passing `deletedAt` explicitly in `where`
 *   (e.g. `where: { deletedAt: { not: null } }`). The filter is injected only
 *   when the caller did NOT specify `deletedAt`.
 * - Raw SQL ($queryRaw etc.) bypasses this extension. The /admin/stats queries
 *   are raw; any that counts business rows must filter `"deletedAt" IS NULL`
 *   itself.
 * - The audit trail's own « avant » reads are exempt (isAuditRead): they run on
 *   the caller's transaction client, extensions included, and a deletion has to
 *   stay traceable even when the row was already soft-deleted.
 * - Orders additionally carries `isActive`, which predates this and is what the
 *   billing sums filter on (recomputeBillTotal, ADJUSTABLE_ORDER_WHERE). The two
 *   are written together on every soft delete; neither replaces the other.
 */
const FILTERED_READS = new Set([
    'findMany',
    'findFirst',
    'findFirstOrThrow',
    'count',
    'aggregate',
    'groupBy',
]);

/**
 * Prisma client keys (camelCase delegate names) carrying a `deletedAt` column,
 * for reference — the extension below lists them again literally, because
 * Prisma types its `query` map by delegate name and a computed key erases that.
 * Keep the two in step.
 */
const SOFT_DELETED_MODELS = ['user', 'orders', 'assignment'] as const;
export type SoftDeletedModel = (typeof SOFT_DELETED_MODELS)[number];

function makePrisma() {
    // The base client is kept out of the chain on purpose: the audit extension
    // reads "before" rows and writes AuditEvent rows through it, so those reads
    // see soft-deleted users (a deletion must still be traceable) and those
    // writes cannot re-enter the extension that produced them.
    const base = new PrismaClient({ adapter, log: getLogConfig() });

    // One handler, applied per model: the rule is identical for each, so writing
    // it three times would be three places for it to drift.
    const hideSoftDeleted = async ({
        operation,
        args,
        query,
    }: {
        operation: string;
        args: unknown;
        query: (args: never) => Promise<unknown>;
    }) => {
        if (FILTERED_READS.has(operation) && !isAuditRead()) {
            const a = (args ?? {}) as { where?: Record<string, unknown> };
            const where = a.where ?? {};
            // Inject only when the caller hasn't mentioned deletedAt, so explicit
            // overrides (fetching deleted rows) still work.
            if (where.deletedAt === undefined) {
                a.where = { ...where, deletedAt: null };
                return query(a as never);
            }
        }
        return query(args as never);
    };

    const client = base
        .$extends({
            name: 'softDelete',
            // Écrit modèle par modèle plutôt que construit depuis
            // SOFT_DELETED_MODELS : Prisma type `query` par nom de délégué, et un
            // Object.fromEntries perd les clés littérales — l'extension se
            // retrouve alors typée `never` et ne s'applique nulle part.
            query: {
                user: { $allOperations: hideSoftDeleted },
                orders: { $allOperations: hideSoftDeleted },
                assignment: { $allOperations: hideSoftDeleted },
            },
        })
        .$extends(auditExtension(base));

    return captureTransactions(client);
}

/**
 * Make every interactive `$transaction` announce itself to the audit trail.
 *
 * The extension needs the transaction client to read and write inside the
 * transaction rather than beside it (see runInAuditTransaction for what went
 * wrong when it did not). Prisma gives a query extension no hook on
 * `$transaction`, and threading it through every call site is exactly the
 * per-action bookkeeping this trail exists to avoid — so the client is wrapped
 * once, here, and nothing downstream changes.
 *
 * Only the interactive form is wrapped. The array form takes promises that were
 * built — and whose audit reads therefore already ran — before the transaction
 * existed, so there is nothing to lend them.
 */
function captureTransactions<T extends object>(client: T): T {
    return new Proxy(client, {
        get(target, prop) {
            // No receiver: the raw property, so a Prisma delegate is still the
            // `this` of its own methods and nothing sees the proxy in its place.
            const value = Reflect.get(target, prop);
            if (prop !== '$transaction' || typeof value !== 'function') return value;

            const original = value as (...args: unknown[]) => unknown;
            return (...args: unknown[]) => {
                const [first, ...rest] = args;
                if (typeof first !== 'function') return original.apply(target, args);
                const body = first as (tx: object) => unknown;
                return original.apply(target, [
                    (tx: object) => runInAuditTransaction(tx, () => body(tx)),
                    ...rest,
                ]);
            };
        },
    });
}

// $extends returns a branded extended-client type; let it infer (do NOT annotate
// as PrismaClient). A query-only extension does not change public method
// signatures, so downstream `import { prisma }` usage and helpers typed with
// `Prisma.TransactionClient` keep working unchanged.
type ExtendedPrisma = ReturnType<typeof makePrisma>;

const globalForPrisma = global as unknown as { prisma?: ExtendedPrisma };

export const prisma: ExtendedPrisma = globalForPrisma.prisma ?? makePrisma();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

// To see queries in development, add to .env.local:
// PRISMA_QUERY_LOG=true
