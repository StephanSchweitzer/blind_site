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
 * Excludes soft-deleted users (deletedAt != null) from every *list-style* read
 * on the User model, so deleted users genuinely disappear from searches,
 * dropdowns and lists app-wide without touching each call site.
 *
 * Intentional scope:
 * - Only list reads are filtered: findMany / findFirst(OrThrow) / count /
 *   aggregate / groupBy. findUnique(OrThrow) is deliberately NOT filtered —
 *   (a) Prisma forbids non-unique filters like `deletedAt` in a findUnique
 *   `where`, and (b) by-id reads are intentional admin access (edit, dossier,
 *   delete/restore) that must still resolve a soft-deleted row.
 * - Relation reads (e.g. a historical Bill's `client`) are NOT filtered by a
 *   model-level query extension — desired: past records keep their reference.
 * - Opt out / see deleted users by passing `deletedAt` explicitly in `where`
 *   (e.g. `where: { deletedAt: { not: null } }`). The filter is injected only
 *   when the caller did NOT specify `deletedAt`.
 * - Raw SQL ($queryRaw etc.) bypasses this extension. There are currently no
 *   raw user queries; any future one must filter `"deletedAt" IS NULL` itself.
 * - The audit trail's own « avant » reads are exempt (isAuditRead): they run on
 *   the caller's transaction client, extensions included, and a deletion has to
 *   stay traceable even when the row was already soft-deleted.
 */
const FILTERED_USER_READS = new Set([
    'findMany',
    'findFirst',
    'findFirstOrThrow',
    'count',
    'aggregate',
    'groupBy',
]);

function makePrisma() {
    // The base client is kept out of the chain on purpose: the audit extension
    // reads "before" rows and writes AuditEvent rows through it, so those reads
    // see soft-deleted users (a deletion must still be traceable) and those
    // writes cannot re-enter the extension that produced them.
    const base = new PrismaClient({ adapter, log: getLogConfig() });

    const client = base
        .$extends({
            name: 'softDeleteUsers',
            query: {
                user: {
                    async $allOperations({ operation, args, query }) {
                        if (FILTERED_USER_READS.has(operation) && !isAuditRead()) {
                            const a = (args ?? {}) as { where?: Record<string, unknown> };
                            const where = a.where ?? {};
                            // Inject only when the caller hasn't mentioned deletedAt,
                            // so explicit overrides (fetching deleted users) still work.
                            if (where.deletedAt === undefined) {
                                a.where = { ...where, deletedAt: null };
                                return query(a as Parameters<typeof query>[0]);
                            }
                        }
                        return query(args);
                    },
                },
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
