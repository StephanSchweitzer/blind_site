'use client';

import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CoupDeCoeur } from '@/types/coups-de-coeur';

interface PDFButtonProps {
    content: CoupDeCoeur[];
}

export const PDFButton: React.FC<PDFButtonProps> = ({ content }) => {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        if (!content.length) return;
        setIsExporting(true);
        try {
            // The PDF library is heavy and only needed on export — load it on demand.
            const [{ pdf }, { CoupDeCoeurPDF }] = await Promise.all([
                import('@react-pdf/renderer'),
                import('./CoupDeCoeurPDF'),
            ]);
            const blob = await pdf(<CoupDeCoeurPDF content={content} />).toBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `coup-de-coeur-${content[0]?.title ?? 'eca'}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('PDF export failed:', err);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Button
            onClick={handleExport}
            disabled={isExporting || !content.length}
            className="fixed bottom-4 right-4 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg z-50"
        >
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Exportation...' : 'Exporter en PDF'}
        </Button>
    );
};