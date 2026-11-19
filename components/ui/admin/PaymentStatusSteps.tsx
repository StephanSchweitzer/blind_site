'use client';

import { Check } from 'lucide-react';
import { parisDateDisplay } from '@/lib/paris-day';
import {
    PAYMENT_STATUS_VALUES,
    PaymentStatus,
    derivePaymentStatus,
    getPaymentStatusLabel,
} from '@/lib/payments/status';

/**
 * Où en est un paiement, lu sur ses dates — l'écho, dans le formulaire, de ce que
 * derivePaymentStatus dira une fois enregistré.
 *
 * Rien ici ne se clique : comme sur une demande ou une attribution, on saisit des
 * dates et le statut suit. Les étapes montrent seulement QUELLE date fait passer à
 * la suivante, pour que le lien entre les champs du dessous et le statut se voie.
 *
 * Un paiement encaissé sans avoir été demandé — le cas de presque tous — saute
 * l'étape « Demandé » : elle s'affiche alors « non demandé », pas comme une étape
 * manquée.
 */
export function PaymentStatusSteps({
    creationDate,
    requestDate,
    paymentDate,
}: {
    creationDate: Date | null;
    requestDate: Date | null;
    paymentDate: Date | null;
}) {
    const current = derivePaymentStatus({ paymentDate, requestDate });
    const currentIndex = PAYMENT_STATUS_VALUES.indexOf(current);

    const detail: Record<PaymentStatus, string> = {
        [PaymentStatus.PROFORMA]: creationDate ? `Créé le ${parisDateDisplay(creationDate)}` : 'Créé',
        [PaymentStatus.REQUESTED]: requestDate
            ? `Le ${parisDateDisplay(requestDate)}`
            : paymentDate
                ? 'Non demandé'
                : 'Date de la demande',
        [PaymentStatus.RECEIVED]: paymentDate ? `Le ${parisDateDisplay(paymentDate)}` : 'Date de paiement',
    };

    return (
        <ol aria-label="Statut du paiement" className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/40 p-3">
            {PAYMENT_STATUS_VALUES.map((status, index) => {
                const isCurrent = index === currentIndex;
                const isDone = index < currentIndex;
                return (
                    <li
                        key={status}
                        aria-current={isCurrent ? 'step' : undefined}
                        className="flex items-start gap-2 min-w-0"
                    >
                        <span
                            aria-hidden
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                                isCurrent
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : isDone
                                        ? 'border-primary/60 text-primary'
                                        : 'border-border text-muted-foreground'
                            }`}
                        >
                            {isDone ? <Check className="h-3 w-3" /> : index + 1}
                        </span>
                        <span className="min-w-0">
                            <span className={`block text-sm ${isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                                {getPaymentStatusLabel(status)}
                            </span>
                            <span className="block text-xs text-muted-foreground break-words">{detail[status]}</span>
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}
