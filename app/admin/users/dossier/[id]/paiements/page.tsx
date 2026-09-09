import { prisma } from '@/lib/prisma';
import { PaymentType, PaymentMethod, Prisma } from '@prisma/client';

import PaymentsTable from '@/app/admin/payments/payments-table';
import { paymentsTableInclude } from '@/types/models/payment.model';
import { parsePageParam, pageSkip } from '@/lib/pagination';
import {
    parsePaymentListParams,
    buildPaymentListWhere,
    buildPaymentListOrderBy,
} from '@/lib/payments/list-query';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PAYMENTS_PER_PAGE = 10;

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PaiementsTab({ params, searchParams }: PageProps) {
    const { id } = await params;
    const sp = await searchParams;
    const clientId = parseInt(id);

    const page = parsePageParam(sp.page);

    // Mêmes filtres et même tri que la liste globale, verrouillés sur ce client :
    // l'onglet portait sa propre copie du `where` et ne suivait donc aucun des
    // filtres ajoutés en face. Voir lib/payments/list-query.ts.
    const listParams = parsePaymentListParams(sp, { clientId });
    const whereClause = buildPaymentListWhere(listParams);

    const [payments, totalPayments, totals] = await Promise.all([
        prisma.payment.findMany({
            where: whereClause,
            orderBy: buildPaymentListOrderBy(listParams),
            skip: pageSkip(page, PAYMENTS_PER_PAGE),
            take: PAYMENTS_PER_PAGE,
            include: paymentsTableInclude,
        }),
        prisma.payment.count({ where: whereClause }),
        prisma.payment.aggregate({ where: whereClause, _sum: { amount: true } }),
    ]);

    const client = await prisma.user.findUnique({
        where: { id: clientId },
        select: { id: true, name: true, firstName: true, lastName: true, email: true },
    });

    const serializedPayments = payments.map((payment) => ({
        ...payment,
        amount: payment.amount.toString(),
        creationDate: payment.creationDate.toISOString(),
        issueDate: payment.issueDate?.toISOString() ?? null,
        paymentDate: payment.paymentDate?.toISOString() ?? null,
        bill: payment.bill
            ? { ...payment.bill, invoiceAmount: payment.bill.invoiceAmount.toString() }
            : null,
    }));

    return (
        <PaymentsTable
            initialPayments={serializedPayments}
            initialPage={page}
            initialParams={listParams}
            totalPages={Math.ceil(totalPayments / PAYMENTS_PER_PAGE)}
            availableTypes={Object.values(PaymentType)}
            availableMethods={Object.values(PaymentMethod)}
            initialTotalPayments={totalPayments}
            initialTotalAmount={(totals._sum.amount ?? new Prisma.Decimal(0)).toString()}
            hideSearch
            presetClient={client}
        />
    );
}
