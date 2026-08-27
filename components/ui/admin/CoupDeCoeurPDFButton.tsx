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
import { printPdfBlob } from '@/lib/print-pdf';
import type { CoupDeCoeur } from '@/types/coups-de-coeur';

interface CoupDeCoeurPDFButtonProps {
    /** The list is only ever printed by id — the table only carries rows, and the
     * editor screen would otherwise print a genre-less document (its own fetch
     * doesn't ask for genres). One fetch, always with genres, keeps both callers
     * in sync with the public export. */
    coupDeCoeurId: number;
    /** `icon` is the compact form for table rows. */
    variant?: 'button' | 'icon';
    className?: string;
}

const FULL_TEXT = 'Imprimer la liste de livres';

/** Only used by the download fallback in printPdfBlob — see lib/print-pdf.ts. */
const fileNameFor = (title: string) => {
    const slug = title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `liste-de-livres-${slug || 'eca'}.pdf`;
};

export const CoupDeCoeurPDFButton: React.FC<CoupDeCoeurPDFButtonProps> = ({
    coupDeCoeurId,
    variant = 'button',
    className = '',
}) => {
    const [isPrinting, setIsPrinting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleClick = async (event: React.MouseEvent) => {
        // May sit inside a clickable table row — printing must not also open
        // the row's edit page.
        event.stopPropagation();
        event.preventDefault();
        if (isPrinting) return;

        setError(null);
        setIsPrinting(true);
        try {
            const res = await fetch(`/api/coups-de-coeur/${coupDeCoeurId}`);
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || 'Échec du chargement de la liste de livres');

            // The PDF library is heavy and only needed on print — load it on demand.
            const [{ pdf }, { CoupDeCoeurPDF }] = await Promise.all([
                import('@react-pdf/renderer'),
                import('@/coups-de-coeur/CoupDeCoeurPDF'),
            ]);
            const content = [data as CoupDeCoeur];
            const blob = await pdf(<CoupDeCoeurPDF content={content} />).toBlob();
            // Straight to the print dialog — same reasoning as BillPDFButton /
            // MailingLabelButton: nothing is lost, « Enregistrer au format PDF »
            // is a destination inside the same dialog.
            await printPdfBlob(blob, fileNameFor(content[0].title));
        } catch (err) {
            console.error('Coup de coeur print failed:', err);
            setError(err instanceof Error ? err.message : 'Erreur inattendue');
        } finally {
            setIsPrinting(false);
        }
    };

    return (
        <>
            {variant === 'icon' ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClick}
                    disabled={isPrinting}
                    title={FULL_TEXT}
                    aria-label={FULL_TEXT}
                    className={`h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 ${className}`}
                >
                    {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                </Button>
            ) : (
                <Button
                    type="button"
                    variant="outline"
                    onClick={handleClick}
                    disabled={isPrinting}
                    title={FULL_TEXT}
                    className={`border-border bg-card text-foreground hover:bg-muted hover:text-white flex items-center gap-2 ${className}`}
                >
                    {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                    {isPrinting ? 'Génération…' : FULL_TEXT}
                </Button>
            )}

            <Dialog open={!!error} onOpenChange={(open) => !open && setError(null)}>
                <DialogContent className="max-w-md bg-card border-border [&>button>svg]:text-white">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Liste de livres</DialogTitle>
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
