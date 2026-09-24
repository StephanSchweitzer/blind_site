import { prisma } from '@/lib/prisma';
import { PaymentType, PaymentMethod, Prisma } from '@prisma/client';
import PaymentsTable from './payments-table';
import { paymentsTableInclude } from '@/types/models/payment.model';
import { notFound } from 'next/navigation';
import { ADMIN_PAGE_SIZE, parsePageParam, pageSkip } from '@/lib/pagination';
import {
    parsePaymentListParams,
    buildPaymentListWhere,
    buildPaymentListOrderBy,
    type PaymentListParams,
} from '@/lib/payments/list-query';
import { rescueEmptySearch, rescueNote, RESCUE_CANDIDATES, type RescueFilter } from '@/lib/search-rescue';
import { getUserNameOnly } from '@/lib/users/displayName';
import { getPaymentMethodLabel, getPaymentTypeLabel } from '@/lib/payment-enums';
import { parisDate } from '@/lib/paris-day';
import type { RescueRow, RescueSuggestion } from '@/lib/search-suggestion-types';

interface PageProps {
    searchParams: Promise<{
        [key: string]: string | string[] | undefined;
    }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getPayments(page: number, params: PaymentListParams) {
    const paymentsPerPage = ADMIN_PAGE_SIZE;

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

        // Only when the search found nothing — see lib/search-rescue.ts.
        const searchSuggestions =
            totalPayments === 0 && params.search ? await rescuePayments(params) : [];

        return {
            searchSuggestions,
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

/**
 * « Essayez plutôt » for the paiements — lib/search-rescue.ts. The filters are
 * keyed as the table's own filter labels are (`activeFilters` in
 * payments-table.tsx), which name them: one list of names, not two.
 *
 * The client is not a filter here: in a dossier it is the page itself, and
 * `includeInactive` only ever widens the list.
 */
async function rescuePayments(params: PaymentListParams): Promise<RescueSuggestion[]> {
    const without = (query: string, lifted: string[]): PaymentListParams => ({
        ...params,
        search: query,
        type: lifted.includes('type') ? undefined : params.type,
        paymentMethod: lifted.includes('method') ? undefined : params.paymentMethod,
        from: lifted.includes('period') ? undefined : params.from,
        to: lifted.includes('period') ? undefined : params.to,
        unlinked: lifted.includes('unlinked') ? false : params.unlinked,
        unallocated: lifted.includes('unallocated') ? false : params.unallocated,
    });

    const filters: RescueFilter[] = [];
    if (params.type) filters.push({ key: 'type', label: 'type' });
    if (params.paymentMethod) filters.push({ key: 'method', label: 'method' });
    if (params.from || params.to) filters.push({ key: 'period', label: 'period' });
    if (params.unlinked) filters.push({ key: 'unlinked', label: 'unlinked' });
    if (params.unallocated) filters.push({ key: 'unallocated', label: 'unallocated' });

    const day = (p: { paymentDate: Date | null; creationDate: Date }) =>
        parisDate(params.dateField === 'paymentDate' ? p.paymentDate ?? p.creationDate : p.creationDate);

    return rescueEmptySearch({
        search: params.search,
        domains: ['people'],
        filters,
        count: (q) => prisma.payment.count({ where: buildPaymentListWhere(without(q.query, q.lifted)) }),
        find: (q) =>
            prisma.payment.findMany({
                where: buildPaymentListWhere(without(q.query, q.lifted)),
                orderBy: buildPaymentListOrderBy(params),
                take: RESCUE_CANDIDATES,
                include: paymentsTableInclude,
            }),
        rankText: (p) => [getUserNameOnly(p.client), p.paymentReference, p.receiptNumber, p.id].filter(Boolean).join(' '),
        toRow: (p, q): RescueRow => ({
            id: p.id,
            title: `Paiement n°${p.id} — ${getUserNameOnly(p.client) || 'sans client'}`,
            // A lifted filter's value is the note — not said twice.
            detail: [
                q.lifted.includes('type') ? null : getPaymentTypeLabel(p.type),
                `${p.amount.toFixed(2).replace('.', ',')} €`,
                q.lifted.includes('period') ? null : day(p),
            ].filter(Boolean).join(' · '),
            note: rescueNote(q.lifted, {
                type: () => getPaymentTypeLabel(p.type),
                method: () => getPaymentMethodLabel(p.paymentMethod),
                period: () => day(p),
                unlinked: () => (p.bill ? `Facture n°${p.bill.id}` : null),
                unallocated: () => (p.isAllocated ? 'Affecté' : null),
            }),
        }),
    });
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

    const { payments, totalPayments, totalAmount, totalPages, availableTypes, availableMethods, searchSuggestions } = data;

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
                searchSuggestions={searchSuggestions}
            />
        </div>
    );
}
