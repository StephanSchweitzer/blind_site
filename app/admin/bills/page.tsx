import { prisma } from '@/lib/prisma';
import { BillingStatus, BillKind, Prisma } from '@prisma/client';
import BillsTable from './bills-table';
import { buildBillSearchWhere } from '@/lib/search';
import { billsTableInclude } from '@/types/models/bill.model';
import { notFound } from 'next/navigation';
import { parsePageParam, pageSkip } from '@/lib/pagination';
import { rescueEmptySearch, rescueNote, RESCUE_CANDIDATES, type RescueFilter } from '@/lib/search-rescue';
import { getUserNameOnly } from '@/lib/users/displayName';
import { BILL_KIND_LABELS, BILLING_STATUS_LABELS } from '@/lib/billing-enums';
import { parisDate } from '@/lib/paris-day';
import { lateBillsWhere } from '@/lib/billing';
import type { RescueRow, RescueSuggestion } from '@/lib/search-suggestion-types';

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
    kind?: BillKind,
) {
    const billsPerPage = 10;

    // The whole where clause for a given search term — a function so the
    // « Essayez plutôt » block can count another term, or the same one with
    // some filters `lifted` (keyed by URL parameter) — see lib/search-rescue.ts.
    const whereFor = (searchTerm: string, lifted: string[] = []): Prisma.BillWhereInput => {
        // Hide soft-deleted bills from the listing.
        const whereClause: Prisma.BillWhereInput = { isActive: true };

        // Tokens AND-ed across the auditeur, the books on the demandes this facture
        // covers, the payment reference and the number — so « morvan instructions »
        // finds the facture carrying that demande. See buildBillSearchWhere.
        if (searchTerm) {
            const tokenClauses = buildBillSearchWhere(searchTerm);
            if (tokenClauses) whereClause.AND = tokenClauses;
        }

        if (showLate && !lifted.includes('late')) {
            Object.assign(whereClause, lateBillsWhere());
        } else if (status && !lifted.includes('status')) {
            whereClause.state = status;
        }
        if (kind && !lifted.includes('kind')) whereClause.kind = kind;
        return whereClause;
    };
    const whereClause = whereFor(searchTerm);
    try {
        const [bills, totalBills] = await Promise.all([
            prisma.bill.findMany({
                where: whereClause,
                orderBy: { creationDate: 'desc' },
                skip: pageSkip(page, billsPerPage),
                take: billsPerPage,
                include: billsTableInclude,
            }),
            prisma.bill.count({ where: whereClause }),
        ]);

        // Only when the search found nothing — see lib/search-rescue.ts.
        const searchSuggestions =
            totalBills === 0 && searchTerm
                ? await rescueBills(searchTerm, whereFor, { status, showLate, kind })
                : [];

        return {
            searchSuggestions,
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

/**
 * « Essayez plutôt » for the factures — lib/search-rescue.ts. Each facture
 * found names its client and a book it covers (the search looks in both),
 * and, under a lifted filter, its state, type or issue date.
 */
async function rescueBills(
    search: string,
    whereFor: (term: string, lifted?: string[]) => Prisma.BillWhereInput,
    active: { status?: BillingStatus; showLate?: boolean; kind?: BillKind },
): Promise<RescueSuggestion[]> {
    const filters: RescueFilter[] = [];
    // « En retard » forces the state to « Émise » and greys the select out:
    // one filter to lift, not two.
    if (active.showLate) filters.push({ key: 'late', label: 'Factures en retard' });
    else if (active.status) filters.push({ key: 'status', label: `État : ${BILLING_STATUS_LABELS[active.status]}` });
    if (active.kind) {
        filters.push({
            key: 'kind',
            label: active.kind === 'PROFORMA' ? BILL_KIND_LABELS.PROFORMA : 'Factures standard',
        });
    }

    return rescueEmptySearch({
        search,
        domains: ['people', 'books'],
        filters,
        count: (q) => prisma.bill.count({ where: whereFor(q.query, q.lifted) }),
        find: (q) =>
            prisma.bill.findMany({
                where: whereFor(q.query, q.lifted),
                orderBy: { creationDate: 'desc' },
                take: RESCUE_CANDIDATES,
                include: {
                    ...billsTableInclude,
                    orders: { select: { catalogue: { select: { title: true } } }, take: 3 },
                },
            }),
        rankText: (b) =>
            [getUserNameOnly(b.client), ...b.orders.map((o) => o.catalogue?.title), b.paymentReference, b.id]
                .filter(Boolean).join(' '),
        toRow: (b, q): RescueRow => ({
            id: b.id,
            title: `${b.kind === 'PROFORMA' ? BILL_KIND_LABELS.PROFORMA : 'Facture'} n°${b.id} — ${getUserNameOnly(b.client) || 'sans client'}`,
            detail: [
                b.orders[0]?.catalogue?.title,
                `${b.invoiceAmount.toFixed(2).replace('.', ',')} €`,
            ].filter(Boolean).join(' · '),
            note: rescueNote(q.lifted, {
                status: () => BILLING_STATUS_LABELS[b.state],
                late: () => b.state !== 'BILLED'
                    ? BILLING_STATUS_LABELS[b.state]
                    : b.issueDate ? `Émise le ${parisDate(b.issueDate)}` : null,
                kind: () => (b.kind === 'PROFORMA' ? BILL_KIND_LABELS.PROFORMA : 'Facture standard'),
            }),
        }),
    });
}

export default async function AdminBillsPage({ searchParams }: PageProps) {
    const params = await searchParams;

    const page = parsePageParam(params.page);
    const searchTerm = Array.isArray(params.search)
        ? params.search[0]
        : params.search || '';

    const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;
    const status = rawStatus && Object.values(BillingStatus).includes(rawStatus as BillingStatus)
        ? (rawStatus as BillingStatus)
        : undefined;

    const rawKind = Array.isArray(params.kind) ? params.kind[0] : params.kind;
    const kind = rawKind && Object.values(BillKind).includes(rawKind as BillKind)
        ? (rawKind as BillKind)
        : undefined;

    const showLate = (Array.isArray(params.late) ? params.late[0] : params.late) === 'true';

    // Only the data fetch is guarded; notFound() throws (returns `never`),
    // so `data` is definitely assigned past this point.
    let data: Awaited<ReturnType<typeof getBills>>;
    try {
        data = await getBills(page, searchTerm, status, showLate, kind);
    } catch (error) {
        console.error('Error in Admin Bills page:', error);
        notFound();
    }

    const { bills, totalBills, totalPages, availableStatuses, searchSuggestions } = data;

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
                searchSuggestions={searchSuggestions}
            />
        </div>
    );
}