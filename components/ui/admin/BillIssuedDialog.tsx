'use client';

import React from 'react';
import Link from 'next/link';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BillPDFButton } from './BillPDFButton';

interface BillIssuedDialogProps {
    /** La facture qui vient d'être émise ; `null` garde la boîte fermée. */
    billId: number | null;
    /**
     * Ce que l'utilisateur vient de faire, et ce que ça a produit. Fourni par
     * l'appelant : ce n'est pas la même phrase selon qu'on termine une demande
     * ou qu'on en crée une série.
     */
    description: React.ReactNode;
    /** Acquitté : l'appelant reprend ce qu'il retenait (fermeture du modal, refresh…). */
    onClose: () => void;
}

/**
 * « Le seuil est atteint, la facture est passée de brouillon à émise. »
 *
 * Personne n'a demandé d'émettre une facture : c'est le passage d'une demande à
 * « Terminé » qui l'a déclenché. D'où la boîte de dialogue plutôt qu'un toast —
 * un document doit maintenant sortir de l'imprimante et partir au courrier, et
 * un toast qui s'efface tout seul peut ne jamais être lu.
 *
 * Le bouton d'impression est *dans* la boîte, et non un lien vers /admin/bills
 * où il faudrait retrouver la ligne : c'est l'action qui suit l'annonce, dans
 * la quasi-totalité des cas. La facture est déjà BILLED ici, donc BillPDFButton
 * imprime d'un clic — sa confirmation « ceci est un brouillon » ne concerne que
 * les DRAFT.
 *
 * L'impression referme la boîte (`onPrinted`) : le geste demandé est fait, et
 * sans ça on retrouve l'avis derrière la boîte d'impression du navigateur, à
 * cliquer une seconde fois pour rien.
 *
 * « Voir la facture » reste, en lien discret et non en second bouton : une fois
 * sur vingt le total surprend et on veut vérifier les lignes avant d'engager du
 * papier. Deux boutons de même poids feraient hésiter à chaque fois pour un cas
 * rare.
 */
export const BillIssuedDialog: React.FC<BillIssuedDialogProps> = ({
    billId,
    description,
    onClose,
}) => (
    <Dialog open={billId != null} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="bg-card border-border max-w-lg">
            <DialogHeader>
                <DialogTitle className="text-amber-700 dark:text-amber-300">
                    Facture #{billId} émise
                </DialogTitle>
            </DialogHeader>
            <div className="text-foreground text-sm space-y-3">
                {/* DialogDescription et non un <p> : c'est ce que le lecteur d'écran
                    annonce à l'ouverture, et l'annonce doit être ce qui vient de se
                    passer, pas le seul titre. */}
                <DialogDescription className="text-foreground text-sm">{description}</DialogDescription>
                <p className="text-muted-foreground">
                    Elle est à imprimer et à envoyer au client. Rien n&apos;est perdu si vous fermez :
                    elle vous attend dans les factures, au statut « Émise ».
                </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {billId != null && (
                    <Link
                        href={`/admin/bills?bill=${billId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-700 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 underline underline-offset-2"
                    >
                        Voir la facture #{billId}
                    </Link>
                )}
                <div className="flex items-center gap-2 ml-auto">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                        Fermer
                    </Button>
                    {billId != null && (
                        <BillPDFButton
                            billId={billId}
                            onPrinted={onClose}
                            className="bg-indigo-600 border-transparent text-white hover:bg-indigo-500 hover:text-white"
                        />
                    )}
                </div>
            </div>
        </DialogContent>
    </Dialog>
);
