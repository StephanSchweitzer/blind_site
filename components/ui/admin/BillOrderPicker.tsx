import { ExternalLink } from 'lucide-react';
import { getBillingStatusLabel, type BillingStatus, type BillKind } from '@/lib/billing-enums';
import { parisDate } from '@/lib/paris-day';
import type { OrderAttachBlock } from '@/lib/billing';

// Les deux listes où l'on choisit quoi facturer — « Créer une nouvelle facture »
// et « Ajouter une demande » d'un brouillon — lisent GET /api/bills/eligible-orders
// et rendent ses deux moitiés avec ce qui suit.

/** STATUS.TERMINE / STATUS.ATTENTE_AUDITEUR — dupliqués ici parce que lib/statusSync.ts est serveur. */
const TERMINE_STATUS_ID = 3;
const ATTENTE_AUDITEUR_STATUS_ID = 6;

/** Une demande qu'on ne peut pas rattacher ici, et pourquoi (orderAttachBlock). */
export interface UnavailableOrder {
    id: number;
    requestReceivedDate: string;
    statusId: number;
    statusName: string | null;
    isDuplication: boolean;
    pagePriced: boolean;
    reason: OrderAttachBlock;
    bill: { id: number; state: BillingStatus; kind: BillKind } | null;
    catalogue: { title: string; author: string };
}

/**
 * Sous une demande rattachable mais pas encore « Terminé » : elle reste cochable,
 * facturer une prestation en cours est parfois le bon geste. (« Attente envoi
 * vers auditeur » n'arrive plus ici : elle se facture à sa clôture.)
 */
export function OrderNotFinishedNote({ statusId }: { statusId: number }) {
    if (statusId === TERMINE_STATUS_ID) return null;
    return (
        <div className="text-amber-700 dark:text-amber-500 text-xs mt-0.5">
            Prestation pas encore terminée
        </div>
    );
}

const linkClass =
    'text-blue-700 dark:text-blue-400 underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300';

/** Ce qui retient la demande, en une ligne — et où aller pour la débloquer. */
function UnavailableReason({ order }: { order: UnavailableOrder }) {
    switch (order.reason) {
        case 'ON_BILL': {
            const bill = order.bill!;
            return (
                <a href={`/admin/bills?bill=${bill.id}`} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    Sur la facture {bill.kind === 'PROFORMA' ? 'pro-forma ' : ''}#{bill.id} ({getBillingStatusLabel(bill.state)})
                </a>
            );
        }
        case 'AWAITING_SHIPMENT':
            return <>Pas encore expédiée à l&apos;auditeur : renseignez sa date de clôture, elle sera alors facturée toute seule</>;
        case 'KIND_MISMATCH':
            if (!order.pagePriced) return <>Tarifée au poids : elle ne va pas sur une facture pro-forma</>;
            if (order.statusId === ATTENTE_AUDITEUR_STATUS_ID) {
                return <>Tarifée à la page, pas encore expédiée : renseignez sa date de clôture, sa facture pro-forma sera alors émise</>;
            }
            if (order.statusId === TERMINE_STATUS_ID) {
                // Terminée mais sur aucune facture : sa pro-forma a été supprimée, elle
                // ne se recrée pas toute seule (voir le guide, « Les factures pro-forma »).
                return <>Tarifée à la page, sans facture pro-forma : rouvrez la demande, puis renseignez de nouveau sa date de clôture</>;
            }
            return <>Tarifée à la page : elle aura sa propre facture pro-forma, émise à sa clôture</>;
        case 'UNBILLABLE':
            return <>Marquée « Non facturable »</>;
    }
}

/**
 * Les demandes de l'auditeur qu'on ne peut pas rattacher, TOUJOURS sous celles
 * qu'on peut, grisées, avec la raison et le lien qui mène où ça se règle : la
 * facture qui la porte déjà, ou la demande à clôturer.
 *
 * Grisées sans perdre le contraste : couleurs atténuées sur fond atténué, pas
 * d'`opacity` — la raison est le texte qu'on vient lire.
 */
export function UnavailableOrderList({
    orders,
    total,
    clientName,
}: {
    orders: UnavailableOrder[];
    total: number;
    clientName: string;
}) {
    if (orders.length === 0) return null;
    const hidden = total - orders.length;
    return (
        <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground px-1 pt-1">
                Autres demandes de cet auditeur — pas à rattacher ici
            </div>
            <ul className="border border-border rounded-md divide-y divide-border bg-muted/40">
                {orders.map((o) => (
                    <li key={o.id} className="flex items-start gap-3 px-3 py-2">
                        <div className="flex-1 min-w-0">
                            <div className="text-muted-foreground text-sm break-words">
                                #{o.id} — {o.catalogue.title}
                            </div>
                            <div className="text-muted-foreground text-xs break-words">
                                {o.catalogue.author} · {parisDate(o.requestReceivedDate)}
                                {o.statusName ? ` · ${o.statusName}` : ''}
                            </div>
                            <div className="text-muted-foreground text-xs mt-0.5">
                                <UnavailableReason order={o} />
                            </div>
                        </div>
                        <a
                            href={`/admin/orders?order=${o.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ouvrir la demande dans un nouvel onglet"
                            aria-label={`Ouvrir la demande #${o.id} dans un nouvel onglet`}
                            className="shrink-0 p-1 rounded text-muted-foreground hover:text-blue-600 hover:bg-blue-100 dark:hover:text-blue-400 dark:hover:bg-blue-900/20 transition-colors"
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    </li>
                ))}
            </ul>
            {hidden > 0 && (
                <p className="text-xs text-muted-foreground px-1">
                    {hidden === 1
                        ? '1 autre demande n’est pas affichée : cherchez-la'
                        : `${hidden} autres demandes ne sont pas affichées : cherchez-en une`}{' '}
                    par son titre, son auteur ou son numéro, ou{' '}
                    <a
                        href={`/admin/bills?search=${encodeURIComponent(clientName)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkClass}
                    >
                        voyez toutes ses factures
                    </a>
                    .
                </p>
            )}
        </div>
    );
}
