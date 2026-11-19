'use client';

import React, { useState } from 'react';
import { Printer, Loader2, Undo2 } from 'lucide-react';
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
import { useUnsavedPrintGuard } from '@/hooks/useUnsavedPrintGuard';
import {
    PaymentStatus,
    derivePaymentStatus,
    getPaymentStatusLabel,
    isRequestablePaymentType,
} from '@/lib/payments/status';
import type { SerializedPayment } from '@/types/api/payment.api';
import type { PaymentDocumentKind } from './PaymentPDF';

/**
 * Les documents d'un paiement, dans la fenêtre « Paiement ».
 *
 * Un seul bouton principal, celui du document que le statut appelle — la
 * pro-forma d'un paiement que rien n'a encore quitté, la demande, le reçu — et,
 * pour une pro-forma, le geste suivant : envoyer la demande.
 *
 * Et le geste PRÉCÉDENT : revenir à « Pro-forma » depuis « Demandé », à
 * « Demandé » (ou « Pro-forma ») depuis « Encaissé ». Avant, il fallait savoir
 * qu'effacer une date dans le formulaire faisait reculer le statut — personne ne
 * le devinait, quand avancer avait son bouton.
 *
 * Les gestes qui ÉCRIVENT (envoyer la demande, émettre le reçu, revenir d'une
 * étape) passent par une confirmation, comme l'émission d'une facture depuis son
 * bouton d'impression (BillPDFButton) : ils datent le paiement, et le reçu le
 * verrouille. Une réimpression, elle, part directement — elle ne change rien.
 *
 * Tout part de la version ENREGISTRÉE du paiement : avec des modifications non
 * enregistrées dans le formulaire du dessous, chaque bouton prévient d'abord
 * (useUnsavedPrintGuard).
 */

/** Ce que la boîte de confirmation demande : un geste qui écrit. */
type Pending = 'REQUEST' | 'RECEIPT' | 'BACK_TO_PROFORMA' | 'BACK_FROM_RECEIVED' | null;

const fileNameFor = (p: SerializedPayment, kind: PaymentDocumentKind) =>
    kind === 'RECEIPT'
        ? `recu-${(p.receiptNumber ?? String(p.id)).replace(/\.0+$/, '')}.pdf`
        : `${kind === 'REQUEST' ? 'demande-de-paiement' : 'pro-forma'}-${p.id}.pdf`;

export function PaymentDocumentActions({
    payment,
    onPaymentChanged,
    unsaved = false,
}: {
    payment: SerializedPayment;
    /**
     * Le paiement tel que la route l'a rendu après un changement de statut.
     * Appelé APRÈS l'ouverture de la fenêtre d'impression, quand il y en a une :
     * l'appelant ne doit rien faire qui navigue avant whenPrintDialogClosed.
     */
    onPaymentChanged: (payment: SerializedPayment) => void;
    /** Le formulaire du dessous a des modifications non enregistrées. */
    unsaved?: boolean;
}) {
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState<Pending>(null);
    // Le dernier geste demandé, gardé pour que la boîte ne se vide pas pendant
    // son animation de fermeture.
    const [shown, setShown] = useState<Exclude<Pending, null>>('REQUEST');
    const ask = (kind: Exclude<Pending, null>) => { setShown(kind); setConfirm(kind); };
    const [error, setError] = useState<string | null>(null);
    const guardPrint = useUnsavedPrintGuard(unsaved);

    const status = derivePaymentStatus(payment);
    const requestable = isRequestablePaymentType(payment.type);
    // Où ramène « revenir » depuis « Encaissé » : à la demande, si elle était partie.
    const beforeReceived = getPaymentStatusLabel(
        payment.requestDate ? PaymentStatus.REQUESTED : PaymentStatus.PROFORMA
    );

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

    const send = async (url: string, init: RequestInit): Promise<SerializedPayment> => {
        const res = await fetch(url, init);
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || 'Échec de l’opération');
        return data.payment as SerializedPayment;
    };

    /**
     * Le geste qui écrit, puis le document, sur le paiement que la route a rendu.
     *
     * L'ordre compte : la confirmation se ferme, le document part à l'impression,
     * et SEULEMENT ENSUITE l'appelant apprend le nouveau statut. Le prévenir
     * d'abord lançait le rafraîchissement de la liste pendant que la fenêtre
     * d'impression s'ouvrait, et Chrome la refermait aussitôt (lib/print-pdf.ts).
     */
    const commitAndPrint = (path: 'request' | 'receipt', kind: PaymentDocumentKind) =>
        run(async () => {
            const updated = await send(`/api/payments/${payment.id}/${path}`, { method: 'POST' });
            setConfirm(null);
            try {
                await print(updated, kind);
            } finally {
                // Écrit en base même si l'impression a échoué : l'écran doit le dire.
                onPaymentChanged(updated);
            }
        });

    /**
     * Revenir d'une étape : effacer la date qui y avait fait passer — l'effet
     * qu'avait déjà le champ vidé dans le formulaire, par la même route (PATCH ne
     * touche que les champs envoyés). Sans date de paiement, pas de référence de
     * règlement : le formulaire l'efface de même.
     */
    const stepBack = (body: Record<string, null>) =>
        run(async () => {
            const updated = await send(`/api/payments/${payment.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            setConfirm(null);
            onPaymentChanged(updated);
        });

    const confirmPending = () => {
        switch (confirm) {
            case 'REQUEST': return commitAndPrint('request', 'REQUEST');
            case 'RECEIPT': return commitAndPrint('receipt', 'RECEIPT');
            case 'BACK_TO_PROFORMA': return stepBack({ requestDate: null });
            case 'BACK_FROM_RECEIVED': return stepBack({ paymentDate: null, paymentReference: null });
        }
    };

    /**
     * Chaque bouton part de la version enregistrée. Un changement de statut
     * recharge en plus le formulaire : les modifications y seraient perdues.
     */
    const guarded = (gesture: 'print' | 'status', action: () => void) => async () => {
        if (await guardPrint(gesture)) action();
    };

    const reprint = (kind: PaymentDocumentKind) => run(() => print(payment, kind));

    // Ce que le statut propose : le document, l'étape suivante, l'étape
    // précédente. Un enregistrement ou un don n'est jamais « Pro-forma » ni
    // « Demandé » (paymentDateOnSave) : seul le reçu les concerne, et ils n'ont
    // pas d'étape où revenir.
    type Action = { label: string; onClick: () => void; primary?: boolean; back?: boolean };
    const actions: Action[] = [];
    if (status === PaymentStatus.PROFORMA && requestable) {
        actions.push({ label: 'Imprimer la pro-forma', onClick: guarded('print', () => reprint('PROFORMA')) });
        actions.push({ label: 'Envoyer la demande de paiement', onClick: guarded('status', () => ask('REQUEST')), primary: true });
    } else if (status === PaymentStatus.REQUESTED) {
        actions.push({ label: 'Réimprimer la demande de paiement', onClick: guarded('print', () => reprint('REQUEST')), primary: true });
        actions.push({ label: 'Revenir à « Pro-forma »', onClick: guarded('status', () => ask('BACK_TO_PROFORMA')), back: true });
    } else if (status === PaymentStatus.RECEIVED) {
        actions.push(
            payment.receiptNumber
                ? { label: 'Réimprimer le reçu', onClick: guarded('print', () => reprint('RECEIPT')), primary: true }
                : { label: 'Émettre le reçu', onClick: guarded('status', () => ask('RECEIPT')), primary: true }
        );
        // Un reçu — émis ici ou repris de l'ancienne base — atteste
        // l'encaissement : le paiement ne revient plus en arrière derrière lui.
        if (requestable && !payment.receiptNumber) {
            actions.push({
                label: `Revenir à « ${beforeReceived} »`,
                onClick: guarded('status', () => ask('BACK_FROM_RECEIVED')),
                back: true,
            });
        }
    }
    if (actions.length === 0) return null;

    const dialogs: Record<Exclude<Pending, null>, { title: string; description: string; action: string }> = {
        REQUEST: {
            title: 'Envoyer la demande de paiement ?',
            description: 'Le paiement passe à « Demandé », daté d’aujourd’hui, puis la demande s’imprime. La réimprimer plus tard ne changera pas cette date.',
            action: 'Envoyer et imprimer',
        },
        RECEIPT: {
            title: 'Émettre le reçu ?',
            description: 'Le reçu prend le numéro suivant de l’année et la date d’aujourd’hui. Ensuite, le montant, le type, la personne, les dates et la référence de ce paiement ne se modifient plus.',
            action: 'Émettre et imprimer',
        },
        BACK_TO_PROFORMA: {
            title: 'Revenir à « Pro-forma » ?',
            description: 'La date de la demande est effacée et le paiement redevient « Pro-forma ». Une demande déjà imprimée ou envoyée n’est pas rappelée pour autant.',
            action: 'Revenir à « Pro-forma »',
        },
        BACK_FROM_RECEIVED: {
            title: `Revenir à « ${beforeReceived} » ?`,
            description: `La date de paiement et la référence sont effacées : le paiement n’est plus encaissé et redevient « ${beforeReceived} ». Il ne compte plus dans les montants encaissés.`,
            action: `Revenir à « ${beforeReceived} »`,
        },
    };
    const pending = dialogs[confirm ?? shown];

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
                        {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : a.back ? (
                            <Undo2 className="h-4 w-4" />
                        ) : (
                            <Printer className="h-4 w-4" />
                        )}
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
                        <DialogTitle className="text-foreground">{pending.title}</DialogTitle>
                        <DialogDescription className="text-muted-foreground">{pending.description}</DialogDescription>
                    </DialogHeader>
                    {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => setConfirm(null)} disabled={busy}>
                            Annuler
                        </Button>
                        <Button
                            type="button"
                            onClick={confirmPending}
                            disabled={busy}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2"
                        >
                            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                            {pending.action}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
