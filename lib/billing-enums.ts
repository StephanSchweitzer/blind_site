export const BillingStatus = {
    DRAFT:  'DRAFT',
    BILLED: 'BILLED',
    PAID:   'PAID',
    SOLDE:  'SOLDE',
} as const;

export type BillingStatus = typeof BillingStatus[keyof typeof BillingStatus];

export const BILLING_STATUS_LABELS: Record<BillingStatus, string> = {
    DRAFT:  'Brouillon',
    BILLED: 'Émise',
    PAID:   'Payée',
    SOLDE:  'Soldée',
};

export const BILLING_STATUS_COLORS: Record<BillingStatus, string> = {
    DRAFT:  'bg-gray-100 text-gray-800 dark:bg-gray-800/60 dark:text-gray-300',
    BILLED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    PAID:   'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    SOLDE:  'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
};

export const getBillingStatusColor = (status: BillingStatus): string =>
    BILLING_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-800/60 dark:text-gray-300';

export const getBillingStatusLabel = (status: BillingStatus): string =>
    BILLING_STATUS_LABELS[status] ?? status;

/**
 * Where a *demande* stands relative to invoicing — `Orders.billingStatus`, a
 * different enum from the facture's own `Bill.state` above. A demande is not
 * facturée until the facture carrying it is issued, and UNBILLABLE takes it out
 * of the billing cycle entirely (see ADJUSTABLE_ORDER_WHERE in lib/billing.ts).
 */
export const OrderBillingStatus = {
    UNBILLED:   'UNBILLED',
    BILLED:     'BILLED',
    UNBILLABLE: 'UNBILLABLE',
} as const;

export type OrderBillingStatus = typeof OrderBillingStatus[keyof typeof OrderBillingStatus];

export const ORDER_BILLING_STATUS_LABELS: Record<OrderBillingStatus, string> = {
    UNBILLED:   'Non facturé',
    BILLED:     'Facturé',
    UNBILLABLE: 'Non facturable',
};

export const getOrderBillingStatusLabel = (status: string): string =>
    ORDER_BILLING_STATUS_LABELS[status as OrderBillingStatus] ?? status;