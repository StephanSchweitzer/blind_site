import { prisma } from '@/lib/prisma';
import { PaymentType, PaymentMethod, Prisma } from '@prisma/client';
import PaymentsTable from './payments-table';
import { paymentsTableInclude } from '@/types/models/payment.model';
import { notFound } from 'next/navigation';
import { parsePageParam, pageSkip } from '@/lib/pagination';
import {
    parsePaymentListParams,
    buildPaymentListWhere,
    buildPaymentListOrderBy,
    type PaymentListParams,
} from '@/lib/payments/list-query';

interface PageProps {
    searchParams: Promise<{
        [key: string]: string | string[] | undefined;
    }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getPayments(page: number, params: PaymentListParams) {
    const paymentsPerPage = 10;

    // Recherche, filtres et tri viennent tous de lib/payments/list-query.ts, que
    // /api/payments lit aussi : la page et la route doivent rendre la même liste.
    const whereClause = buildPaymentListWhere(params);

    try {
        // La SOMME de la sélection, pas seulement son compte.
        //
        // « 47 paiements » ne dit rien à une trésorière qui filtre sur « Don,
        // janvier » : la question est combien, pas combien de lignes. L'agrégat
        // porte sur le MÊME whereClause que la liste, donc sur la sélection
        // entière et non sur la page affichée.
        const [payments, totalPayments, totals] = await Promise.all([
            prisma.payment.findMany({
                where: whereClause,
                orderBy: buildPaymentListOrderBy(params),
                skip: pageSkip(page, paymentsPerPage),
                take: paymentsPerPage,
                include: paymentsTableInclude,
            }),
            prisma.payment.count({ where: whereClause }),
            prisma.payment.aggregate({ where: whereClause, _sum: { amount: true } }),
        ]);

        return {
            payments,
            totalPayments,
            totalAmount: (totals._sum.amount ?? new Prisma.Decimal(0)).toString(),
            totalPages: Math.ceil(totalPayments / paymentsPerPage),
            availableTypes: Object.values(PaymentType),
            availableMethods: Object.values(PaymentMethod),
        };
    } catch (error) {
        console.error('Error fetching payments:', error);
        throw new Error('Failed to fetch payments');
    }
}

export default async function AdminPaymentsPage({ searchParams }: PageProps) {
    const rawParams = await searchParams;

    const page = parsePageParam(rawParams.page);
    const params = parsePaymentListParams(rawParams);

    // Only the data fetch is guarded; notFound() throws (returns `never`),
    // so `data` is definitely assigned past this point.
    let data: Awaited<ReturnType<typeof getPayments>>;
    try {
        data = await getPayments(page, params);
    } catch (error) {
        console.error('Error in Admin Payments page:', error);
        notFound();
    }

    const { payments, totalPayments, totalAmount, totalPages, availableTypes, availableMethods } = data;

    const serializedPayments = payments.map(payment => ({
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
        <div className="space-y-4">
            <PaymentsTable
                initialPayments={serializedPayments}
                initialPage={page}
                initialParams={params}
                totalPages={totalPages}
                availableTypes={availableTypes}
                availableMethods={availableMethods}
                initialTotalPayments={totalPayments}
                initialTotalAmount={totalAmount}
            />
        </div>
    );
}
