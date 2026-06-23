import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { coupsDeCoeurIncludeConfigs } from '@/types/models/coups-de-coeur.model';
import { CoupsTable } from './coups-table';

interface PageProps {
    searchParams: Promise<{
        [key: string]: string | string[] | undefined
    }>;
}

export const dynamic = 'force-dynamic';

// Convert Prisma.Decimal -> number recursively so the payload is serializable
// for the client component. Leaves Dates and other primitives untouched.
function serializeDecimals<T>(value: T): T {
    if (value === null || value === undefined) return value;
    if (value instanceof Prisma.Decimal) return value.toNumber() as unknown as T;
    if (value instanceof Date) return value;
    if (Array.isArray(value)) return value.map(serializeDecimals) as unknown as T;
    if (typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = serializeDecimals(v);
        }
        return out as T;
    }
    return value;
}

async function getCoupsDeCoeur(page: number, searchTerm: string) {
    const itemsPerPage = 10;

    const whereClause: Prisma.CoupsDeCoeurWhereInput = searchTerm
        ? {
            OR: [
                {
                    title: {
                        contains: searchTerm,
                        mode: Prisma.QueryMode.insensitive
                    }
                },
                {
                    description: {
                        contains: searchTerm,
                        mode: Prisma.QueryMode.insensitive
                    }
                },
                {
                    addedBy: {
                        name: {
                            contains: searchTerm,
                            mode: Prisma.QueryMode.insensitive
                        }
                    }
                }
            ]
        }
        : {};

    const [items, totalItems] = await Promise.all([
        prisma.coupsDeCoeur.findMany({
            where: whereClause,
            include: coupsDeCoeurIncludeConfigs,
            orderBy: {
                createdAt: 'desc'
            },
            skip: (page - 1) * itemsPerPage,
            take: itemsPerPage,
        }),
        prisma.coupsDeCoeur.count({ where: whereClause }),
    ]);

    return {
        items,
        totalItems,
        totalPages: Math.ceil(totalItems / itemsPerPage)
    };
}

export default async function CoupsDeCoeur({ searchParams }: PageProps) {
    const params = await searchParams;


    const pageParam = typeof params.page === 'string' ? params.page :
        Array.isArray(params.page) ? params.page[0] : '1';
    const searchParam = typeof params.search === 'string' ? params.search :
        Array.isArray(params.search) ? params.search[0] : '';

    const page = parseInt(pageParam);
    const searchTerm = searchParam;

    const { items, totalPages } = await getCoupsDeCoeur(page, searchTerm);

    return (
        <div className="space-y-4">
            <CoupsTable
                initialItems={serializeDecimals(items)}
                initialPage={page}
                initialSearch={searchTerm}
                totalPages={totalPages}
            />
        </div>
    );
}