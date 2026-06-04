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
    DRAFT:  'bg-gray-100 text-gray-800',
    BILLED: 'bg-blue-100 text-blue-800',
    PAID:   'bg-green-100 text-green-800',
    SOLDE:  'bg-purple-100 text-purple-800',
};

export const getBillingStatusColor = (status: BillingStatus): string =>
    BILLING_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800';

export const getBillingStatusLabel = (status: BillingStatus): string =>
    BILLING_STATUS_LABELS[status] ?? status;