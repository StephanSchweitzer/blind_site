'use client';

import React, { useState } from 'react';
import { Printer, Loader2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { printPdfBlob } from '@/lib/print-pdf';
import { loadOnDemand } from '@/lib/load-on-demand';
import { PaymentStatus, derivePaymentStatus, isRequestablePaymentType } from '@/lib/payments/status';
import type { SerializedPayment } from '@/types/api/payment.api';
import type { PaymentDocumentKind } from './PaymentPDF';

/**
 * Les documents d'un paiement, dans la fenêtre « Paiement ».
 *
 * Un seul bouton principal, celui du document que le statut appelle — la
 * pro-forma d'un paiement que rien n'a encore quitté, la demande, le reçu — et,
 * pour une pro-forma, le geste suivant : envoyer la demande.
 *
 * Les deux gestes qui ÉCRIVENT (envoyer la demande, émettre le reçu) passent par
 * une confirmation, comme l'émission d'une facture depuis son bouton
 * d'impression (BillPDFButton) : ils datent le paiement, et le reçu le verrouille.
 * Une réimpression, elle, part directement — elle ne change rien.
 */

type Pending = 'REQUEST' | 'RECEIPT' | null;

const fileNameFor = (p: SerializedPayment, kind: PaymentDocumentKind) =>
    kind === 'RECEIPT'
        ? `recu-${(p.receiptNumber ?? String(p.id)).replace(/\.0+$/, '')}.pdf`
        : `${kind === 'REQUEST' ? 'demande-de-paiement' : 'pro-forma'}-${p.id}.pdf`;

export function PaymentDocumentActions({
    payment,
    onPaymentChanged,
}: {
    payment: SerializedPayment;
    /** Le paiement tel que la route l'a rendu après une demande ou un reçu. */
    onPaymentChanged: (payment: SerializedPayment) => void;
}) {
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState<Pending>(null);
    const [error, setError] = useState<string | null>(null);

    const status = derivePaymentStatus(payment);
    const requestable = isRequestablePaymentType(payment.type);

    const print = async (p: SerializedPayment, kind: PaymentDocumentKind) => {
        // La bibliothèque PDF est lourde et ne sert qu'à l'impression.
        const [{ pdf }, { PaymentPDF }] = await loadOnDemand(() =>
            Promise.all([import('@react-pdf/renderer'), import('./PaymentPDF')]),
        );
        const blob = await pdf(<PaymentPDF payment={p} kind={kind} />).toBlob();
        await printPdfBlob(blob, fileNameFor(p, kind));
    };

    const run = async (task: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await task();
        } catch (err) {
            console.error('Payment document failed:', err);
            setError(err instanceof Error ? err.message : 'Erreur inattendue');
        } finally {
            setBusy(false);
        }
    };

    /** Le geste qui écrit, puis le document, sur le paiement que la route a rendu. */
    const commitAndPrint = (path: 'request' | 'receipt', kind: PaymentDocumentKind) =>
        run(async () => {
            const res = await fetch(`/api/payments/${payment.id}/${path}`, { method: 'POST' });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.message || 'Échec de l’opération');
            const updated = data.payment as SerializedPayment;
            onPaymentChanged(updated);
            setConfirm(null);
            await print(updated, kind);
        });

    const reprint = (kind: PaymentDocumentKind) => run(() => print(payment, kind));

    // Ce que le statut propose. Un enregistrement ou un don n'est jamais « Pro-forma »
    // ni « Demandé » (paymentDateOnSave) : seul le reçu les concerne.
    const actions: { label: string; onClick: () => void; primary?: boolean }[] = [];
    if (status === PaymentStatus.PROFORMA && requestable) {
        actions.push({ label: 'Imprimer la pro-forma', onClick: () => reprint('PROFORMA') });
        actions.push({ label: 'Envoyer la demande de paiement', onClick: () => setConfirm('REQUEST'), primary: true });
    } else if (status === PaymentStatus.REQUESTED) {
        actions.push({ label: 'Réimprimer la demande de paiement', onClick: () => reprint('REQUEST'), primary: true });
    } else if (status === PaymentStatus.RECEIVED) {
        actions.push(
            payment.receiptNumber
                ? { label: 'Réimprimer le reçu', onClick: () => reprint('RECEIPT'), primary: true }
                : { label: 'Émettre le reçu', onClick: () => setConfirm('RECEIPT'), primary: true }
        );
    }
    if (actions.length === 0) return null;

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                {actions.map((a) => (
                    <Button
                        key={a.label}
                        type="button"
                        variant="outline"
                        onClick={a.onClick}
                        disabled={busy}
                        className={`flex items-center gap-2 border-border ${a.primary ? 'bg-card text-foreground font-semibold' : 'bg-card text-muted-foreground'} hover:bg-muted`}
                    >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                        {a.label}
                    </Button>
                ))}
            </div>
            {error && (
                <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>
            )}

            <Dialog open={confirm !== null} onOpenChange={(open) => { if (!busy && !open) setConfirm(null); }}>
                <DialogContent className="max-w-md bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">
                            {confirm === 'RECEIPT' ? 'Émettre le reçu ?' : 'Envoyer la demande de paiement ?'}
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            {confirm === 'RECEIPT'
                                ? 'Le reçu prend le numéro suivant de l’année et la date d’aujourd’hui. Ensuite, le montant, le type, la personne, les dates et la référence de ce paiement ne se modifient plus.'
                                : 'Le paiement passe à « Demandé », daté d’aujourd’hui, puis la demande s’imprime. La réimprimer plus tard ne changera pas cette date.'}
                        </DialogDescription>
                    </DialogHeader>
                    {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => setConfirm(null)} disabled={busy}>
                            Annuler
                        </Button>
                        <Button
                            type="button"
                            onClick={() => (confirm === 'RECEIPT' ? commitAndPrint('receipt', 'RECEIPT') : commitAndPrint('request', 'REQUEST'))}
                            disabled={busy}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2"
                        >
                            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                            {confirm === 'RECEIPT' ? 'Émettre et imprimer' : 'Envoyer et imprimer'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
