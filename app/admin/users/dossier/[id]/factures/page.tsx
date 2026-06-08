import { prisma } from '@/lib/prisma';
import { BillingStatus, Prisma } from '@prisma/client';

import BillsTable from '@/app/admin/bills/bills-table';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BILLS_PER_PAGE = 10;

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function FacturesTab({ params, searchParams }: PageProps) {
    const { id } = await params;
    const sp = await searchParams;
    const clientId = parseInt(id);

    const page = Math.max(
        1,
        parseInt(Array.isArray(sp.page) ? sp.page[0] : sp.page || '1'),
    );

    const rawStatus = Array.isArray(sp.status) ? sp.status[0] : sp.status;
    const status =
        rawStatus && Object.values(BillingStatus).includes(rawStatus as BillingStatus)
            ? (rawStatus as BillingStatus)
            : undefined;

    const showLate = (Array.isArray(sp.late) ? sp.late[0] : sp.late) === 'true';

    // Same filtering as the global bills page, but locked to this client.
    const whereClause: Prisma.BillWhereInput = { isActive: true, clientId };

    if (showLate) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        whereClause.state = BillingStatus.BILLED;
        whereClause.issueDate = { lt: thirtyDaysAgo };
    } else if (status) {
        whereClause.state = status;
    }

    const [bills, totalBills] = await Promise.all([
        prisma.bill.findMany({
            where: whereClause,
            orderBy: { creationDate: 'desc' },
            skip: Math.max(0, (page - 1) * BILLS_PER_PAGE),
            take: BILLS_PER_PAGE,
            include: { client: { select: { name: true, email: true } } },
        }),
        prisma.bill.count({ where: whereClause }),
    ]);

    const serializedBills = bills.map((bill) => ({
        ...bill,
        creationDate: bill.creationDate.toISOString(),
        issueDate: bill.issueDate?.toISOString() ?? null,
        paymentDate: bill.paymentDate?.toISOString() ?? null,
        invoiceAmount: bill.invoiceAmount.toString(),
    }));

    return (
        <BillsTable
            initialBills={serializedBills}
            initialPage={page}
            initialSearch=""
            totalPages={Math.ceil(totalBills / BILLS_PER_PAGE)}
            availableStatuses={Object.values(BillingStatus)}
            initialTotalBills={totalBills}
            hideSearch
        />
    );
}