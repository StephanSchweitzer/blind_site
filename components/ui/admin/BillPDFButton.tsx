'use client';

import React, { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BillingStatus } from '@/lib/billing-enums';
import { BillPDF, type BillPDFData } from './BillPDF';

interface BillPDFButtonProps {
    bill: BillPDFData | null;
    /** Called after the bill is issued (DRAFT → BILLED) so the parent can refresh. */
    onBillUpdated?: () => void;
}

export const BillPDFButton: React.FC<BillPDFButtonProps> = ({ bill, onBillUpdated }) => {
    const [isExporting, setIsExporting] = useState(false);
    const [isIssuing, setIsIssuing] = useState(false);
    const [showDraftDialog, setShowDraftDialog] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const download = async (data: BillPDFData, draft: boolean) => {
        const blob = await pdf(<BillPDF bill={data} draft={draft} />).toBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `facture-${data.id}${draft ? '-BROUILLON' : ''}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Click: drafts open the confirm dialog, everything else exports directly.
    const handleClick = async () => {
        if (!bill) return;
        if (bill.state === BillingStatus.DRAFT) {
            setError(null);
            setShowDraftDialog(true);
            return;
        }
        setIsExporting(true);
        try {
            await download(bill, false);
        } catch (err) {
            console.error('PDF export failed:', err);
        } finally {
            setIsExporting(false);
        }
    };

    // Draft → export as-is, no status change.
    const handleExportDraft = async () => {
        if (!bill) return;
        setIsExporting(true);
        try {
            await download(bill, true);
            setShowDraftDialog(false);
        } catch (err) {
            console.error('PDF export failed:', err);
        } finally {
            setIsExporting(false);
        }
    };

    // Draft → issue (BILLED), refetch the issued bill, then export the official version.
    const handleIssueAndExport = async () => {
        if (!bill) return;
        setIsIssuing(true);
        setError(null);
        try {
            const patch = await fetch(`/api/bills/${bill.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'updateStatus', state: BillingStatus.BILLED }),
            });
            const patchData = await patch.json().catch(() => null);
            if (!patch.ok) throw new Error(patchData?.message || "Échec de l'émission de la facture");

            const res = await fetch(`/api/bills/${bill.id}`);
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.message || 'Échec du rechargement de la facture');

            await download(data.bill as BillPDFData, false);
            setShowDraftDialog(false);
            onBillUpdated?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erreur inattendue');
        } finally {
            setIsIssuing(false);
        }
    };

    const busy = isExporting || isIssuing;

    return (
        <>
            <Button
                type="button"
                variant="outline"
                onClick={handleClick}
                disabled={!bill || busy}
                className="border-border bg-card text-foreground hover:bg-muted hover:text-white flex items-center gap-2"
            >
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                {isExporting ? 'Génération…' : 'Exporter en PDF'}
            </Button>

            <Dialog open={showDraftDialog} onOpenChange={(o) => !busy && setShowDraftDialog(o)}>
                <DialogContent className="max-w-md bg-card border-border [&>button>svg]:text-white">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Cette facture est un brouillon</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            Exporter une facture officielle l&apos;émettra et changera son statut en « Émise ».
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
                            onClick={handleIssueAndExport}
                            disabled={busy}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-2"
                        >
                            {isIssuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                            Émettre la facture et exporter
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleExportDraft}
                            disabled={busy}
                            className="border-border bg-card text-foreground hover:bg-muted hover:text-white flex items-center justify-center gap-2"
                        >
                            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Exporter le brouillon (sans émettre)
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setShowDraftDialog(false)}
                            disabled={busy}
                            className="text-muted-foreground hover:text-foreground hover:bg-muted"
                        >
                            Annuler
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};