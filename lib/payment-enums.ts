// Client-safe enum definitions. These are defined locally (NOT re-exported from
// @prisma/client) so this module can be imported from 'use client' components
// without pulling the Prisma runtime into the browser bundle. The string values
// match the PaymentType / PaymentMethod enums in schema.prisma exactly, so they
// stay interchangeable with Prisma's enums at the server boundary.

export const PaymentType = {
    COTISATION: 'COTISATION',
    ENREGISTREMENT: 'ENREGISTREMENT',
    DON: 'DON',
    DIVERS: 'DIVERS',
} as const;
export type PaymentType = (typeof PaymentType)[keyof typeof PaymentType];

export const PaymentMethod = {
    CHEQUE: 'CHEQUE',
    ESPECE: 'ESPECE',
    CB: 'CB',
    VIREMENT: 'VIREMENT',
    COMPTE_AUXI: 'COMPTE_AUXI',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

// ─── Payment type ───────────────────────────────────────────────────────────

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
    [PaymentType.COTISATION]: 'Cotisation',
    [PaymentType.ENREGISTREMENT]: 'Enregistrement',
    [PaymentType.DON]: 'Don',
    [PaymentType.DIVERS]: 'Divers',
};

export function getPaymentTypeLabel(type: PaymentType): string {
    return PAYMENT_TYPE_LABELS[type] ?? type;
}

const PAYMENT_TYPE_COLORS: Record<PaymentType, string> = {
    [PaymentType.COTISATION]: 'bg-blue-900/40 text-blue-300 border border-blue-800',
    [PaymentType.ENREGISTREMENT]: 'bg-purple-900/40 text-purple-300 border border-purple-800',
    [PaymentType.DON]: 'bg-green-900/40 text-green-300 border border-green-800',
    [PaymentType.DIVERS]: 'bg-gray-700/60 text-gray-300 border border-gray-600',
};

export function getPaymentTypeColor(type: PaymentType): string {
    return PAYMENT_TYPE_COLORS[type] ?? 'bg-gray-700 text-gray-200';
}

// ─── Payment method ───────────────────────────────────────────────────────────

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
    [PaymentMethod.CHEQUE]: 'Chèque',
    [PaymentMethod.ESPECE]: 'Espèce',
    [PaymentMethod.CB]: 'Carte bancaire',
    [PaymentMethod.VIREMENT]: 'Virement',
    [PaymentMethod.COMPTE_AUXI]: 'Compte Auxi',
};

export function getPaymentMethodLabel(method: PaymentMethod | null | undefined): string {
    if (!method) return '-';
    return PAYMENT_METHOD_LABELS[method] ?? method;
}