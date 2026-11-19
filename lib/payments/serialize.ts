import { Prisma } from '@prisma/client';
import { userAddressLines } from '@/lib/users/formatAddress';
import { isSuperAdmin } from '@/lib/auth/guards';
import { hasIssuedReceipt } from '@/lib/payments/status';

/**
 * Un paiement tel que la fenêtre « Paiement » et ses documents le lisent — la
 * même forme pour GET, PATCH et les deux gestes d'impression
 * (/api/payments/[id]/request, /receipt), qui rendent le paiement à jour pour que
 * la fenêtre n'ait pas à le recharger.
 *
 * Le client porte sa civilité et son adresse postale, comme celui d'une facture
 * (GET /api/bills/[id]) : la pro-forma, la demande et le reçu s'adressent à
 * quelqu'un.
 */
export const paymentDetailInclude = {
    client: {
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            civility: { select: { name: true } },
            addresses: {
                select: {
                    addressLine1: true,
                    addressSupplement: true,
                    city: true,
                    postalCode: true,
                    stateProvince: true,
                    country: true,
                    isDefault: true,
                },
            },
        },
    },
    bill: { select: { id: true, invoiceAmount: true, state: true, creationDate: true } },
} as const satisfies Prisma.PaymentInclude;

type PaymentDetailRow = Prisma.PaymentGetPayload<{ include: typeof paymentDetailInclude }>;

export function serializePaymentDetail(p: PaymentDetailRow, me: { accessLevel: string }) {
    const { client, bill, ...rest } = p;
    const receiptLocked = hasIssuedReceipt(p);
    return {
        ...rest,
        amount: p.amount.toString(),
        creationDate: p.creationDate.toISOString(),
        issueDate: p.issueDate?.toISOString() ?? null,
        paymentDate: p.paymentDate?.toISOString() ?? null,
        requestDate: p.requestDate?.toISOString() ?? null,
        exportDate: p.exportDate?.toISOString() ?? null,
        importDate: p.importDate?.toISOString() ?? null,
        allocationDate: p.allocationDate?.toISOString() ?? null,
        deletedAt: p.deletedAt?.toISOString() ?? null,
        client: client
            ? {
                id: client.id,
                firstName: client.firstName,
                lastName: client.lastName,
                email: client.email,
                civility: client.civility?.name ?? null,
                address: userAddressLines(client.addresses),
            }
            : null,
        bill: bill
            ? { ...bill, invoiceAmount: bill.invoiceAmount.toString(), creationDate: bill.creationDate.toISOString() }
            : null,
        /** Un reçu a été émis par le portail : ce qu'il imprime ne bouge plus (RECEIPT_LOCKED_FIELDS). */
        receiptLocked,
        /** Un super admin peut corriger un paiement au reçu émis — les autres non. */
        canEditLockedFields: !receiptLocked || isSuperAdmin(me.accessLevel),
    };
}
