import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import BillsTable from './bills-table';
import { notFound } from 'next/navigation';

interface PageProps {
    searchParams: Promise<{
        [key: string]: string | string[] | undefined;
    }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getBills(
    page: number,
    searchTerm: string,
    stateId?: number
) {
    const billsPerPage = 10;

    const whereClause: Prisma.BillWhereInput = {};

    // Search filter
    if (searchTerm) {
        whereClause.client = {
            OR: [
                {
                    name: {
                        contains: searchTerm,
                        mode: Prisma.QueryMode.insensitive,
                    },
                },
                {
                    email: {
                        contains: searchTerm,
                        mode: Prisma.QueryMode.insensitive,
                    },
                },
            ],
        };
    }

    // State filter
    if (stateId) {
        whereClause.stateId = stateId;
    }

    try {
        const [bills, totalBills, states] = await Promise.all([
            prisma.bill.findMany({
                where: whereClause,
                orderBy: { creationDate: 'desc' },
                skip: Math.max(0, (page - 1) * billsPerPage),
                take: billsPerPage,
                include: {
                    client: {
                        select: {
                            name: true,
                            email: true,
                        },
                    },
                    state: {
                        select: {
                            name: true,
                        },
                    },
                },
            }),
            prisma.bill.count({ where: whereClause }),
            prisma.status.findMany({
                select: {
                    id: true,
                    name: true,
                },
                orderBy: {
                    sortOrder: 'asc',
                },
            }),
        ]);

        return {
            bills,
            totalBills,
            totalPages: Math.ceil(totalBills / billsPerPage),
            availableStates: states,
        };
    } catch (error) {
        console.error('Error fetching bills:', error);
        throw new Error('Failed to fetch bills');
    }
}

export default async function AdminBillsPage({ searchParams }: PageProps) {
    try {
        const params = await searchParams;

        const page = Math.max(
            1,
            parseInt(Array.isArray(params.page) ? params.page[0] : params.page || '1')
        );
        const searchTerm = Array.isArray(params.search)
            ? params.search[0]
            : params.search || '';
        const stateId = params.stateId
            ? parseInt(Array.isArray(params.stateId) ? params.stateId[0] : params.stateId)
            : undefined;

        const { bills, totalBills, totalPages, availableStates } = await getBills(
            page,
            searchTerm,
            stateId
        );

        // Serialize bills
        const serializedBills = bills.map(bill => ({
            ...bill,
            creationDate: bill.creationDate.toISOString(),
            issueDate: bill.issueDate ? bill.issueDate.toISOString() : null,
            paymentDate: bill.paymentDate ? bill.paymentDate.toISOString() : null,
            invoiceAmount: bill.invoiceAmount.toString(),
        }));

        return (
            <div className="space-y-4">
                <BillsTable
                    initialBills={serializedBills}
                    initialPage={page}
                    initialSearch={searchTerm}
                    totalPages={totalPages}
                    availableStatuses={availableStates}
                    initialTotalBills={totalBills}
                />
            </div>
        );
    } catch (error) {
        console.error('Error in Admin Bills page:', error);
        notFound();
    }
}