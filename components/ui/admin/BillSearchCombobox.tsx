'use client';

import React from 'react';
import { EntitySearchCombobox } from '@/admin/EntitySearchCombobox';
import { BillingStatus, getBillingStatusLabel } from '@/lib/billing-enums';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export interface BillSearchResult {
    id: number;
    invoiceAmount: string | number;
    state: string;
    creationDate: string;
}

interface BillSearchComboboxProps<T extends BillSearchResult> {
    value: T | null;
    onSelect: (bill: T) => boolean | void | Promise<boolean | void>;
    /** Every caller of this picker already has a client in hand — it never searches across clients. */
    clientId: number;
    placeholder?: string;
    triggerRef?: React.Ref<HTMLButtonElement>;
    triggerClassName?: string;
}

// Matches GET /api/bills' own default page size, so the empty-query open and
// this component agree on what "recent" means without either hardcoding the
// other's number.
const BILL_RESULT_LIMIT = 10;

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

export const billLabel = (bill: BillSearchResult): string =>
    `Facture #${bill.id} — ${format(new Date(bill.creationDate), 'PPP', { locale: fr })} — ` +
    `${getBillingStatusLabel(bill.state as BillingStatus)} — ${formatCurrency(parseFloat(String(bill.invoiceAmount)))}`;

export function BillSearchCombobox<T extends BillSearchResult>({
    value,
    onSelect,
    clientId,
    placeholder = 'Rechercher une facture ...',
    triggerRef,
    triggerClassName,
}: BillSearchComboboxProps<T>) {
    const fetcher = async (query: string, signal: AbortSignal): Promise<T[]> => {
        const params = new URLSearchParams({ clientId: String(clientId), limit: String(BILL_RESULT_LIMIT) });
        if (query) params.set('search', query);
        const res = await fetch(`/api/bills?${params.toString()}`, { signal });
        if (!res.ok) return [];
        const { bills } = await res.json();
        return bills;
    };

    return (
        <EntitySearchCombobox<T>
            value={value}
            onSelect={onSelect}
            fetcher={fetcher}
            getItemKey={(bill) => bill.id}
            renderValue={billLabel}
            renderItem={(bill) => <span>{billLabel(bill)}</span>}
            resultLimit={BILL_RESULT_LIMIT}
            resultNoun="factures"
            searchOnEmpty
            placeholder={placeholder}
            searchPlaceholder="N° de facture, auditeur, livre, auteur, ou référence de paiement..."
            emptyMessage="Aucune facture trouvée"
            emptyDefaultMessage="Aucune facture pour ce client"
            triggerRef={triggerRef}
            triggerClassName={triggerClassName}
        />
    );
}
