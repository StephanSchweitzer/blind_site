// lib/pricing-sync.ts
// No `server-only` here, deliberately: this belongs to the billing family, which
// doesn't carry it (lib/billing.ts), and the maintenance scripts have to be able
// to import it. It reaches the database on every path, so it is server-side by
// construction, not by marker.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { recomputeBillTotal, logBillEvent } from '@/lib/billing';
import { ADJUSTABLE_ORDER_WHERE, suggestedCostEuros } from '@/lib/pricing';

/**
 * Réaligne le tarif des demandes d'un livre sur le poids de son enregistrement.
 *
 * POURQUOI ICI, ET PAS À LA CLÔTURE DE LA DEMANDE
 *
 * Une attribution terminée termine immédiatement la demande qui lui est liée
 * (syncOrderToStatus, app/api/assignments/[id]/route.ts). Mais à cet instant le
 * livre revient tout juste du lecteur : l'audio n'est pas encore dans le bucket,
 * donc son poids est inconnu et le tarif ne peut pas être calculé. Tarifer
 * « avant que la demande passe Terminé » est donc impossible — l'information
 * n'existe pas encore.
 *
 * Le bon moment est celui où le poids devient connu, c'est-à-dire quand le
 * dossier du livre est relu : dépôt de l'enregistrement, suppression ou
 * restauration d'une piste, rattachement d'un dossier orphelin, fusion de
 * doublons. Tous passent par refreshBookAudioState, qui appelle cette fonction —
 * un seul point de branchement, pour qu'aucun chemin ne l'oublie.
 *
 * CE QUI EST TOUCHÉ, ET CE QUI NE L'EST PAS
 *
 * Seules les demandes encore ajustables (ADJUSTABLE_ORDER_WHERE) : « Non
 * facturé », sur aucune facture ou sur un brouillon. Une demande « Terminé »
 * reste concernée — la terminer ne fige pas son coût, c'est la facture qui le
 * fige. Une demande déjà facturée ne bouge pas : son montant est parti chez
 * l'auditeur, et le corriger est une décision humaine (rouvrir la facture).
 *
 * Le total du brouillon est recalculé et un BillEvent AMOUNT_CHANGED est ajouté,
 * comme pour une modification de coût saisie à la main. Le seuil de facturation
 * n'est délibérément PAS réévalué : émettre une facture est un acte visible
 * (courrier, PDF) et il n'a pas à être déclenché par le dépôt d'un fichier audio.
 * Le brouillon partira à la prochaine demande du client, par le chemin habituel.
 */
export async function repriceOpenOrdersForBook(
    bookId: number,
    performedById: number | null = null
): Promise<{ repriced: number; billsTouched: number }> {
    const book = await prisma.book.findUnique({
        where: { id: bookId },
        select: { audioSizeKb: true },
    });
    // Poids inconnu = rien à dire. Ne jamais retomber sur le tarif plancher ici :
    // ça retarifierait à 3 € des demandes dont on ignore simplement le poids.
    if (!book || book.audioSizeKb == null) return { repriced: 0, billsTouched: 0 };

    const newCost = new Prisma.Decimal(suggestedCostEuros(book.audioSizeKb));

    const candidates = await prisma.orders.findMany({
        where: { ...ADJUSTABLE_ORDER_WHERE, catalogueId: bookId },
        select: { id: true, cost: true, billId: true },
    });

    // `.equals` plutôt que `!==` : 3 et 3.00 sont le même montant, et réécrire une
    // ligne identique ajouterait un AMOUNT_CHANGED qui ne raconte rien.
    const stale = candidates.filter((o) => !(o.cost ?? new Prisma.Decimal(0)).equals(newCost));
    if (stale.length === 0) return { repriced: 0, billsTouched: 0 };

    const byBill = new Map<number | null, typeof stale>();
    for (const o of stale) {
        const list = byBill.get(o.billId);
        if (list) list.push(o);
        else byBill.set(o.billId, [o]);
    }

    let billsTouched = 0;
    for (const [billId, group] of byBill) {
        // Une transaction par facture : les lignes, le total et l'événement d'audit
        // d'une même facture tombent ensemble ou pas du tout.
        await prisma.$transaction(async (tx) => {
            await tx.orders.updateMany({
                where: { id: { in: group.map((o) => o.id) } },
                data: { cost: newCost },
            });
            if (billId == null) return;

            const total = await recomputeBillTotal(tx, billId);
            await logBillEvent(tx, {
                billId,
                type: 'AMOUNT_CHANGED',
                payload: {
                    reason: 'audio-reprice',
                    bookId,
                    audioSizeKb: book.audioSizeKb,
                    orders: group.map((o) => ({
                        orderId: o.id,
                        previousCost: o.cost?.toString() ?? null,
                        newCost: newCost.toString(),
                    })),
                    newTotal: total.toString(),
                },
                performedById,
            });
        });
        if (billId != null) billsTouched++;
    }

    return { repriced: stale.length, billsTouched };
}
