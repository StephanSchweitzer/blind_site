'use client';

import React, { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { BillPrintNoticeDialog, type BillPrintNotice } from '@/admin/BillPrintNoticeDialog';
import { todayLocal } from '@/components/ui/admin/DatePickerField';
import { formatEuro2 } from '@/admin/OrderFormBackendBase';

type BillNotice =
    | { billId: number; kind: 'ISSUED'; total: string }
    | { billId: number; kind: 'PROFORMA'; total: string }
    | { billId: number; kind: string };

/**
 * « Clôturer » sur une ligne de la liste des demandes : la duplication vient
 * d'être envoyée, on la clôt à la date du jour sans ouvrir sa fiche. C'est le
 * geste de la liste « Duplication réalisable », qu'on parcourt en les faisant
 * une à une.
 *
 * N'envoie que la date de clôture : PUT /api/orders/[id] en déduit « Terminé »
 * et passe par les mêmes gardes et la même facturation que le formulaire. Le
 * confirm d'abord, parce que clore une demande la facture.
 *
 * L'appelant décide quand l'offrir (duplication ouverte dont le livre a son
 * audio) ; ce composant ne fait que le geste.
 */
export function CloseOrderTodayButton({
    order,
    onClosed,
}: {
    order: {
        id: number;
        title: string;
        auditeurName: string;
        /** « Non facturable », ou déjà sur une facture : clore ne l'ajoute à aucun brouillon. */
        joinsDraft: boolean;
    };
    onClosed: () => void;
}) {
    const { toast } = useToast();
    const confirm = useConfirm();
    const [isWorking, setIsWorking] = useState(false);
    const [printNotice, setPrintNotice] = useState<BillPrintNotice | null>(null);

    const handleClick = async (event: React.MouseEvent) => {
        event.stopPropagation();
        if (isWorking) return;

        const ok = await confirm({
            title: `Clôturer la demande n°${order.id} ?`,
            description:
                `« ${order.title} », duplication pour ${order.auditeurName}.\n` +
                (order.joinsDraft
                    ? 'Elle sera close à la date d’aujourd’hui, passera « Terminé » et rejoindra le brouillon de facture de l’auditeur.'
                    : 'Elle sera close à la date d’aujourd’hui et passera « Terminé ».'),
            confirmLabel: 'Clôturer',
        });
        if (!ok) return;

        setIsWorking(true);
        try {
            const res = await fetch(`/api/orders/${order.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ closureDate: todayLocal().toISOString() }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                toast({
                    variant: 'destructive',
                    title: 'Clôture impossible',
                    description: data?.message || 'Échec de la clôture de la demande',
                });
                return;
            }

            const notice = data?.billNotice as BillNotice | null | undefined;
            // Le seuil vient d'émettre la facture : la boîte qui porte le bouton
            // d'impression, pas un toast qui s'efface (voir BillPrintNoticeDialog).
            if (notice && (notice.kind === 'ISSUED' || notice.kind === 'PROFORMA') && 'total' in notice) {
                setPrintNotice({
                    billId: notice.billId,
                    title: notice.kind === 'PROFORMA'
                        ? `Facture pro-forma n° ${notice.billId} émise`
                        : `Facture #${notice.billId} émise`,
                    description: (
                        <>
                            En clôturant la demande n°{order.id}, elle a été rattachée à la facture
                            #{notice.billId}, qui vient d&apos;être émise (total : {formatEuro2(notice.total)} €).
                        </>
                    ),
                    footnote: (
                        <>
                            Elle est à imprimer et à envoyer au client. Rien n&apos;est perdu si vous fermez :
                            elle vous attend dans les factures, au statut « Émise ».
                        </>
                    ),
                });
                return;
            }

            toast({
                title: `Demande n°${order.id} clôturée`,
                description: notice?.kind === 'ATTACHED'
                    ? `Elle est « Terminé » et figure sur le brouillon de facture #${notice.billId}.`
                    : 'Elle est « Terminé ».',
            });
            onClosed();
        } catch {
            toast({
                variant: 'destructive',
                title: 'Clôture impossible',
                description: 'Échec de la clôture de la demande',
            });
        } finally {
            setIsWorking(false);
        }
    };

    const label = `Clôturer la demande n°${order.id} à la date d’aujourd’hui`;

    return (
        // La boîte d'impression est rendue dans la ligne : React fait remonter ses
        // clics par l'arbre des composants, portail ou non, jusqu'à la ligne qui
        // ouvrirait alors la demande.
        <span onClick={(e) => e.stopPropagation()}>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClick}
                disabled={isWorking}
                title={label}
                aria-label={label}
                className="h-8 gap-1.5 px-2 text-green-700 hover:text-green-800 hover:bg-green-50 dark:text-green-400 dark:hover:text-green-300 dark:hover:bg-green-950/30"
            >
                {isWorking ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                )}
                <span aria-hidden="true">Clôturer</span>
            </Button>
            <BillPrintNoticeDialog
                notice={printNotice}
                onClose={() => {
                    setPrintNotice(null);
                    onClosed();
                }}
            />
        </span>
    );
}
