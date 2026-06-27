import { prisma } from '@/lib/prisma';
import { BillingStatus, Prisma } from '@prisma/client';
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
    status?: BillingStatus,
    showLate?: boolean,
) {
    const billsPerPage = 10;

    // Hide soft-deleted bills from the listing.
    const whereClause: Prisma.BillWhereInput = { isActive: true };

    if (searchTerm) {
        whereClause.client = {
            OR: [
                { name: { contains: searchTerm, mode: Prisma.QueryMode.insensitive } },
                { email: { contains: searchTerm, mode: Prisma.QueryMode.insensitive } },
            ],
        };
    }

    if (showLate) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        whereClause.state = BillingStatus.BILLED;
        whereClause.issueDate = { lt: thirtyDaysAgo };
    } else if (status) {
        whereClause.state = status;
    }

    try {
        const [bills, totalBills] = await Promise.all([
            prisma.bill.findMany({
                where: whereClause,
                orderBy: { creationDate: 'desc' },
                skip: Math.max(0, (page - 1) * billsPerPage),
                take: billsPerPage,
                include: {
                    client: {
                        select: { name: true, email: true },
                    },
                },
            }),
            prisma.bill.count({ where: whereClause }),
        ]);

        return {
            bills,
            totalBills,
            totalPages: Math.ceil(totalBills / billsPerPage),
            availableStatuses: Object.values(BillingStatus),
        };
    } catch (error) {
        console.error('Error fetching bills:', error);
        throw new Error('Failed to fetch bills');
    }
}

export default async function AdminBillsPage({ searchParams }: PageProps) {
    const params = await searchParams;

    const page = Math.max(
        1,
        parseInt(Array.isArray(params.page) ? params.page[0] : params.page || '1')
    );
    const searchTerm = Array.isArray(params.search)
        ? params.search[0]
        : params.search || '';

    const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;
    const status = rawStatus && Object.values(BillingStatus).includes(rawStatus as BillingStatus)
        ? (rawStatus as BillingStatus)
        : undefined;

    const showLate = (Array.isArray(params.late) ? params.late[0] : params.late) === 'true';

    // Only the data fetch is guarded; notFound() throws (returns `never`),
    // so `data` is definitely assigned past this point.
    let data: Awaited<ReturnType<typeof getBills>>;
    try {
        data = await getBills(page, searchTerm, status, showLate);
    } catch (error) {
        console.error('Error in Admin Bills page:', error);
        notFound();
    }

    const { bills, totalBills, totalPages, availableStatuses } = data;

    const serializedBills = bills.map(bill => ({
        ...bill,
        creationDate: bill.creationDate.toISOString(),
        issueDate: bill.issueDate?.toISOString() ?? null,
        paymentDate: bill.paymentDate?.toISOString() ?? null,
        invoiceAmount: bill.invoiceAmount.toString(),
    }));

    return (
        <div className="space-y-4">
            <BillsTable
                initialBills={serializedBills}
                initialPage={page}
                initialSearch={searchTerm}
                totalPages={totalPages}
                availableStatuses={availableStatuses}
                initialTotalBills={totalBills}
            />
        </div>
    );
}