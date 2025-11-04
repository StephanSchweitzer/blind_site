// app/admin/bills/bills-table.tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Search, X, Plus, Loader2 } from 'lucide-react';

interface Bill {
    id: number;
    clientId: number;
    stateId: number;
    creationDate: string;
    issueDate: string | null;
    paymentDate: string | null;
    invoiceAmount: string;
    client: {
        name: string | null;
        email: string | null;
    };
    state: {
        name: string;
    };
}

interface Status {
    id: number;
    name: string;
}

interface BillsTableProps {
    initialBills: Bill[];
    initialPage: number;
    initialSearch: string;
    totalPages: number;
    availableStatuses: Status[];
    initialTotalBills: number;
}

export default function BillsTable({
                                       initialBills,
                                       initialPage,
                                       initialSearch,
                                       totalPages,
                                       availableStatuses,
                                       initialTotalBills,
                                   }: BillsTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const currentPage = initialPage;
    const currentStateId = searchParams.get('stateId') || 'all';

    const updateUrl = (updates: Record<string, string | undefined>) => {
        const params = new URLSearchParams(searchParams.toString());

        Object.entries(updates).forEach(([key, value]) => {
            if (value) {
                params.set(key, value);
            } else {
                params.delete(key);
            }
        });

        startTransition(() => {
            router.push(`?${params.toString()}`);
        });
    };

    const handleSearch = () => {
        updateUrl({ search: searchTerm || undefined, page: '1' });
    };

    const handleClearSearch = () => {
        setSearchTerm('');
        updateUrl({ search: undefined, page: '1' });
    };

    const handlePageChange = (newPage: number) => {
        updateUrl({ page: newPage.toString() });
    };

    const handleStateFilter = (stateId: string) => {
        updateUrl({
            stateId: stateId === 'all' ? undefined : stateId,
            page: '1',
        });
    };

    // const handleBillAdded = () => {
    //     setIsAddModalOpen(false);
    //     router.refresh();
    // };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('fr-FR');
    };

    const formatCurrency = (amount: string) => {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
        }).format(parseFloat(amount));
    };

    const getStateColor = (stateName: string) => {
        const colorMap: Record<string, string> = {
            'Brouillon': 'bg-gray-100 text-gray-800',
            'En attente': 'bg-yellow-100 text-yellow-800',
            'Émise': 'bg-blue-100 text-blue-800',
            'Payée': 'bg-green-100 text-green-800',
            'Annulée': 'bg-red-100 text-red-800',
            'En retard': 'bg-orange-100 text-orange-800',
        };
        return colorMap[stateName] || 'bg-gray-100 text-gray-800';
    };

    // Calculate visible pages
    const getVisiblePages = () => {
        const pages: (number | string)[] = [];
        const maxVisible = 5;

        if (totalPages <= maxVisible + 2) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }

        pages.push(1);

        const start = Math.max(2, currentPage - 1);
        const end = Math.min(totalPages - 1, currentPage + 1);

        if (start > 2) pages.push('...');
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        if (end < totalPages - 1) pages.push('...');

        pages.push(totalPages);

        return pages;
    };

    const visiblePages = getVisiblePages();

    return (
        <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="border-b border-gray-800 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle className="text-2xl font-bold text-gray-100">
                            Factures
                        </CardTitle>
                        <CardDescription className="text-gray-400 mt-1">
                            {initialTotalBills} facture{initialTotalBills > 1 ? 's' : ''} au total
                        </CardDescription>
                    </div>
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        Nouvelle facture
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="pt-6">
                {/* Search and Filter Section */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="flex-1 flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                            <Input
                                placeholder="Rechercher par client..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                className="pl-10 bg-gray-800 border-gray-700 text-gray-200 placeholder:text-gray-400"
                            />
                            {searchTerm && (
                                <button
                                    onClick={handleClearSearch}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-200"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        <Button
                            onClick={handleSearch}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            disabled={isPending}
                        >
                            Rechercher
                        </Button>
                    </div>

                    <Select
                        value={currentStateId}
                        onValueChange={handleStateFilter}
                    >
                        <SelectTrigger className="w-full sm:w-[200px] bg-gray-800 border-gray-700 text-gray-200">
                            <SelectValue placeholder="Filtrer par état" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-700">
                            <SelectItem value="all" className="text-gray-200">Tous les états</SelectItem>
                            {availableStatuses.map((status) => (
                                <SelectItem key={status.id} value={status.id.toString()} className="text-gray-200">
                                    {status.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Loading Overlay */}
                {isPending && (
                    <div className="relative">
                        <div className="absolute inset-0 bg-gray-900/50 flex items-center justify-center z-10 rounded-lg">
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                                <p className="text-sm text-gray-300">Chargement...</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Bills Table */}
                <div className="relative">
                    {initialBills.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-gray-400 text-lg">Aucune facture trouvée</p>
                        </div>
                    ) : (
                        <div className={`border border-gray-800 rounded-lg overflow-hidden ${isPending ? 'opacity-50' : ''}`}>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-gray-800 border-b border-gray-700 hover:bg-gray-800">
                                            <TableHead className="text-gray-200 font-medium">ID</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Client</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Date de création</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Date d&apos;émission</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Date de paiement</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Montant</TableHead>
                                            <TableHead className="text-gray-200 font-medium">État</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {initialBills.map((bill) => (
                                            <TableRow
                                                key={bill.id}
                                                className="border-b border-gray-700 hover:bg-gray-750 cursor-pointer"
                                            >
                                                <TableCell className="font-medium text-gray-200">
                                                    #{bill.id}
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    <div>
                                                        <div className="font-medium">{bill.client.name || 'N/A'}</div>
                                                        <div className="text-sm text-gray-400">
                                                            {bill.client.email}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    {formatDate(bill.creationDate)}
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    {formatDate(bill.issueDate)}
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    {formatDate(bill.paymentDate)}
                                                </TableCell>
                                                <TableCell className="text-gray-200 font-semibold">
                                                    {formatCurrency(bill.invoiceAmount)}
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStateColor(bill.state.name)}`}>
                                                        {bill.state.name}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Enhanced Pagination */}
                {totalPages > 1 && (
                    <div className={`flex justify-center items-center gap-2 mt-6 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
                        <Button
                            size="sm"
                            className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                            onClick={() => handlePageChange(1)}
                            disabled={currentPage === 1 || isPending}
                        >
                            {'<<'}
                        </Button>
                        <Button
                            size="sm"
                            className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1 || isPending}
                        >
                            {'<'}
                        </Button>
                        {visiblePages.map((page, index) => (
                            typeof page === 'number' ? (
                                <Button
                                    key={index}
                                    variant={currentPage === page ? "default" : "outline"}
                                    size="sm"
                                    className={currentPage === page
                                        ? "bg-blue-600 text-white hover:bg-blue-700"
                                        : "bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"}
                                    onClick={() => handlePageChange(page)}
                                    disabled={isPending}
                                >
                                    {page}
                                </Button>
                            ) : (
                                <span key={index} className="text-gray-400 px-2">{page}</span>
                            )
                        ))}
                        <Button
                            size="sm"
                            className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages || isPending}
                        >
                            {'>'}
                        </Button>
                        <Button
                            size="sm"
                            className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                            onClick={() => handlePageChange(totalPages)}
                            disabled={currentPage === totalPages || isPending}
                        >
                            {'>>'}
                        </Button>
                    </div>
                )}

                {totalPages > 1 && (
                    <p className="text-center text-sm text-gray-400 mt-2">
                        Page {currentPage} sur {totalPages}
                    </p>
                )}
            </CardContent>

            {/* Add Bill Dialog */}
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">
                    <DialogHeader>
                        <DialogTitle className="text-gray-100">Créer une nouvelle facture</DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto px-1">
                        {/* Add your AddBillForm component here */}
                        <p className="text-gray-400">Formulaire de création de facture à venir...</p>
                    </div>
                </DialogContent>
            </Dialog>
        </Card>
    );
}