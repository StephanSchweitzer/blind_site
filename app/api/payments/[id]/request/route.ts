import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';
import { markRequestSent, DOCUMENT_ERRORS } from '@/lib/payments/documents';
import { paymentDetailInclude, serializePaymentDetail } from '@/lib/payments/serialize';

// La demande de paiement part : un paiement « Pro-forma » devient « Demandé », daté du jour.
// Réimprimer une demande déjà partie ne change rien (markRequestSent).
// Le geste vit dans sa propre route, et non dans PATCH : c'est l'impression qui
// le déclenche, pas le formulaire — et un formulaire qui renvoie tous ses champs
// ne doit pas pouvoir émettre un reçu en passant.
export const POST = withAdmin(async (_request, { me, params }) => {
    const { id } = await params!;
    const paymentId = parseInt(id, 10);
    if (Number.isNaN(paymentId)) {
        return NextResponse.json({ error: 'Invalid id', message: 'Identifiant invalide' }, { status: 400 });
    }
    try {
        const payment = await prisma.$transaction(async (tx) => {
            await markRequestSent(tx, paymentId);
            return tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: paymentDetailInclude });
        });
        return NextResponse.json({ payment: serializePaymentDetail(payment, me) });
    } catch (error) {
        const msg = error instanceof Error ? error.message : '';
        const known = DOCUMENT_ERRORS[msg];
        if (known) return NextResponse.json({ error: msg, message: known[0] }, { status: known[1] });
        console.error('Error in payment request:', error);
        return NextResponse.json({ error: 'Failed', message: 'Une erreur inattendue est survenue' }, { status: 500 });
    }
});
