import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { coupsDeCoeurIncludeConfigs } from '@/types/models/coups-de-coeur.model';
import { CoupsTable } from './coups-table';
import { parsePageParam, pageSkip } from '@/lib/pagination';
import { buildCoupsDeCoeurSearchWhere } from '@/lib/search';
import { suggestSearches } from '@/lib/search-suggest';

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

    // Tokenisé : « camus liste » peut se satisfaire d'un auteur dans la liste
    // et d'un mot du titre de la liste — voir buildCoupsDeCoeurSearchWhere.
    const whereFor = (term: string): Prisma.CoupsDeCoeurWhereInput => {
        const tokenClauses = buildCoupsDeCoeurSearchWhere(term);
        return tokenClauses ? { AND: tokenClauses } : {};
    };
    const whereClause = whereFor(searchTerm);

    const [items, totalItems] = await Promise.all([
        prisma.coupsDeCoeur.findMany({
            where: whereClause,
            include: coupsDeCoeurIncludeConfigs,
            orderBy: {
                createdAt: 'desc'
            },
            skip: pageSkip(page, itemsPerPage),
            take: itemsPerPage,
        }),
        prisma.coupsDeCoeur.count({ where: whereClause }),
    ]);

    // Only when the search found nothing — see lib/search-suggest.ts.
    const searchSuggestions =
        totalItems === 0 && searchTerm
            ? await suggestSearches(searchTerm, ['listes', 'books', 'people'], (q) =>
                prisma.coupsDeCoeur.count({ where: whereFor(q) }))
            : [];

    return {
        searchSuggestions,
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

    const page = parsePageParam(pageParam);
    const searchTerm = searchParam;

    const { items, totalPages, searchSuggestions } = await getCoupsDeCoeur(page, searchTerm);

    return (
        <div className="space-y-4">
            <CoupsTable
                initialItems={serializeDecimals(items)}
                initialPage={page}
                initialSearch={searchTerm}
                totalPages={totalPages}
                searchSuggestions={searchSuggestions}
            />
        </div>
    );
}