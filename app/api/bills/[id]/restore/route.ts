import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { logBillEvent } from '@/lib/billing';
import { getUserNameOnly } from '@/lib/users/displayName';

/**
 * Le pendant de DELETE /api/bills/[id] — même principe que les restore des
 * demandes, des livres et des personnes : la facture n'a jamais été détruite,
 * `isActive`/`deletedAt` la cachaient seulement (findUnique n'est pas filtré par
 * lib/prisma.ts), donc l'undo est une écriture.
 *
 * ELLE REVIENT VIDE, ET C'EST VOULU
 *
 * La suppression a détaché les demandes et les paiements de la facture, et
 * remis son total à 0. Rien ne dit de façon sûre où ils sont passés depuis :
 * une demande détachée est « Non facturé » et s'est peut-être déjà rattachée au
 * brouillon suivant, voire à une facture émise. Les reprendre d'office
 * ferait facturer deux fois. La facture est donc restaurée comme un brouillon
 * vide ; c'est « Ajouter une demande » qui la remplit de nouveau.
 *
 * Seul blocage : l'auditeur a été supprimé entre-temps — un brouillon vivant au
 * nom d'une fiche cachée partout ressortirait dans la facturation d'une
 * personne qui n'existe plus aux ECA (même refus que la restauration d'une demande).
 */

export const POST = withAdmin(async (_request, { params, me }) => {
    const { id } = (await params) ?? {};
    const billId = Number(id);
    if (!Number.isInteger(billId) || billId <= 0) {
        return NextResponse.json({ message: 'Identifiant invalide' }, { status: 400 });
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const bill = await tx.bill.findUnique({
                where: { id: billId },
                select: {
                    id: true,
                    isActive: true,
                    deletedAt: true,
                    client: { select: { id: true, firstName: true, lastName: true, deletedAt: true } },
                },
            });
            if (!bill) return { kind: 'not-found' as const };
            if (bill.isActive && !bill.deletedAt) return { kind: 'already-active' as const };
            if (bill.client.deletedAt) return { kind: 'client-deleted' as const, client: bill.client };

            await tx.bill.update({
                where: { id: billId },
                data: { isActive: true, deletedAt: null },
            });
            await logBillEvent(tx, {
                billId,
                type: 'CREATED',
                payload: { reason: 'bill-restored' },
                performedById: me.id,
            });
            return { kind: 'restored' as const };
        });

        if (result.kind === 'not-found') {
            return NextResponse.json({ message: 'Facture introuvable' }, { status: 404 });
        }
        if (result.kind === 'client-deleted') {
            return NextResponse.json(
                {
                    message:
                        `La fiche de l’auditeur de cette facture (${getUserNameOnly(result.client) || `n°${result.client.id}`}) a été supprimée. ` +
                        `Restaurez d’abord sa fiche, puis cette facture.`,
                    clientId: result.client.id,
                },
                { status: 409 }
            );
        }
        if (result.kind === 'already-active') {
            return NextResponse.json({
                message: 'Cette facture n’est pas supprimée : rien à restaurer.',
                restoredId: billId,
                alreadyActive: true,
            });
        }

        revalidateAdmin();
        return NextResponse.json({
            message: 'La facture a été restaurée, vide : ses demandes ne sont pas rattachées de nouveau. Utilisez « Ajouter une demande » pour la remplir.',
            restoredId: billId,
        });
    } catch (error) {
        console.error('Error restoring bill:', error);
        return NextResponse.json({ message: 'Erreur lors de la restauration de la facture' }, { status: 500 });
    }
});
