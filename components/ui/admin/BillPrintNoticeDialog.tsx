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

export interface BillPrintNotice {
    /** La facture concernée. */
    billId: number;
    /** Ce qui vient de se passer, en titre. */
    title: string;
    /**
     * Ce que l'utilisateur vient de faire, et ce que ça a produit. Fourni par
     * l'appelant : émettre une facture au passage du seuil et rendre caduc un
     * document déjà envoyé ne se racontent pas de la même façon.
     */
    description: React.ReactNode;
    /** La suite, en gris : ce qu'il reste à faire, et ce qui attend si on ferme. */
    footnote: React.ReactNode;
    /** Défaut « Imprimer la facture » ; un document déjà envoyé se *ré*imprime. */
    printLabel?: string;
}

interface BillPrintNoticeDialogProps {
    /** `null` garde la boîte fermée. */
    notice: BillPrintNotice | null;
    /** Acquitté : l'appelant reprend ce qu'il retenait (fermeture du modal, refresh…). */
    onClose: () => void;
}

/**
 * « Cette facture doit sortir de l'imprimante. »
 *
 * Trois situations le disent : le seuil vient d'émettre une facture, un coût
 * modifié a changé le total d'une facture déjà envoyée, un élément imprimé
 * dessus a changé. Dans les trois cas personne n'a rien demandé de tel — c'est
 * tombé d'une modification de demande — d'où la boîte de dialogue plutôt qu'un
 * toast : un document doit partir au courrier, et un toast qui s'efface tout
 * seul peut ne jamais être lu.
 *
 * Le bouton d'impression est *dans* la boîte, et non un lien vers /admin/bills
 * où il faudrait retrouver la ligne : c'est l'action qui suit l'annonce, dans
 * la quasi-totalité des cas. Ces factures sont émises (jamais DRAFT — l'API ne
 * prévient que pour un document déjà sorti), donc BillPDFButton imprime d'un
 * clic, sans sa confirmation « ceci est un brouillon ».
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
export const BillPrintNoticeDialog: React.FC<BillPrintNoticeDialogProps> = ({ notice, onClose }) => (
    <Dialog open={notice != null} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="bg-card border-border max-w-lg">
            <DialogHeader>
                <DialogTitle className="text-amber-700 dark:text-amber-300">
                    {notice?.title}
                </DialogTitle>
            </DialogHeader>
            <div className="text-foreground text-sm space-y-3">
                {/* DialogDescription et non un <p> : c'est ce que le lecteur d'écran
                    annonce à l'ouverture, et l'annonce doit être ce qui vient de se
                    passer, pas le seul titre. */}
                <DialogDescription className="text-foreground text-sm">
                    {notice?.description}
                </DialogDescription>
                <p className="text-muted-foreground">{notice?.footnote}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {notice && (
                    <Link
                        href={`/admin/bills?bill=${notice.billId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-700 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 underline underline-offset-2"
                    >
                        Voir la facture #{notice.billId}
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
                    {notice && (
                        <BillPDFButton
                            billId={notice.billId}
                            label={notice.printLabel}
                            onPrinted={onClose}
                            className="bg-indigo-600 border-transparent text-white hover:bg-indigo-500 hover:text-white"
                        />
                    )}
                </div>
            </div>
        </DialogContent>
    </Dialog>
);
