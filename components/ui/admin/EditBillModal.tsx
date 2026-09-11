'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Trash2, X, Plus, ChevronLeft, ChevronRight, RotateCcw, History, ExternalLink } from 'lucide-react';
import {
    BillingStatus,
    getBillingStatusColor,
    getBillingStatusLabel,
} from '@/lib/billing-enums';
import { getUserNameOnly } from '@/lib/users/displayName';
import { PaymentMethod, getPaymentMethodLabel } from '@/lib/payment-enums';
import { AddPaymentFormBackend } from './PaymentFormBackendBase';
import { BillPDFButton } from './BillPDFButton';
import { CopyableId } from './CopyableId';
import { BillHistory, BillEventDTO } from './BillHistory';
import { parisDate } from '@/lib/paris-day';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BillOrder {
    id: number;
    requestReceivedDate: string;
    // Imprimés sur la facture — cette modale passe son `bill` tel quel à BillPDF.
    closureDate: string | null;
    isDuplication: boolean;
    cost: number | string | null;
    billingStatus: string;
    catalogue: { title: string; author: string };
}

interface BillDetail {
    id: number;
    state: BillingStatus;
    creationDate: string;
    issueDate: string | null;
    paymentDate: string | null;
    paymentReference: string | null;
    invoiceAmount: number | string;
    client: {
        id: number;
        name: string | null;
        email: string | null;
        civility?: string | null;
        firstName?: string | null;
        lastName?: string | null;
        address?: string[] | null;
    };
    orders: BillOrder[];
    payments: BillPayment[];
    /** Somme des paiements rattachés, et ce qu'il reste à encaisser. */
    paidTotal: string;
    outstanding: string;
    events: BillEventDTO[];
}

/** Un paiement rattaché — la SOURCE du règlement affiché par la facture. */
interface BillPayment {
    id: number;
    amount: number | string;
    paymentMethod: string | null;
    paymentDate: string | null;
    creationDate: string;
    paymentReference: string | null;
}

interface UnbilledOrder {
    id: number;
    requestReceivedDate: string;
    cost: number | string | null;
    catalogue: { title: string; author: string };
    aveugle: { name: string | null; email: string | null };
}

interface EditBillModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    billId: number | null;
    onRequestDelete?: (billId: number) => void;
    onBillUpdated?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Doit rester le miroir de `transitions` dans app/api/bills/[id]/route.ts, qui
 * seul fait foi — le raisonnement y est écrit en entier.
 *
 * En deux mots : « payée » et « soldée » closent toutes deux la facture, et ce
 * qui les sépare est la COUVERTURE, pas la présence de paiements. Payée, ce qui
 * est entré couvre la facture ; soldée, non, et on renonce au reste. Toutes deux
 * terminales, toutes deux prises depuis « émise ».
 */
const NEXT_STATES: Record<BillingStatus, BillingStatus[]> = {
    [BillingStatus.DRAFT]: [BillingStatus.BILLED],
    [BillingStatus.BILLED]: [BillingStatus.DRAFT, BillingStatus.PAID, BillingStatus.SOLDE],
    [BillingStatus.PAID]: [],
    [BillingStatus.SOLDE]: [],
};

const STATE_ACTION_LABEL: Partial<Record<BillingStatus, string>> = {
    [BillingStatus.BILLED]: 'Émettre la facture',
    [BillingStatus.DRAFT]: 'Remettre en brouillon',
    [BillingStatus.PAID]: 'Marquer comme payée',
    [BillingStatus.SOLDE]: 'Solder la facture',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateString: string | null) {
    if (!dateString) return '-';
    return parisDate(dateString);
}

function formatCurrency(amount: number | string) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
        typeof amount === 'string' ? parseFloat(amount) : amount
    );
}

// Pure fetch (no setState) so it can be called from both the load effect's promise
// callbacks and from event handlers without tripping react-hooks/set-state-in-effect.
async function fetchBillData(id: number): Promise<BillDetail> {
    const res = await fetch(`/api/bills/${id}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || 'Échec du chargement de la facture');
    return data.bill as BillDetail;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EditBillModal({
                                  isOpen,
                                  onOpenChange,
                                  billId,
                                  onRequestDelete,
                                  onBillUpdated,
                              }: EditBillModalProps) {
    const [bill, setBill] = useState<BillDetail | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Status change
    const [pendingState, setPendingState] = useState<BillingStatus | null>(null);
    // Saisie d'un paiement sans quitter la facture : le client, la facture et le
    // reste à payer sont déjà là, les ressaisir dans /admin/payments n'apporte
    // que des occasions de se tromper de facture.
    const [isAddingPayment, setIsAddingPayment] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [statusError, setStatusError] = useState<string | null>(null);

    // Order add (draft mode)
    const [orderSearch, setOrderSearch] = useState('');
    const [unbilledOrders, setUnbilledOrders] = useState<UnbilledOrder[]>([]);
    const [orderPage, setOrderPage] = useState(1);
    const [orderTotalPages, setOrderTotalPages] = useState(1);
    const [isLoadingOrders, setIsLoadingOrders] = useState(false);
    const [addingOrderId, setAddingOrderId] = useState<number | null>(null);
    const [removingOrderId, setRemovingOrderId] = useState<number | null>(null);
    const [showAddPanel, setShowAddPanel] = useState(false);
    const [isReopening, setIsReopening] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Load bill ──────────────────────────────────────────────────────────────

    const loadBill = useCallback(async (id: number) => {
        try {
            const b = await fetchBillData(id);
            setBill(b);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erreur inattendue');
        }
    }, []);

    const resetLocalState = useCallback(() => {
        setBill(null);
        setError(null);
        setPendingState(null);
        setIsAddingPayment(false);
        setStatusError(null);
        setShowAddPanel(false);
        setOrderSearch('');
        setOrderPage(1);
    }, []);

    useEffect(() => {
        if (!isOpen || billId === null) return;
        let cancelled = false;
        fetchBillData(billId)
            .then((b) => { if (!cancelled) { setBill(b); setError(null); } })
            .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur inattendue'); });
        return () => { cancelled = true; };
    }, [isOpen, billId]);

    // Reset on close in an event handler (not an effect) to avoid synchronous setState in effects.
    const handleDialogOpenChange = (open: boolean) => {
        if (!open) resetLocalState();
        onOpenChange(open);
    };

    // ── Load unbilled orders (debounced) ───────────────────────────────────────

    const loadUnbilledOrders = useCallback(async (search: string, page: number, clientId: number) => {
        setIsLoadingOrders(true);
        try {
            const params = new URLSearchParams({
                unbilled: 'true',
                aveugleId: String(clientId),
                page: String(page),
                ...(search ? { search } : {}),
            });
            const res = await fetch(`/api/orders?${params}`);
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.message || 'Erreur');
            setUnbilledOrders(data.orders ?? []);
            setOrderTotalPages(data.totalPages ?? 1);
        } catch {
            setUnbilledOrders([]);
        } finally {
            setIsLoadingOrders(false);
        }
    }, []);

    useEffect(() => {
        if (!showAddPanel || !bill) return;
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => {
            loadUnbilledOrders(orderSearch, orderPage, bill.client.id);
        }, 350);
        return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
    }, [showAddPanel, orderSearch, orderPage, bill, loadUnbilledOrders]);

    // ── Handlers ───────────────────────────────────────────────────────────────

    const handleStatusUpdate = async () => {
        if (!billId || !pendingState) return;
        setStatusError(null);
        setIsUpdatingStatus(true);
        try {
            const res = await fetch(`/api/bills/${billId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                // Le règlement n'est plus dans ce corps de requête : « payée » se
                // déduit des paiements rattachés (syncBillPaymentInfo), qui portent
                // la référence, la méthode et la date.
                body: JSON.stringify({ action: 'updateStatus', state: pendingState }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.message || 'Erreur lors de la mise à jour du statut');
            setPendingState(null);
            await loadBill(billId);
            onBillUpdated?.();
        } catch (err) {
            setStatusError(err instanceof Error ? err.message : 'Erreur inattendue');
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    const handleAddOrder = async (orderId: number) => {
        if (!billId) return;
        setAddingOrderId(orderId);
        try {
            const res = await fetch(`/api/bills/${billId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'addOrder', orderId }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.message || 'Erreur');
            await loadBill(billId);
            if (bill) loadUnbilledOrders(orderSearch, orderPage, bill.client.id);
            onBillUpdated?.();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Erreur inattendue');
        } finally {
            setAddingOrderId(null);
        }
    };

    const handleRemoveOrder = async (orderId: number) => {
        if (!billId) return;
        setRemovingOrderId(orderId);
        try {
            const res = await fetch(`/api/bills/${billId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'removeOrder', orderId }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.message || 'Erreur');
            await loadBill(billId);
            if (bill) loadUnbilledOrders(orderSearch, orderPage, bill.client.id);
            onBillUpdated?.();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Erreur inattendue');
        } finally {
            setRemovingOrderId(null);
        }
    };

    const handleReopen = async () => {
        if (!billId) return;
        const hasPayments = (bill?.payments.length ?? 0) > 0;
        if (!window.confirm(
            hasPayments
                ? "Rouvrir cette facture la repassera à « émise » et détachera ses paiements (ils restent dans « Paiements », et leur numéro part à l'historique). Continuer ?"
                : "Rouvrir cette facture la repassera à « émise » : elle redeviendra une créance à réclamer. Continuer ?"
        )) return;
        setIsReopening(true);
        try {
            const res = await fetch(`/api/bills/${billId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reopenBill' }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.message || 'Erreur lors de la réouverture');
            await loadBill(billId);
            onBillUpdated?.();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Erreur inattendue');
        } finally {
            setIsReopening(false);
        }
    };

    // Derived loading state — true while the modal is open for a bill we haven't
    // fetched yet. Avoids a setState-in-effect just to toggle a spinner.
    const isLoading = isOpen && billId !== null && bill === null && error === null;

    const isDraft = bill?.state === BillingStatus.DRAFT;

    /**
     * Une facture réglée AVANT la reprise : encaissée, mais sans paiement en face.
     *
     * Un paiement rattaché vaut encaissement — c'est la règle depuis que les
     * colonnes de règlement de la facture sont dérivées de ses paiements. Les
     * factures d'avant portaient leur référence à la main et n'ont jamais eu de
     * ligne dans « Paiements » : l'import Access n'en a rattaché aucune. Leur
     * appliquer l'arithmétique normale les affichait « Encaissé 0,00 € sur
     * 30,00 € — Reste à payer 30,00 € », en ambre, sur des milliers de factures
     * payées depuis des années. Le calcul était juste et la lecture fausse : il
     * n'y a rien à réclamer, seulement rien à montrer.
     *
     * PAID seulement, désormais : les soldées sans paiement ne sont pas des
     * factures dont le règlement manque à l'appel, ce sont des créances
     * abandonnées, et `writtenOff` les décrit pour ce qu'elles sont.
     */
    const settledWithoutPayments =
        bill?.state === BillingStatus.PAID && bill.payments.length === 0;

    /**
     * Créance abandonnée : le compte est clos, le reste ne sera pas réclamé.
     *
     * L'écart entre l'encaissé et le total change de sens sous cet état. Sur une
     * facture ouverte c'est une dette — « Reste à payer », en ambre. Sur une
     * soldée c'est le contraire : de l'argent qu'on a décidé de ne pas
     * poursuivre. Réclamer en ambre ce qu'on vient formellement d'abandonner
     * serait le seul vrai contresens que cet encadré puisse commettre.
     */
    const writtenOff = bill?.state === BillingStatus.SOLDE;
    const outstanding = bill ? parseFloat(bill.outstanding) : 0;
    const nextStates = bill ? (NEXT_STATES[bill.state] ?? []) : [];

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto bg-card border-border [&>button>svg]:text-white">
                <DialogHeader>
                    <div className="flex items-center justify-between gap-3 pr-8">
                        <DialogTitle className="text-foreground flex flex-wrap items-center gap-2">
                            Facture
                            {billId && <CopyableId id={billId} label="de la facture" />}
                        </DialogTitle>
                        {bill && !isLoading && (
                            <BillPDFButton
                                bill={bill}
                                onBillUpdated={async () => {
                                    if (billId !== null) await loadBill(billId);
                                    onBillUpdated?.();
                                }}
                            />
                        )}
                    </div>
                </DialogHeader>

                {isLoading && (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground py-10">
                        <Loader2 className="h-5 w-5 animate-spin" /> Chargement...
                    </div>
                )}

                {error && !isLoading && (
                    <div className="px-3 py-4 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-200">
                        {error}
                    </div>
                )}

                {bill && !isLoading && (
                    <div className="space-y-5">
                        {/* L'identité de la facture — qui, quel état, quelles dates.

                            Groupée, et non posée dans la pile comme deux sections de plus :
                            ces trois choses se lisent d'un bloc, et le corps de la modale ne
                            commence qu'aux paiements. D'où un intérieur plus serré (16 px) et
                            une respiration plus large en sortie : « Enregistrer un paiement »
                            est un bouton bordé dont l'arête tombait à 20 px sous la date, là
                            où les autres sections s'ouvrent sur un intitulé dont l'encre est
                            en retrait. Même écart au pixel, moins d'air à l'œil. */}
                        <div className="space-y-4 pb-2">
                            {/* Summary */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="min-w-0">
                                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Auditeur</div>
                                    <a
                                        href={`/admin/users/auditeurs?user=${bill.client.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Ouvrir la fiche de l'auditeur dans un nouvel onglet"
                                        className="text-foreground font-medium break-words hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-flex items-center gap-1"
                                    >
                                        {getUserNameOnly(bill.client) || 'N/A'}
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                    </a>
                                    <div className="text-muted-foreground text-sm break-words">{bill.client.email}</div>
                                    {bill.client.address && bill.client.address.filter(Boolean).length > 0 && (
                                        <div className="text-muted-foreground text-sm mt-1 leading-snug break-words">
                                            {bill.client.address.filter(Boolean).map((line, i) => (
                                                <div key={i}>{line}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="min-w-0 text-right">
                                    <div className="text-xs text-muted-foreground uppercase tracking-wide">État actuel</div>
                                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getBillingStatusColor(bill.state)}`}>
                                        {getBillingStatusLabel(bill.state)}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Création</div>
                                    <div className="text-foreground">{formatDate(bill.creationDate)}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Émission</div>
                                    <div className="text-foreground">{formatDate(bill.issueDate)}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Paiement</div>
                                    <div className="text-foreground">{formatDate(bill.paymentDate)}</div>
                                </div>
                            </div>
                        </div>

                        {/* Paiements — la source du règlement, pas un champ de saisie.
                            La référence, la méthode et la date vivent sur le paiement ;
                            la facture les reflète (syncBillPaymentInfo). Le crayon qui
                            permettait de corriger la référence ici a disparu : il aurait
                            réécrit une colonne dérivée, et fait diverger la facture du
                            règlement qu'elle décrit. */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                                    Paiements ({bill.payments.length})
                                </div>
                                {/* UNE action, et elle est ici.
                                    À côté vivait « Voir dans les paiements », qui pointait
                                    /admin/payments?search=<id de la facture>. La recherche
                                    des paiements fait feu de tout token : elle rend aussi le
                                    paiement dont l'ID vaut ce nombre, et toute référence qui
                                    le contient. Sur la facture #2787, elle ouvrait quatre
                                    lignes dont une cotisation d'un autre auditeur, sous un
                                    total de 92 € qui ne décrivait rien. Rien à réparer : la
                                    liste ci-dessous montre déjà les paiements de CETTE
                                    facture, chacun ouvrant le sien.

                                    Absente d'un brouillon : il n'a pas été envoyé, il n'a
                                    rien à encaisser, et les routes de paiement refusent de
                                    s'y rattacher (voir POST /api/payments). */}
                                {!isDraft && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setIsAddingPayment(true)}
                                        className="h-7 px-2.5 gap-1.5 text-xs [&_svg]:size-3.5"
                                    >
                                        <Plus />
                                        Enregistrer un paiement
                                    </Button>
                                )}
                            </div>

                            {/* Le compte et ses pièces, dans un seul encadré.

                                « Encaissé X sur Y » traînait sous la liste, en petit, après
                                l'encadré : la seule ligne qui répond à « cette facture
                                est-elle payée ? » arrivait après les pièces justificatives.
                                Elle passe en tête, sur fond appuyé, et les paiements se
                                lisent comme ce qu'ils sont — le détail de ce chiffre. */}
                            <div className="border border-border rounded-md overflow-hidden">
                                {/* Ce qui est encaissé — CONSTATÉ, pas jugé.

                                    Un paiement rattaché vaut règlement : c'est le rattachement
                                    qui dit qu'une facture est réglée, pas l'arithmétique. La
                                    comparaison des montants alertait en ambre dès que la somme
                                    des paiements ne tombait pas juste sur le total, et
                                    réclamait donc de l'argent sur des factures que quelqu'un
                                    avait déjà encaissées — un écart de saisie lu comme une
                                    créance. Les deux chiffres restent affichés, en gris : qui
                                    les regarde voit l'écart, personne n'est alerté d'une dette
                                    qui n'existe pas.

                                    L'ambre ne subsiste que là où il dit vrai — une facture à
                                    laquelle AUCUN paiement n'est rattaché, et qui n'a pas été
                                    réglée avant la reprise.

                                    Sous « soldée », l'écart n'est plus une dette du tout : il
                                    est ce qu'on renonce à percevoir. Il se dit « Abandonné »,
                                    dans le violet du statut, et non en ambre — on ne réclame
                                    pas ce qu'on vient d'abandonner. C'est aussi le chiffre que
                                    l'événement SETTLED inscrit au journal. */}
                                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2.5 bg-muted/60">
                                    {settledWithoutPayments ? (
                                        <>
                                            <span className="text-sm text-muted-foreground">
                                                Réglée avant la reprise — pas de paiement en face.
                                            </span>
                                            {(bill.paymentReference || bill.paymentDate) && (
                                                <span className="text-xs text-muted-foreground">
                                                    {bill.paymentReference && (
                                                        <span className="font-mono">{bill.paymentReference}</span>
                                                    )}
                                                    {bill.paymentReference && bill.paymentDate ? ' · ' : ''}
                                                    {bill.paymentDate && formatDate(bill.paymentDate)}
                                                </span>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-sm text-muted-foreground">
                                                Encaissé{' '}
                                                <span className="text-base font-semibold text-foreground">
                                                    {formatCurrency(bill.paidTotal)}
                                                </span>
                                                {' '}sur {formatCurrency(bill.invoiceAmount)}
                                            </span>
                                            {writtenOff
                                                ? outstanding > 0 && (
                                                      <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                                                          Abandonné {formatCurrency(bill.outstanding)}
                                                      </span>
                                                  )
                                                : bill.payments.length === 0 && outstanding > 0 && (
                                                      <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                                                          Reste à payer {formatCurrency(bill.outstanding)}
                                                      </span>
                                                  )}
                                        </>
                                    )}
                                </div>

                                {/* Rien sous le bandeau quand il a déjà tout dit : sur une
                                    facture réglée avant la reprise, « aucun paiement
                                    rattaché » répétait mot pour mot la ligne au-dessus. */}
                                {!settledWithoutPayments && (
                                <div className="border-t border-border divide-y divide-border">
                                    {bill.payments.length === 0 ? (
                                        <div className="px-3 py-3 text-muted-foreground text-sm italic">
                                            {/* Sur une soldée, inviter à saisir un règlement
                                                irait contre le geste qu'on vient de poser. */}
                                            {writtenOff
                                                ? 'Aucun paiement rattaché — la créance a été abandonnée.'
                                                : isDraft
                                                    ? "Aucun paiement rattaché — un brouillon n'a pas encore été envoyé. Le règlement s'enregistre une fois la facture émise."
                                                    : 'Aucun paiement rattaché — « Enregistrer un paiement » en saisit un pour cette facture.'}
                                        </div>
                                    ) : (
                                        // La ligne ENTIÈRE ouvre le paiement : la flèche seule
                                        // était une cible de 14 px au bout d'une ligne dont
                                        // rien ne disait qu'elle menait quelque part.
                                        bill.payments.map((p) => (
                                            <a
                                                key={p.id}
                                                href={`/admin/payments?payment=${p.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title="Ouvrir le paiement dans un nouvel onglet"
                                                className="group flex items-start gap-3 px-3 py-2.5 hover:bg-muted/60 transition-colors"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    {/* Le montant d'abord : c'est ce qu'on cherche
                                                        en parcourant la liste, pas le numéro. */}
                                                    <div className="text-foreground text-sm font-medium break-words">
                                                        {formatCurrency(p.amount)}
                                                        {p.paymentMethod && (
                                                            <span className="text-muted-foreground font-normal">
                                                                {' '}· {getPaymentMethodLabel(p.paymentMethod as PaymentMethod)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-muted-foreground text-xs break-words">
                                                        {formatDate(p.paymentDate ?? p.creationDate)}
                                                        {p.paymentReference && (
                                                            <>
                                                                {' · '}
                                                                <span className="font-mono">{p.paymentReference}</span>
                                                            </>
                                                        )}
                                                        {' · '}
                                                        <span className="font-mono">#{p.id}</span>
                                                    </div>
                                                </div>
                                                <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                                            </a>
                                        ))
                                    )}
                                </div>
                                )}
                            </div>
                        </div>

                        {/* Status change

                            Un cadre par section, et la modale n'était plus qu'une pile de
                            rectangles de même poids : paiements, statut, facture finalisée,
                            demandes. Souligner tout revient à ne rien souligner. Les cadres
                            gardent UN sens — « voici une liste d'enregistrements », pour les
                            paiements et les demandes — et le fond teinté un autre — « fais
                            attention », réservé au bandeau ambre de la facture finalisée.
                            Ici, un intitulé et des boutons : ils se portent tout seuls,
                            comme les dates au-dessus. */}
                        {nextStates.length > 0 && (
                            <div className="space-y-3">
                                <div className="text-xs text-muted-foreground uppercase tracking-wide">Changer le statut</div>
                                <div className="flex flex-wrap gap-2">
                                    {nextStates.map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => {
                                                setPendingState(pendingState === s ? null : s);
                                                setStatusError(null);
                                            }}
                                            // `hover:bg-muted` sur un bouton déjà `bg-muted` ne
                                            // faisait rien : le survol ne répondait pas.
                                            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                                                pendingState === s
                                                    ? 'bg-indigo-600 border-indigo-500 text-white'
                                                    : 'bg-muted border-border text-foreground hover:bg-accent hover:text-accent-foreground'
                                            }`}
                                        >
                                            {STATE_ACTION_LABEL[s]}
                                        </button>
                                    ))}
                                </div>

                                {/* « Payée » ne demande plus rien à remplir : elle
                                    constate les paiements rattachés. Sans paiement, la
                                    route refuse — autant le dire ici plutôt que sur un
                                    400 après le clic. Et le renvoi vers « Paiements » n'a
                                    plus lieu d'être : le bouton qui fait la chose est juste
                                    au-dessus, prérempli du client, de la facture et du reste
                                    à payer. */}
                                {pendingState === BillingStatus.PAID && bill.payments.length === 0 && (
                                    <p className="text-sm text-amber-700 dark:text-amber-300">
                                        Cette facture ne porte aucun paiement. Enregistrez d&apos;abord le
                                        règlement ci-dessus — c&apos;est lui qui porte la référence, la
                                        méthode et la date.
                                    </p>
                                )}

                                {pendingState === BillingStatus.PAID && bill.payments.length > 0 && (
                                    <p className="text-sm text-muted-foreground">
                                        La facture reprendra la référence et la date de{' '}
                                        {bill.payments.length > 1
                                            ? `ses ${bill.payments.length} paiements`
                                            : `son paiement #${bill.payments[0].id}`}.
                                    </p>
                                )}

                                {/* Solder, c'est renoncer — autant chiffrer le renoncement
                                    avant le clic, pas après. Le cas « rien à abandonner »
                                    existe pour de bon : des paiements peuvent couvrir la
                                    facture sans que personne n'ait cliqué « payée », et
                                    solder là serait la clore en la disant impayée. */}
                                {pendingState === BillingStatus.SOLDE && (
                                    <p className="text-sm text-muted-foreground">
                                        {outstanding > 0 ? (
                                            <>
                                                La facture sera close sans réclamer le reste :{' '}
                                                <span className="font-medium text-purple-700 dark:text-purple-300">
                                                    {formatCurrency(bill.outstanding)}
                                                </span>{' '}
                                                seront abandonnés.
                                                {/* Le possessif s'accorde AVEC le nombre : il doit
                                                    donc vivre dans la branche, pas devant. */}
                                                {bill.payments.length > 0 &&
                                                    ` ${bill.payments.length > 1 ? `Ses ${bill.payments.length} paiements restent rattachés` : 'Son paiement reste rattaché'}.`}
                                            </>
                                        ) : (
                                            <>
                                                Les paiements rattachés couvrent déjà cette facture — il n&apos;y a
                                                rien à abandonner. « Marquer comme payée » la clôt plus justement.
                                            </>
                                        )}
                                    </p>
                                )}

                                {/* Le miroir du refus de la route : un brouillon n'a rien
                                    encaissé. Dit avant le clic, avec l'issue. */}
                                {pendingState === BillingStatus.DRAFT && bill.payments.length > 0 && (
                                    <p className="text-sm text-amber-700 dark:text-amber-300">
                                        Cette facture porte déjà{' '}
                                        {bill.payments.length > 1
                                            ? `${bill.payments.length} paiements`
                                            : `le paiement #${bill.payments[0].id}`}{' '}
                                        : un brouillon n&apos;a rien encaissé. Rattachez ce règlement à une autre
                                        facture de l&apos;auditeur, ou supprimez-le, avant de la remettre en brouillon.
                                    </p>
                                )}

                                {statusError && (
                                    <div className="text-red-700 dark:text-red-300 text-sm">{statusError}</div>
                                )}

                                {pendingState && (
                                    <Button
                                        onClick={handleStatusUpdate}
                                        disabled={
                                            isUpdatingStatus ||
                                            (pendingState === BillingStatus.PAID && bill.payments.length === 0) ||
                                            (pendingState === BillingStatus.DRAFT && bill.payments.length > 0)
                                        }
                                        className="bg-indigo-600 hover:bg-indigo-500 text-white h-8 text-sm"
                                    >
                                        {isUpdatingStatus && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                                        Confirmer
                                    </Button>
                                )}
                            </div>
                        )}

                        {/* Reopen (finalized bills) */}
                        {(bill.state === BillingStatus.PAID || bill.state === BillingStatus.SOLDE) && (
                            <div className="space-y-2 p-3 bg-amber-50 border border-amber-200 dark:bg-amber-900/15 dark:border-amber-800/50 rounded-md">
                                <div className="text-xs text-amber-700 dark:text-amber-300/90 uppercase tracking-wide">Facture finalisée</div>
                                {/* Une soldée sans paiement n'a rien à détacher : lui
                                    promettre le contraire ferait douter du geste. */}
                                <p className="text-sm text-foreground">
                                    Pour corriger le coût d&apos;une demande de cette facture, rouvrez-la d&apos;abord.
                                    Elle repassera à « émise »
                                    {bill.payments.length > 0 ? (
                                        <>
                                            {' '}et ses paiements en seront détachés — ils restent dans « Paiements »,
                                            et leur numéro part à l&apos;historique.
                                        </>
                                    ) : writtenOff ? (
                                        <> et redeviendra une créance à réclamer.</>
                                    ) : (
                                        <>.</>
                                    )}
                                </p>
                                <Button
                                    onClick={handleReopen}
                                    disabled={isReopening}
                                    className="bg-amber-600 hover:bg-amber-700 text-white h-8 text-sm flex items-center gap-1.5"
                                >
                                    {isReopening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                    Rouvrir la facture
                                </Button>
                            </div>
                        )}

                        {/* Orders */}
                        <div className="space-y-2">
                            <div className="text-xs text-muted-foreground uppercase tracking-wide">
                                Demandes facturées ({bill.orders.length})
                            </div>
                            <div className="border border-border rounded-md divide-y divide-border max-h-[240px] overflow-y-auto">
                                {bill.orders.length === 0 ? (
                                    <div className="px-3 py-4 text-muted-foreground text-sm italic">Aucune demande rattachée</div>
                                ) : (
                                    bill.orders.map((o) => (
                                        <div key={o.id} className="flex items-start gap-3 px-3 py-2.5">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-foreground text-sm font-medium break-words">
                                                    #{o.id} — {o.catalogue.title}
                                                </div>
                                                {/* La date de clôture, comme sur la facture imprimée
                                                    (colonne « Livraison ») : deux dates différentes pour
                                                    la même ligne, à l'écran et sur le papier, ne peuvent
                                                    que faire douter de celle qui est partie chez
                                                    l'auditeur. Le sélecteur ci-dessous garde la date de
                                                    réception : une demande non facturée n'a pas
                                                    forcément de date de clôture. */}
                                                <div className="text-muted-foreground text-xs break-words">
                                                    {o.catalogue.author} · {formatDate(o.closureDate)}
                                                </div>
                                            </div>
                                            <span className="shrink-0 text-foreground text-sm font-medium whitespace-nowrap">
                                                {o.cost != null ? formatCurrency(o.cost) : '-'}
                                            </span>
                                            <a
                                                href={`/admin/orders?order=${o.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title="Ouvrir la demande dans un nouvel onglet"
                                                className="shrink-0 ml-1 p-1 rounded text-muted-foreground hover:text-blue-600 hover:bg-blue-100 dark:hover:text-blue-400 dark:hover:bg-blue-900/20 transition-colors"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </a>
                                            {isDraft && (
                                                <button
                                                    onClick={() => handleRemoveOrder(o.id)}
                                                    disabled={removingOrderId === o.id}
                                                    className="shrink-0 ml-1 p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-100 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                                                    title="Retirer de la facture"
                                                >
                                                    {removingOrderId === o.id
                                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        : <X className="h-3.5 w-3.5" />
                                                    }
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Add order panel (draft only) */}
                            {isDraft && (
                                <div>
                                    <button
                                        onClick={() => {
                                            setShowAddPanel((v) => !v);
                                            setOrderSearch('');
                                            setOrderPage(1);
                                        }}
                                        className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors mt-1"
                                    >
                                        {/* Un « + » devant « Masquer » promettait le contraire
                                            de ce que le clic allait faire. */}
                                        {showAddPanel ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                        {showAddPanel ? 'Masquer' : 'Ajouter une demande'}
                                    </button>

                                    {showAddPanel && (
                                        <div className="mt-2 space-y-2 border border-border rounded-md p-3">
                                            <Input
                                                value={orderSearch}
                                                onChange={(e) => { setOrderSearch(e.target.value); setOrderPage(1); }}
                                                placeholder="Rechercher par titre, auteur…"
                                                className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-sm"
                                            />

                                            {isLoadingOrders ? (
                                                <div className="flex items-center justify-center py-4 text-muted-foreground gap-2">
                                                    <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
                                                </div>
                                            ) : unbilledOrders.length === 0 ? (
                                                <div className="text-muted-foreground text-sm italic py-2">Aucune demande disponible</div>
                                            ) : (
                                                <div className="divide-y divide-border max-h-[200px] overflow-y-auto">
                                                    {unbilledOrders.map((o) => (
                                                        <div key={o.id} className="flex items-start gap-3 py-2">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-foreground text-sm break-words">
                                                                    #{o.id} — {o.catalogue.title}
                                                                </div>
                                                                <div className="text-muted-foreground text-xs break-words">
                                                                    {o.catalogue.author} · {formatDate(o.requestReceivedDate)}
                                                                    {o.cost != null && ` · ${formatCurrency(o.cost)}`}
                                                                </div>
                                                            </div>
                                                            <a
                                                                href={`/admin/orders?order=${o.id}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                title="Ouvrir la demande dans un nouvel onglet"
                                                                className="shrink-0 p-1 rounded text-muted-foreground hover:text-blue-600 hover:bg-blue-100 dark:hover:text-blue-400 dark:hover:bg-blue-900/20 transition-colors"
                                                            >
                                                                <ExternalLink className="h-3.5 w-3.5" />
                                                            </a>
                                                            <button
                                                                onClick={() => handleAddOrder(o.id)}
                                                                disabled={addingOrderId === o.id}
                                                                className="shrink-0 px-2 py-1 rounded text-xs bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 flex items-center gap-1"
                                                            >
                                                                {addingOrderId === o.id
                                                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                                                    : <Plus className="h-3 w-3" />
                                                                }
                                                                Ajouter
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {orderTotalPages > 1 && (
                                                <div className="flex items-center justify-between pt-1">
                                                    <button
                                                        onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
                                                        disabled={orderPage === 1}
                                                        className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                                                    >
                                                        <ChevronLeft className="h-4 w-4" />
                                                    </button>
                                                    <span className="text-xs text-muted-foreground">{orderPage} / {orderTotalPages}</span>
                                                    <button
                                                        onClick={() => setOrderPage((p) => Math.min(orderTotalPages, p + 1))}
                                                        disabled={orderPage === orderTotalPages}
                                                        className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                                                    >
                                                        <ChevronRight className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Total */}
                        <div className="flex items-center justify-between pt-3 border-t border-border">
                            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Montant total</span>
                            <span className="text-xl font-bold text-foreground">{formatCurrency(bill.invoiceAmount)}</span>
                        </div>

                        {/* History */}
                        <div className="space-y-2 pt-3 border-t border-border">
                            <button
                                onClick={() => setShowHistory((v) => !v)}
                                className="flex items-center gap-1.5 text-sm text-foreground hover:text-foreground transition-colors"
                            >
                                <History className="h-4 w-4" />
                                {showHistory ? "Masquer l'historique" : "Historique de la facture"}
                                {bill.events?.length ? ` (${bill.events.length})` : ''}
                            </button>
                            {showHistory && (
                                <div className="border border-border rounded-md p-3 max-h-[260px] overflow-y-auto">
                                    <BillHistory events={bill.events ?? []} />
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end pt-2">
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={() => { if (billId !== null && onRequestDelete) onRequestDelete(billId); }}
                                className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
                            >
                                <Trash2 className="h-4 w-4" />
                                Supprimer la facture
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>

            {/* Saisie d'un paiement pour CETTE facture, préremplie du client, de la
                facture et du reste à payer. Le montant reste corrigeable : un
                acompte est un paiement comme un autre. */}
            {bill && (
                <Dialog open={isAddingPayment} onOpenChange={setIsAddingPayment}>
                    <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto bg-card border-border">
                        <DialogHeader>
                            <DialogTitle className="text-foreground">
                                Enregistrer un paiement — facture #{bill.id}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="overflow-y-auto px-1">
                            <AddPaymentFormBackend
                                preset={{
                                    client: {
                                        id: bill.client.id,
                                        name: bill.client.name,
                                        firstName: bill.client.firstName ?? null,
                                        lastName: bill.client.lastName ?? null,
                                        email: bill.client.email,
                                    },
                                    bill: {
                                        id: bill.id,
                                        state: bill.state,
                                        creationDate: bill.creationDate,
                                        invoiceAmount: bill.invoiceAmount,
                                    },
                                    amount: parseFloat(bill.outstanding) > 0 ? bill.outstanding : null,
                                }}
                                onSuccess={() => {
                                    setIsAddingPayment(false);
                                    if (billId !== null) loadBill(billId);
                                    onBillUpdated?.();
                                }}
                            />
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </Dialog>
    );
}