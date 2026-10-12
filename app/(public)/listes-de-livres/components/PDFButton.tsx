'use client';

import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { loadOnDemand, STALE_PAGE_MESSAGE } from '@/lib/load-on-demand';
import type { CoupDeCoeur } from '@/types/coups-de-coeur';

interface PDFButtonProps {
    content: CoupDeCoeur[];
}

export const PDFButton: React.FC<PDFButtonProps> = ({ content }) => {
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleExport = async () => {
        if (!content.length) return;
        setError(null);
        setIsExporting(true);
        try {
            // The PDF library is heavy and only needed on export — load it on demand.
            const [{ pdf }, { CoupDeCoeurPDF }] = await loadOnDemand(() =>
                Promise.all([
                    import('@react-pdf/renderer'),
                    import('./CoupDeCoeurPDF'),
                ]),
            );
            const blob = await pdf(<CoupDeCoeurPDF content={content} />).toBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `liste-de-livres-${content[0]?.title ?? 'eca'}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('PDF export failed:', err);
            // Dit, pas seulement journalisé : un bouton qui ne fait rien reste muet
            // pour un lecteur d'écran. Une page ouverte avant un déploiement reçoit
            // la consigne de recharger (lib/load-on-demand.ts) ; le reste, un
            // message générique plutôt qu'une erreur technique en anglais.
            setError(
                err instanceof Error && err.message === STALE_PAGE_MESSAGE
                    ? STALE_PAGE_MESSAGE
                    : "L'export PDF n'a pas pu aboutir. Veuillez réessayer.",
            );
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
            {error && (
                <p
                    role="alert"
                    className="max-w-sm rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 shadow-lg dark:border-red-900/60 dark:bg-red-950 dark:text-red-300"
                >
                    {error}
                </p>
            )}
            <Button
                onClick={handleExport}
                disabled={isExporting || !content.length}
                className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
            >
                <Download className="mr-2 h-4 w-4" />
                {isExporting ? 'Exportation...' : 'Exporter en PDF'}
            </Button>
        </div>
    );
};
