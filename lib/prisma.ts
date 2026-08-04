import { PrismaClient, Prisma } from '@/generated/prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import { auditExtension } from '@/lib/audit/extension';

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

    return base
        .$extends({
            name: 'softDeleteUsers',
            query: {
                user: {
                    async $allOperations({ operation, args, query }) {
                        if (FILTERED_USER_READS.has(operation)) {
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
