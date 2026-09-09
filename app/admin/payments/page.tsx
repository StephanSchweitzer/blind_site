import { prisma } from '@/lib/prisma';
import { PaymentType, PaymentMethod, Prisma } from '@prisma/client';
import PaymentsTable from './payments-table';
import { buildPaymentSearchWhere } from '@/lib/search';
import { paymentsTableInclude } from '@/types/models/payment.model';
import { notFound } from 'next/navigation';
import { parsePageParam, pageSkip } from '@/lib/pagination';

interface PageProps {
    searchParams: Promise<{
        [key: string]: string | string[] | undefined;
    }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getPayments(
    page: number,
    searchTerm: string,
    type?: PaymentType,
    paymentMethod?: PaymentMethod,
) {
    const paymentsPerPage = 10;

    // Hide soft-deleted payments from the listing.
    const whereClause: Prisma.PaymentWhereInput = { isActive: true };

    // Tokens AND-ed across la personne, la référence du règlement, le n° de reçu,
    // le numéro du paiement et celui de la facture réglée — « 412 » trouve donc
    // aussi bien le paiement que les paiements de la facture. Voir
    // buildPaymentSearchWhere.
    if (searchTerm) {
        const tokenClauses = buildPaymentSearchWhere(searchTerm);
        if (tokenClauses) whereClause.AND = tokenClauses;
    }

    if (type) whereClause.type = type;
    if (paymentMethod) whereClause.paymentMethod = paymentMethod;

    try {
        // La SOMME de la sélection, pas seulement son compte.
        //
        // « 47 paiements » ne dit rien à une trésorière qui filtre sur « Don,
        // 2026 » : la question est combien, pas combien de lignes. L'agrégat
        // porte sur le MÊME whereClause que la liste, donc sur la sélection
        // entière et non sur la page affichée.
        const [payments, totalPayments, totals] = await Promise.all([
            prisma.payment.findMany({
                where: whereClause,
                orderBy: { creationDate: 'desc' },
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
    const params = await searchParams;

    const page = parsePageParam(params.page);
    const searchTerm = Array.isArray(params.search)
        ? params.search[0]
        : params.search || '';

    const rawType = Array.isArray(params.type) ? params.type[0] : params.type;
    const type = rawType && Object.values(PaymentType).includes(rawType as PaymentType)
        ? (rawType as PaymentType)
        : undefined;

    const rawMethod = Array.isArray(params.paymentMethod) ? params.paymentMethod[0] : params.paymentMethod;
    const paymentMethod = rawMethod && Object.values(PaymentMethod).includes(rawMethod as PaymentMethod)
        ? (rawMethod as PaymentMethod)
        : undefined;

    // Only the data fetch is guarded; notFound() throws (returns `never`),
    // so `data` is definitely assigned past this point.
    let data: Awaited<ReturnType<typeof getPayments>>;
    try {
        data = await getPayments(page, searchTerm, type, paymentMethod);
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
                initialSearch={searchTerm}
                totalPages={totalPages}
                availableTypes={availableTypes}
                availableMethods={availableMethods}
                initialTotalPayments={totalPayments}
                initialTotalAmount={totalAmount}
            />
        </div>
    );
}