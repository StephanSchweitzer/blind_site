import { prisma } from '@/lib/prisma';
import { PaymentType, PaymentMethod, Prisma } from '@prisma/client';

import PaymentsTable from '@/app/admin/payments/payments-table';
import { paymentsTableInclude } from '@/types/models/payment.model';
import { pageInfo, pageSkip, parsePageParam, parsePageSizeParam, redirectPastLastPage } from '@/lib/pagination';
import {
    parsePaymentListParams,
    buildPaymentListWhere,
    buildPaymentListOrderBy,
} from '@/lib/payments/list-query';

export const dynamic = 'force-dynamic';
export const revalidate = 0;


interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PaiementsTab({ params, searchParams }: PageProps) {
    const { id } = await params;
    const sp = await searchParams;
    const clientId = parseInt(id);

    const page = parsePageParam(sp.page);
    // Même taille que les listes générales (lib/pagination.ts) — 10 ici avant.
    const pageSize = parsePageSizeParam(sp.perPage);

    // Mêmes filtres et même tri que la liste globale, verrouillés sur ce client :
    // l'onglet portait sa propre copie du `where` et ne suivait donc aucun des
    // filtres ajoutés en face. Voir lib/payments/list-query.ts.
    const listParams = parsePaymentListParams(sp, { clientId });
    const whereClause = buildPaymentListWhere(listParams);

    const [payments, totalPayments, totals] = await Promise.all([
        prisma.payment.findMany({
            where: whereClause,
            orderBy: buildPaymentListOrderBy(listParams),
            skip: pageSkip(page, pageSize),
            take: pageSize,
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

    const pagination = pageInfo(page, pageSize, totalPayments);
    redirectPastLastPage(`/admin/users/dossier/${clientId}/paiements`, sp, pagination, payments.length);

    return (
        <PaymentsTable
            initialPayments={serializedPayments}
            pagination={pagination}
            initialParams={listParams}
            availableTypes={Object.values(PaymentType)}
            availableMethods={Object.values(PaymentMethod)}
            initialTotalAmount={(totals._sum.amount ?? new Prisma.Decimal(0)).toString()}
            hideSearch
            presetClient={client}
        />
    );
}
