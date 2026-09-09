import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';
import {
    parsePaymentListParams,
    buildPaymentListWhere,
    buildPaymentListOrderBy,
} from '@/lib/payments/list-query';
import { getPaymentTypeLabel, getPaymentMethodLabel } from '@/lib/payment-enums';
import { getBillingStatusLabel, type BillingStatus } from '@/lib/billing-enums';
import { getUserNameOnly } from '@/lib/users/displayName';
import { parisDayKey, parisDateDisplay } from '@/lib/paris-day';
import { CSV_BOM, csvRow, csvNumber } from '@/lib/csv';

/**
 * L'export CSV de la liste des paiements.
 *
 * Il lit EXACTEMENT la même sélection que l'écran — mêmes recherche, filtres et
 * tri, par `lib/payments/list-query.ts`. C'est tout l'intérêt : un export qui ne
 * correspond pas à la liste qu'on regarde en devient impossible à vérifier, et
 * une trésorière qui filtre sur « Don, janvier » veut ces lignes-là, pas les
 * huit mille autres.
 */

const HEADERS = [
    'N° paiement',
    'Client',
    'Email',
    'Type',
    'Méthode',
    'Montant',
    'Date de création',
    'Date de paiement',
    'Référence de paiement',
    'N° de reçu',
    'N° facture',
    'État facture',
    'Année de cotisation',
    'Fiscalité',
    'Comptable',
    'Affecté',
    "Date d'affectation",
    'Observations',
];

/**
 * Les colonnes venant de la SAISIE, à neutraliser contre l'injection de formule
 * (voir lib/csv.ts). Les dates et les montants sont fabriqués ici et n'en sont
 * pas : les neutraliser mettrait une apostrophe devant chaque montant négatif.
 */
const UNTRUSTED_COLUMNS = new Set([1, 2, 8, 9, 14, 17]);

/** Lu par tranches : le tableau complet n'existe jamais entièrement en mémoire. */
const CHUNK = 500;

/**
 * Un plafond, pas une pagination.
 *
 * La table dépasse déjà les huit mille lignes et ne fait que croître. Sans
 * borne, une requête sans filtre finirait par tenir la fonction assez longtemps
 * pour être coupée en plein fichier — un CSV tronqué SANS le dire est pire que
 * l'absence d'export, parce qu'il se lit comme complet. Le dépassement s'écrit
 * donc dans le fichier, en clair, sur sa dernière ligne.
 */
const MAX_ROWS = 50_000;

export const GET = withAdmin(async (request) => {
    const params = parsePaymentListParams(request.nextUrl.searchParams);
    const where = buildPaymentListWhere(params);
    const orderBy = buildPaymentListOrderBy(params);

    const total = await prisma.payment.count({ where });
    const limit = Math.min(total, MAX_ROWS);

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const encoder = new TextEncoder();
            const push = (text: string) => controller.enqueue(encoder.encode(text));

            try {
                push(CSV_BOM + csvRow(HEADERS));

                for (let skip = 0; skip < limit; skip += CHUNK) {
                    const rows = await prisma.payment.findMany({
                        where,
                        orderBy,
                        skip,
                        take: Math.min(CHUNK, limit - skip),
                        include: {
                            client: { select: { name: true, firstName: true, lastName: true, email: true } },
                            bill: { select: { id: true, state: true } },
                        },
                    });

                    for (const p of rows) {
                        push(
                            csvRow(
                                [
                                    p.id,
                                    p.client ? getUserNameOnly(p.client) : '',
                                    p.client?.email ?? '',
                                    getPaymentTypeLabel(p.type),
                                    p.paymentMethod ? getPaymentMethodLabel(p.paymentMethod) : '',
                                    csvNumber(p.amount.toString()),
                                    parisDateDisplay(p.creationDate),
                                    parisDateDisplay(p.paymentDate),
                                    p.paymentReference ?? '',
                                    p.receiptNumber ?? '',
                                    p.bill?.id ?? '',
                                    p.bill ? getBillingStatusLabel(p.bill.state as BillingStatus) : '',
                                    p.cotisationYear ?? '',
                                    p.fiscalite ?? '',
                                    p.comptable ?? '',
                                    p.isAllocated ? 'Oui' : 'Non',
                                    parisDateDisplay(p.allocationDate),
                                    p.observations ?? '',
                                ],
                                UNTRUSTED_COLUMNS
                            )
                        );
                    }
                }

                if (total > limit) {
                    push(
                        csvRow([
                            `Export tronqué : ${limit} lignes sur ${total}. Affinez les filtres pour obtenir le reste.`,
                        ])
                    );
                }
            } catch (error) {
                console.error('Error exporting payments:', error);
                // La réponse a déjà commencé : impossible de rendre un 500. Le
                // dire DANS le fichier est la seule façon honnête de signaler
                // qu'il est incomplet.
                push(csvRow(['Export interrompu par une erreur — fichier incomplet.']));
            } finally {
                controller.close();
            }
        },
    });

    const filename = `paiements-${parisDayKey(new Date())}.csv`;

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store',
        },
    });
});
