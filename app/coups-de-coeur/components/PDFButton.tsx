// PDFButton.tsx (remains the same)
import React from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PDFButtonProps {
    onExport: () => void;
    isExporting: boolean;
}

export const PDFButton: React.FC<PDFButtonProps> = ({ onExport, isExporting }) => (
    <Button
        onClick={onExport}
        disabled={isExporting}
        className="fixed bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white shadow-lg z-50"
    >
        <Download className="mr-2 h-4 w-4" />
        {isExporting ? 'Exportation...' : 'Exporter en PDF'}
    </Button>
);