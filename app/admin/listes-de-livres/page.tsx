import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { coupsDeCoeurIncludeConfigs } from '@/types/models/coups-de-coeur.model';
import { CoupsTable } from './coups-table';
import { pageInfo, pageSkip, parsePageParam, parsePageSizeParam, redirectPastLastPage } from '@/lib/pagination';
import { buildCoupsDeCoeurSearchWhere } from '@/lib/search';
import { rescueEmptySearch, RESCUE_CANDIDATES } from '@/lib/search-rescue';
import { parisDate } from '@/lib/paris-day';

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

async function getCoupsDeCoeur(page: number, pageSize: number, searchTerm: string) {
    const itemsPerPage = pageSize;

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
            ? await rescueEmptySearch({
                search: searchTerm,
                domains: ['listes', 'books', 'people'],
                count: (q) => prisma.coupsDeCoeur.count({ where: whereFor(q.query) }),
                find: (q) =>
                    prisma.coupsDeCoeur.findMany({
                        where: whereFor(q.query),
                        orderBy: { createdAt: 'desc' },
                        take: RESCUE_CANDIDATES,
                        select: { id: true, title: true, createdAt: true, _count: { select: { books: true } } },
                    }),
                rankText: (l) => l.title,
                toRow: (l) => ({
                    id: l.id,
                    title: l.title,
                    detail: `${l._count.books} livre${l._count.books > 1 ? 's' : ''} · créée le ${parisDate(l.createdAt)}`,
                }),
            })
            : [];

    return {
        searchSuggestions,
        items,
        pagination: pageInfo(page, pageSize, totalItems),
    };
}

export default async function CoupsDeCoeur({ searchParams }: PageProps) {
    const params = await searchParams;


    const pageParam = typeof params.page === 'string' ? params.page :
        Array.isArray(params.page) ? params.page[0] : '1';
    const searchParam = typeof params.search === 'string' ? params.search :
        Array.isArray(params.search) ? params.search[0] : '';

    const page = parsePageParam(pageParam);
    const pageSize = parsePageSizeParam(params.perPage);
    const searchTerm = searchParam;

    const { items, pagination, searchSuggestions } = await getCoupsDeCoeur(page, pageSize, searchTerm);
    redirectPastLastPage('/admin/listes-de-livres', params, pagination, items.length);

    return (
        <div className="space-y-4">
            <CoupsTable
                initialItems={serializeDecimals(items)}
                pagination={pagination}
                initialSearch={searchTerm}
                searchSuggestions={searchSuggestions}
            />
        </div>
    );
}