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
import { Loader2, Trash2, X, Plus, ChevronLeft, ChevronRight, Pencil, Check, RotateCcw, History, ExternalLink } from 'lucide-react';
import {
    BillingStatus,
    getBillingStatusColor,
    getBillingStatusLabel,
} from '@/lib/billing-enums';
import { BillPDFButton } from './BillPDFButton';
import { BillHistory, BillEventDTO } from './BillHistory';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BillOrder {
    id: number;
    requestReceivedDate: string;
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
    events: BillEventDTO[];
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

const NEXT_STATES: Record<BillingStatus, BillingStatus[]> = {
    [BillingStatus.DRAFT]: [BillingStatus.BILLED],
    [BillingStatus.BILLED]: [BillingStatus.DRAFT, BillingStatus.PAID],
    [BillingStatus.PAID]: [BillingStatus.SOLDE],
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
    return new Date(dateString).toLocaleDateString('fr-FR');
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
    const [paymentReference, setPaymentReference] = useState('');
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [statusError, setStatusError] = useState<string | null>(null);

    // Payment reference inline edit
    const [isEditingPayRef, setIsEditingPayRef] = useState(false);
    const [payRefDraft, setPayRefDraft] = useState('');
    const [isSavingPayRef, setIsSavingPayRef] = useState(false);

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
        setPaymentReference('');
        setStatusError(null);
        setShowAddPanel(false);
        setOrderSearch('');
        setOrderPage(1);
        setIsEditingPayRef(false);
        setPayRefDraft('');
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
                body: JSON.stringify({
                    action: 'updateStatus',
                    state: pendingState,
                    ...(pendingState === BillingStatus.PAID ? { paymentReference } : {}),
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.message || 'Erreur lors de la mise à jour du statut');
            setPendingState(null);
            setPaymentReference('');
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

    const handleSavePayRef = async () => {
        if (!billId) return;
        setIsSavingPayRef(true);
        try {
            const res = await fetch(`/api/bills/${billId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'updatePaymentReference', paymentReference: payRefDraft }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.message || 'Erreur');
            setIsEditingPayRef(false);
            await loadBill(billId);
            onBillUpdated?.();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Erreur inattendue');
        } finally {
            setIsSavingPayRef(false);
        }
    };

    const handleReopen = async () => {
        if (!billId) return;
        if (!window.confirm("Rouvrir cette facture la repassera à « émise » et effacera ses informations de paiement (archivées dans l'historique). Continuer ?")) return;
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
    const nextStates = bill ? (NEXT_STATES[bill.state] ?? []) : [];

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border [&>button>svg]:text-white">
                <DialogHeader>
                    <div className="flex items-center justify-between gap-3 pr-8">
                        <DialogTitle className="text-foreground">
                            Facture {billId ? `#${billId}` : ''}
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
                    <div className="px-3 py-4 bg-red-900/20 border border-red-800 rounded-md text-red-200 text-sm">
                        {error}
                    </div>
                )}

                {bill && !isLoading && (
                    <div className="space-y-5">
                        {/* Summary */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-xs text-muted-foreground uppercase tracking-wide">Auditeur</div>
                                <div className="text-foreground font-medium">{bill.client.name || 'N/A'}</div>
                                <div className="text-muted-foreground text-sm">{bill.client.email}</div>
                                {bill.client.address && bill.client.address.filter(Boolean).length > 0 && (
                                    <div className="text-muted-foreground text-sm mt-1 leading-snug">
                                        {bill.client.address.filter(Boolean).map((line, i) => (
                                            <div key={i}>{line}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="text-right">
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

                        {/* Payment reference */}
                        <div className="text-sm">
                            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Réf. paiement</div>
                            {isEditingPayRef ? (
                                <div className="flex items-center gap-2">
                                    <Input
                                        value={payRefDraft}
                                        onChange={(e) => setPayRefDraft(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSavePayRef(); if (e.key === 'Escape') setIsEditingPayRef(false); }}
                                        placeholder="Ex: PAY-20240601-001"
                                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-sm"
                                        autoFocus
                                    />
                                    <button
                                        onClick={handleSavePayRef}
                                        disabled={isSavingPayRef}
                                        className="p-1.5 rounded text-green-400 hover:bg-green-900/20 disabled:opacity-50"
                                        title="Enregistrer"
                                    >
                                        {isSavingPayRef ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                    </button>
                                    <button
                                        onClick={() => setIsEditingPayRef(false)}
                                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                                        title="Annuler"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className={bill.paymentReference ? 'text-foreground font-mono text-sm' : 'text-muted-foreground italic text-sm'}>
                                        {bill.paymentReference || 'Non renseignée'}
                                    </span>
                                    <button
                                        onClick={() => { setPayRefDraft(bill.paymentReference || ''); setIsEditingPayRef(true); }}
                                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                        title="Modifier"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Status change */}
                        {nextStates.length > 0 && (
                            <div className="space-y-3 p-3 bg-card/50 border border-border rounded-md">
                                <div className="text-xs text-muted-foreground uppercase tracking-wide">Changer le statut</div>
                                <div className="flex flex-wrap gap-2">
                                    {nextStates.map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => {
                                                setPendingState(pendingState === s ? null : s);
                                                setPaymentReference('');
                                                setStatusError(null);
                                            }}
                                            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                                                pendingState === s
                                                    ? 'bg-indigo-600 border-indigo-500 text-white'
                                                    : 'bg-muted border-border text-foreground hover:bg-muted'
                                            }`}
                                        >
                                            {STATE_ACTION_LABEL[s]}
                                        </button>
                                    ))}
                                </div>

                                {pendingState === BillingStatus.PAID && (
                                    <div className="space-y-1">
                                        <label className="text-xs text-muted-foreground">Identifiant de paiement (système externe)</label>
                                        <Input
                                            value={paymentReference}
                                            onChange={(e) => setPaymentReference(e.target.value)}
                                            placeholder="Ex: PAY-20240601-001"
                                            className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                                        />
                                    </div>
                                )}

                                {statusError && (
                                    <div className="text-red-300 text-sm">{statusError}</div>
                                )}

                                {pendingState && (
                                    <Button
                                        onClick={handleStatusUpdate}
                                        disabled={isUpdatingStatus || (pendingState === BillingStatus.PAID && !paymentReference.trim())}
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
                            <div className="space-y-2 p-3 bg-amber-900/15 border border-amber-800/50 rounded-md">
                                <div className="text-xs text-amber-300/90 uppercase tracking-wide">Facture finalisée</div>
                                <p className="text-sm text-foreground">
                                    Pour corriger le coût d&apos;une demande de cette facture, rouvrez-la d&apos;abord. Elle repassera
                                    à « émise » et ses informations de paiement seront archivées dans l&apos;historique.
                                </p>
                                <Button
                                    onClick={handleReopen}
                                    disabled={isReopening}
                                    className="bg-amber-700 hover:bg-amber-600 text-foreground h-8 text-sm flex items-center gap-1.5"
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
                                        <div key={o.id} className="flex items-center gap-3 px-3 py-2.5">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-foreground text-sm font-medium truncate">
                                                    #{o.id} — {o.catalogue.title}
                                                </div>
                                                <div className="text-muted-foreground text-xs truncate">
                                                    {o.catalogue.author} · {formatDate(o.requestReceivedDate)}
                                                </div>
                                            </div>
                                            <span className="text-foreground text-sm font-medium whitespace-nowrap">
                                                {o.cost != null ? formatCurrency(o.cost) : '-'}
                                            </span>
                                            <a
                                                href={`/admin/orders?order=${o.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title="Ouvrir la demande dans un nouvel onglet"
                                                className="ml-1 p-1 rounded text-muted-foreground hover:text-blue-400 hover:bg-blue-900/20 transition-colors"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </a>
                                            {isDraft && (
                                                <button
                                                    onClick={() => handleRemoveOrder(o.id)}
                                                    disabled={removingOrderId === o.id}
                                                    className="ml-1 p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-50"
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
                                        className="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors mt-1"
                                    >
                                        <Plus className="h-4 w-4" />
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
                                                        <div key={o.id} className="flex items-center gap-3 py-2">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-foreground text-sm truncate">
                                                                    #{o.id} — {o.catalogue.title}
                                                                </div>
                                                                <div className="text-muted-foreground text-xs truncate">
                                                                    {o.catalogue.author} · {formatDate(o.requestReceivedDate)}
                                                                    {o.cost != null && ` · ${formatCurrency(o.cost)}`}
                                                                </div>
                                                            </div>
                                                            <a
                                                                href={`/admin/orders?order=${o.id}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                title="Ouvrir la demande dans un nouvel onglet"
                                                                className="shrink-0 p-1 rounded text-muted-foreground hover:text-blue-400 hover:bg-blue-900/20 transition-colors"
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
                                className="bg-red-700 hover:bg-red-600 text-foreground flex items-center gap-2"
                            >
                                <Trash2 className="h-4 w-4" />
                                Supprimer la facture
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}