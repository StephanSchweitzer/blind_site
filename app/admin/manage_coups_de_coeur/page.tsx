// app/admin/manage_coups_de_coeur/page.tsx
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import BackendNavbar from '../../../components/Backend-Navbar';
import { CoupsTable } from './coups-table';

type CoupsDeCoeurWithUser = Prisma.CoupsDeCoeurGetPayload<{
    include: {
        addedBy: true;
        books: {
            include: {
                book: true;
            };
        };
    };
}>;

interface PageProps {
    searchParams: { [key: string]: string | string[] | undefined };
}

export const dynamic = 'force-dynamic';

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
            include: {
                addedBy: true,
                books: {
                    include: {
                        book: true
                    }
                }
            },
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
    const pageParam = typeof searchParams.page === 'string' ? searchParams.page :
        Array.isArray(searchParams.page) ? searchParams.page[0] : '1';
    const searchParam = typeof searchParams.search === 'string' ? searchParams.search :
        Array.isArray(searchParams.search) ? searchParams.search[0] : '';

    const page = parseInt(pageParam);
    const searchTerm = searchParam;

    const { items, totalItems, totalPages } = await getCoupsDeCoeur(page, searchTerm);

    return (
        <div className="space-y-4">
            <CoupsTable
                initialItems={items}
                    initialPage={page}
                    initialSearch={searchTerm}
                    totalPages={totalPages}
                />
            </div>
    );
}