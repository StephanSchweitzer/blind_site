import { Prisma, PaymentType } from '@prisma/client';
import { buildPaymentSearchWhere } from '@/lib/search';
import { parisDayStartUtc, parisDayEndUtc } from '@/lib/paris-day';
import type { PaymentListParams } from '@/lib/payments/list-params';

/**
 * La liste des paiements, lue une fois pour toutes — la moitié SERVEUR.
 *
 * Trois écrans la rendent — la page /admin/payments, l'onglet « Paiements » d'un
 * dossier, et la route /api/payments qui la pagine — et chacun portait sa copie
 * du `where`. C'est la même dérive que `lib/search.ts` décrit pour la recherche :
 * deux copies d'un filtre sont deux filtres qui divergent, et le compte affiché
 * à côté d'une liste finit par ne plus décrire cette liste.
 *
 * L'analyse des paramètres vit dans `list-params.ts`, sans Prisma, parce que le
 * tableau client en a besoin — voir le commentaire là-bas.
 */

// Réexportés pour que les appelants serveur n'aient qu'un import à faire.
export * from '@/lib/payments/list-params';

export function buildPaymentListWhere(p: PaymentListParams): Prisma.PaymentWhereInput {
    // Tout s'accumule dans un seul AND plutôt que sur des clés du même objet :
    // la recherche en pose déjà plusieurs (un groupe par token), et deux filtres
    // qui viseraient la même colonne s'écraseraient l'un l'autre.
    const and: Prisma.PaymentWhereInput[] = [];

    if (!p.includeInactive) and.push({ isActive: true });

    const tokenClauses = p.search ? buildPaymentSearchWhere(p.search) : null;
    if (tokenClauses) and.push(...tokenClauses);

    if (p.type) and.push({ type: p.type as PaymentType });
    if (p.paymentMethod) and.push({ paymentMethod: p.paymentMethod });
    if (p.clientId !== undefined) and.push({ clientId: p.clientId });

    const gte = p.from ? parisDayStartUtc(p.from) : null;
    const lt = p.to ? parisDayEndUtc(p.to) : null;
    if (gte || lt) {
        and.push({
            [p.dateField]: {
                ...(gte ? { gte } : {}),
                ...(lt ? { lt } : {}),
            },
        } as Prisma.PaymentWhereInput);
    }

    // Restreint aux enregistrements : eux seuls peuvent porter une facture, si
    // bien qu'un filtre non restreint remonterait toutes les cotisations et ne
    // désignerait plus rien.
    if (p.unlinked) and.push({ type: PaymentType.ENREGISTREMENT, billId: null });

    // `isAllocated` est nullable : les lignes jamais renseignées sont, elles
    // aussi, des paiements non affectés — les omettre viderait la file de moitié.
    if (p.unallocated) and.push({ OR: [{ isAllocated: false }, { isAllocated: null }] });

    return and.length ? { AND: and } : {};
}

export function buildPaymentListOrderBy(
    p: PaymentListParams
): Prisma.PaymentOrderByWithRelationInput[] {
    // Les lignes sans date de règlement ferment la liste dans les deux sens :
    // trier sur une colonne facultative mettrait sinon en tête, à l'ascendant,
    // toutes celles qui n'ont justement rien à dire sur ce critère.
    const primary: Prisma.PaymentOrderByWithRelationInput =
        p.sort === 'paymentDate'
            ? { paymentDate: { sort: p.dir, nulls: 'last' } }
            : ({ [p.sort]: p.dir } as Prisma.PaymentOrderByWithRelationInput);

    // Départage stable : sans second critère, deux paiements du même jour
    // peuvent changer de place entre deux pages et l'un se retrouver montré
    // deux fois, l'autre jamais.
    return p.sort === 'id' ? [primary] : [primary, { id: 'desc' }];
}
