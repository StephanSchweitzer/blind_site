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
import type { MailingLabelData } from './MailingLabelPDF';
import {
    type ShipmentContents,
    type ShipmentContext,
    SHIPMENT_CONTENTS_LABELS,
    SHIPMENT_CONTENTS_HINTS,
    proposedShipmentContents,
    shipmentCarriesRecording,
    shipmentNeedsNothing,
    shipmentReference,
} from '@/lib/orders/labelReference';

/** One address as the lookup route returns it. */
interface LabelAddress {
    id: number;
    isDefault: boolean;
    lines: string[];
    oneLine: string;
}

export interface MailingLabelButtonProps {
    /**
     * Print this exact address. Pass it where the caller already has one on
     * screen — the user form does, and passing it means the étiquette prints
     * what is currently typed, so a corrected typo can go on the envelope
     * without saving first.
     */
    label?: MailingLabelData | null;
    /**
     * Otherwise: look the member's addresses up on click. The list screens
     * don't carry addresses, so this is the usual path.
     */
    userId?: number;
    /**
     * Set on a label that accompanies a shipment (a demande or an attribution).
     * It turns on the contents dialog, the reference line below the cut, and
     * the cécogramme mention. Leaving it off gives a plain address label —
     * which is what a facture or a letter to a donateur needs.
     */
    shipment?: ShipmentContext | null;
    /**
     * Known-empty address book. Only worth passing where the caller already
     * queried addresses — it disables the button without a round trip.
     */
    hasAddress?: boolean;
    /** `icon` is the compact form for table rows and card headers. */
    variant?: 'button' | 'icon';
    className?: string;
}

const FULL_TEXT = "Imprimer l'étiquette d'adresse";

const CONTENTS_ORDER: ShipmentContents[] = [
    'RECORDING_AND_BOOK',
    'RECORDING_ONLY',
    'BOOK_ONLY',
];

/** A filename someone can find again in their Downloads folder. */
const fileNameFor = (recipient: string) => {
    const slug = recipient
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `etiquette-adresse${slug ? `-${slug}` : ''}.pdf`;
};

/** An address resolved and waiting on the contents question. */
interface PendingLabel {
    recipient: string;
    lines: string[];
}

export const MailingLabelButton: React.FC<MailingLabelButtonProps> = ({
    label,
    userId,
    shipment,
    hasAddress,
    variant = 'button',
    className = '',
}) => {
    const [isWorking, setIsWorking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [choices, setChoices] = useState<
        { recipient: string; addresses: LabelAddress[] } | null
    >(null);
    const [pending, setPending] = useState<PendingLabel | null>(null);

    const download = async (data: MailingLabelData) => {
        // The PDF library is heavy and only needed on print — load it on demand,
        // same as BillPDFButton.
        const [{ pdf }, { MailingLabelPDF }] = await Promise.all([
            import('@react-pdf/renderer'),
            import('./MailingLabelPDF'),
        ]);
        const blob = await pdf(<MailingLabelPDF label={data} />).toBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileNameFor(data.recipient);
        a.click();
        URL.revokeObjectURL(url);
    };

    /**
     * Address in hand. A shipment still has to say what's in the envelope
     * before anything is printed — the cécogramme depends on the answer, and
     * the media format that would settle it is unset on most demandes.
     */
    const proceed = async (resolved: PendingLabel) => {
        if (shipment) {
            setPending(resolved);
            return;
        }
        await download(resolved);
    };

    const handleClick = async (event: React.MouseEvent) => {
        // Frequently sits inside a clickable table row — printing a label must
        // not also open the row's modal.
        event.stopPropagation();
        event.preventDefault();
        if (isWorking) return;

        setError(null);
        setIsWorking(true);
        try {
            if (label) {
                if (!label.lines.length) {
                    setError(
                        "Cette adresse est vide : renseignez-la avant d'imprimer l'étiquette."
                    );
                    return;
                }
                await proceed(label);
                return;
            }

            if (!userId) return;

            const res = await fetch(`/api/user/${userId}/mailing-label`);
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.message ?? "Échec du chargement de l'adresse");
            }

            const addresses: LabelAddress[] = data.addresses ?? [];
            if (addresses.length === 0) {
                setError(
                    "Aucune adresse postale enregistrée pour ce membre. Ajoutez-en une dans sa fiche pour pouvoir imprimer l'étiquette."
                );
                return;
            }
            if (addresses.length === 1) {
                await proceed({ recipient: data.recipient, lines: addresses[0].lines });
                return;
            }
            // Several on file — ask rather than guess which envelope this is.
            setChoices({ recipient: data.recipient, addresses });
        } catch (err) {
            console.error('Mailing label export failed:', err);
            setError(err instanceof Error ? err.message : 'Erreur inattendue');
        } finally {
            setIsWorking(false);
        }
    };

    const handlePick = async (address: LabelAddress) => {
        if (!choices) return;
        const resolved = { recipient: choices.recipient, lines: address.lines };
        setChoices(null);
        setIsWorking(true);
        try {
            await proceed(resolved);
        } catch (err) {
            console.error('Mailing label export failed:', err);
            setError(err instanceof Error ? err.message : 'Erreur inattendue');
        } finally {
            setIsWorking(false);
        }
    };

    const handleContents = async (contents: ShipmentContents) => {
        if (!pending || !shipment) return;
        setIsWorking(true);
        try {
            await download({
                ...pending,
                reference: shipmentReference(shipment, contents),
                cecogramme: shipmentCarriesRecording(contents),
            });
            setPending(null);
        } catch (err) {
            console.error('Mailing label export failed:', err);
            setError(err instanceof Error ? err.message : 'Erreur inattendue');
        } finally {
            setIsWorking(false);
        }
    };

    const proposed = shipment ? proposedShipmentContents(shipment) : null;
    const nothingToSend = shipment ? shipmentNeedsNothing(shipment) : false;

    const noAddress = hasAddress === false;
    const disabled = isWorking || noAddress;
    const title = noAddress ? 'Aucune adresse postale enregistrée' : FULL_TEXT;

    return (
        <>
            {variant === 'icon' ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClick}
                    disabled={disabled}
                    title={title}
                    aria-label={FULL_TEXT}
                    className={`h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 ${className}`}
                >
                    {isWorking ? (
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
                    title={title}
                    className={`border-border bg-card text-foreground hover:bg-muted hover:text-white flex items-center gap-2 ${className}`}
                >
                    {isWorking ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Printer className="h-4 w-4" />
                    )}
                    {FULL_TEXT}
                </Button>
            )}

            {/* Which address? Only ever shown when the member has more than one. */}
            <Dialog open={!!choices} onOpenChange={(open) => !open && setChoices(null)}>
                <DialogContent className="max-w-md bg-card border-border [&>button>svg]:text-white">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Quelle adresse ?</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            Ce membre a plusieurs adresses enregistrées. Choisissez celle à
                            imprimer sur l&apos;étiquette.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-2 pt-1">
                        {choices?.addresses.map((address) => (
                            <Button
                                key={address.id}
                                type="button"
                                variant="outline"
                                disabled={isWorking}
                                onClick={() => handlePick(address)}
                                className="h-auto justify-start whitespace-normal border-border bg-card px-3 py-2 text-left text-foreground hover:bg-muted hover:text-white"
                            >
                                <span className="flex flex-col items-start gap-0.5">
                                    <span className="text-sm">{address.oneLine}</span>
                                    {address.isDefault && (
                                        <span className="text-xs text-muted-foreground">
                                            Adresse par défaut
                                        </span>
                                    )}
                                </span>
                            </Button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            {/* What's in the envelope? Decides the contents line AND the cécogramme,
                so it is asked rather than assumed — see lib/orders/labelReference.ts. */}
            <Dialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
                <DialogContent className="max-w-lg bg-card border-border [&>button>svg]:text-white">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">
                            Que contient l&apos;enveloppe ?
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            Cette réponse détermine la mention « Cécogramme » — la franchise
                            postale ne couvre qu&apos;un envoi contenant un enregistrement.
                        </DialogDescription>
                    </DialogHeader>

                    {nothingToSend && (
                        <div className="rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                            Cette demande est une duplication dont l&apos;enregistrement a été
                            transmis par Internet : en principe il n&apos;y a rien à expédier.
                        </div>
                    )}

                    <div className="flex flex-col gap-2 pt-1">
                        {CONTENTS_ORDER.map((option) => (
                            <Button
                                key={option}
                                type="button"
                                variant="outline"
                                disabled={isWorking}
                                onClick={() => handleContents(option)}
                                className={`h-auto justify-start whitespace-normal px-3 py-2 text-left hover:bg-muted hover:text-white ${
                                    option === proposed
                                        ? 'border-primary bg-primary/10 text-foreground'
                                        : 'border-border bg-card text-foreground'
                                }`}
                            >
                                <span className="flex flex-col items-start gap-0.5">
                                    <span className="text-sm font-medium">
                                        {SHIPMENT_CONTENTS_LABELS[option]}
                                        {option === proposed && (
                                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                proposé
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {SHIPMENT_CONTENTS_HINTS[option]}
                                    </span>
                                </span>
                            </Button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Nothing to print, or the lookup failed. */}
            <Dialog open={!!error} onOpenChange={(open) => !open && setError(null)}>
                <DialogContent className="max-w-md bg-card border-border [&>button>svg]:text-white">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">
                            Étiquette d&apos;adresse
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            {error}
                        </DialogDescription>
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
