'use client';

import React, { useState } from 'react';
import { Printer, Loader2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BillingStatus } from '@/lib/billing-enums';
import { printPdfBlob } from '@/lib/print-pdf';
import type { BillPDFData } from './BillPDF';

interface BillPDFButtonProps {
    /**
     * Print this facture. Pass it where the caller already has the full bill on
     * screen — the modal does.
     */
    bill?: BillPDFData | null;
    /**
     * Otherwise: load the facture on click. The list screen only carries table
     * rows, so this is the path the inline printer icon takes.
     */
    billId?: number;
    /** `icon` is the compact form for table rows. */
    variant?: 'button' | 'icon';
    /** Called after the bill is issued (DRAFT → BILLED) so the parent can refresh. */
    onBillUpdated?: () => void;
    className?: string;
}

const FULL_TEXT = 'Imprimer la facture';

/** Only used by the download fallback in printPdfBlob — see lib/print-pdf.ts. */
const fileNameFor = (id: number, draft: boolean) =>
    `facture-${id}${draft ? '-BROUILLON' : ''}.pdf`;

export const BillPDFButton: React.FC<BillPDFButtonProps> = ({
    bill,
    billId,
    variant = 'button',
    onBillUpdated,
    className = '',
}) => {
    const [isPrinting, setIsPrinting] = useState(false);
    const [isIssuing, setIsIssuing] = useState(false);
    // The facture the draft dialog is about. Held here rather than read from
    // `bill` because the icon variant only learns it on click.
    const [draftBill, setDraftBill] = useState<BillPDFData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const print = async (data: BillPDFData, draft: boolean) => {
        // The PDF library is heavy and only needed on print — load it on demand.
        const [{ pdf }, { BillPDF }] = await Promise.all([
            import('@react-pdf/renderer'),
            import('./BillPDF'),
        ]);
        const blob = await pdf(<BillPDF bill={data} draft={draft} />).toBlob();
        // Straight to the print dialog. Nothing is lost by skipping the
        // download: « Enregistrer au format PDF » is a destination in that same
        // dialog, so anyone who wanted the file still gets it — in one step
        // instead of two, and without a Téléchargements folder full of
        // near-identical factures.
        await printPdfBlob(blob, fileNameFor(data.id, draft));
    };

    const fetchBill = async (id: number): Promise<BillPDFData> => {
        const res = await fetch(`/api/bills/${id}`);
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || 'Échec du chargement de la facture');
        return data.bill as BillPDFData;
    };

    // Click: drafts open the confirm dialog, everything else prints directly.
    const handleClick = async (event: React.MouseEvent) => {
        // May sit inside a clickable table row — printing must not also open
        // the row's modal.
        event.stopPropagation();
        event.preventDefault();
        if (isPrinting || isIssuing) return;

        setError(null);
        setIsPrinting(true);
        try {
            const data = bill ?? (billId != null ? await fetchBill(billId) : null);
            if (!data) return;

            if (data.state === BillingStatus.DRAFT) {
                setDraftBill(data);
                return;
            }
            await print(data, false);
        } catch (err) {
            console.error('Bill print failed:', err);
            setError(err instanceof Error ? err.message : 'Erreur inattendue');
        } finally {
            setIsPrinting(false);
        }
    };

    // Draft → print as-is, no status change.
    const handlePrintDraft = async () => {
        if (!draftBill) return;
        setIsPrinting(true);
        try {
            await print(draftBill, true);
            setDraftBill(null);
        } catch (err) {
            console.error('Bill print failed:', err);
            setError(err instanceof Error ? err.message : 'Erreur inattendue');
        } finally {
            setIsPrinting(false);
        }
    };

    // Draft → issue (BILLED), refetch the issued bill, then print the official version.
    const handleIssueAndPrint = async () => {
        if (!draftBill) return;
        setIsIssuing(true);
        setError(null);
        try {
            const patch = await fetch(`/api/bills/${draftBill.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'updateStatus', state: BillingStatus.BILLED }),
            });
            const patchData = await patch.json().catch(() => null);
            if (!patch.ok) throw new Error(patchData?.message || "Échec de l'émission de la facture");

            await print(await fetchBill(draftBill.id), false);
            setDraftBill(null);
            onBillUpdated?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erreur inattendue');
        } finally {
            setIsIssuing(false);
        }
    };

    const busy = isPrinting || isIssuing;
    const disabled = busy || (!bill && billId == null);

    return (
        <>
            {variant === 'icon' ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClick}
                    disabled={disabled}
                    title={FULL_TEXT}
                    aria-label={FULL_TEXT}
                    className={`h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 ${className}`}
                >
                    {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Printer className="h-4 w-4" />
                    )}
                </Button>
            ) : (
                <Button
                    type="button"
                    variant="outline"
                    onClick={handleClick}
                    disabled={disabled}
                    title={FULL_TEXT}
                    className={`border-border bg-card text-foreground hover:bg-muted hover:text-white flex items-center gap-2 ${className}`}
                >
                    {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                    {isPrinting ? 'Génération…' : FULL_TEXT}
                </Button>
            )}

            <Dialog
                open={!!draftBill}
                onOpenChange={(open) => {
                    if (!busy && !open) setDraftBill(null);
                }}
            >
                <DialogContent className="max-w-md bg-card border-border [&>button>svg]:text-white">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Cette facture est un brouillon</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            Imprimer une facture officielle l&apos;émettra et changera son statut en « Émise ».
                            Une fois émise, elle ne pourra plus être modifiée librement.
                        </DialogDescription>
                    </DialogHeader>

                    {error && (
                        <div className="px-3 py-2 bg-red-900/20 border border-red-800 rounded-md text-red-200 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col gap-2 pt-1">
                        <Button
                            type="button"
                            onClick={handleIssueAndPrint}
                            disabled={busy}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-2"
                        >
                            {isIssuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                            Émettre la facture et imprimer
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handlePrintDraft}
                            disabled={busy}
                            className="border-border bg-card text-foreground hover:bg-muted hover:text-white flex items-center justify-center gap-2"
                        >
                            {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Imprimer le brouillon (sans émettre)
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setDraftBill(null)}
                            disabled={busy}
                            className="text-muted-foreground hover:text-foreground hover:bg-muted"
                        >
                            Annuler
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* The lookup failed, or printing did. Only reachable from the icon
                variant — the button variant already has the bill in hand and
                shows its errors inside the draft dialog. */}
            <Dialog open={!!error && !draftBill} onOpenChange={(open) => !open && setError(null)}>
                <DialogContent className="max-w-md bg-card border-border [&>button>svg]:text-white">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Facture</DialogTitle>
                        <DialogDescription className="text-muted-foreground">{error}</DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end pt-1">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setError(null)}
                            className="border-border bg-card text-foreground hover:bg-muted hover:text-white"
                        >
                            Fermer
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};
