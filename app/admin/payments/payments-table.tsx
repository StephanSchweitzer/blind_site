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
import {
    PaymentType,
    PaymentMethod,
    PAYMENT_TYPE_LABELS,
    PAYMENT_METHOD_LABELS,
    getPaymentTypeColor,
    getPaymentTypeLabel,
    getPaymentMethodLabel,
} from '@/lib/payment-enums';
import { AddPaymentFormBackend } from '@/admin/PaymentFormBackendBase';
import { EditPaymentModal } from '@/admin/EditPaymentModal';
import { DeletePaymentModal } from '@/admin/DeletePaymentModal';

interface Payment {
    id: number;
    clientId: number | null;
    type: PaymentType;
    amount: string;
    paymentMethod: PaymentMethod | null;
    creationDate: string;
    issueDate: string | null;
    paymentDate: string | null;
    client: {
        name: string | null;
        email: string | null;
    } | null;
}

interface PaymentsTableProps {
    initialPayments: Payment[];
    initialPage: number;
    initialSearch: string;
    totalPages: number;
    availableTypes: PaymentType[];
    availableMethods: PaymentMethod[];
    initialTotalPayments: number;
    hideSearch?: boolean;
    presetClient?: { id: number; name: string | null; firstName: string | null; lastName: string | null; email: string | null } | null;
}

export default function PaymentsTable({
                                          initialPayments,
                                          initialPage,
                                          initialSearch,
                                          totalPages,
                                          availableTypes,
                                          availableMethods,
                                          initialTotalPayments,
                                          hideSearch = false,
                                          presetClient = null,
                                      }: PaymentsTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [viewPaymentId, setViewPaymentId] = useState<number | null>(null);
    const [paymentToDelete, setPaymentToDelete] = useState<number | null>(null);

    const currentPage = initialPage;
    const currentType = searchParams.get('type') as PaymentType | null;
    const currentMethod = searchParams.get('paymentMethod') as PaymentMethod | null;

    const updateUrl = (updates: Record<string, string | undefined>) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(updates).forEach(([key, value]) => {
            if (value) params.set(key, value);
            else params.delete(key);
        });
        startTransition(() => {
            router.push(`?${params.toString()}`);
        });
    };

    const handleSearch = () => updateUrl({ search: searchTerm || undefined, page: '1' });
    const handleClearSearch = () => { setSearchTerm(''); updateUrl({ search: undefined, page: '1' }); };
    const handlePageChange = (newPage: number) => updateUrl({ page: newPage.toString() });
    const handleTypeFilter = (value: string) => updateUrl({ type: value === 'all' ? undefined : value, page: '1' });
    const handleMethodFilter = (value: string) => updateUrl({ paymentMethod: value === 'all' ? undefined : value, page: '1' });

    const handlePaymentAdded = () => { setIsAddModalOpen(false); router.refresh(); };
    const handlePaymentDeleted = () => { setPaymentToDelete(null); router.refresh(); };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('fr-FR');
    };

    const formatCurrency = (amount: string) =>
        new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(amount));

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
        for (let i = start; i <= end; i++) pages.push(i);
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
                        <CardTitle className="text-2xl font-bold text-gray-100">Paiements</CardTitle>
                        <CardDescription className="text-gray-400 mt-1">
                            {initialTotalPayments} paiement{initialTotalPayments > 1 ? 's' : ''} au total
                        </CardDescription>
                    </div>
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        Nouveau paiement
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="pt-6">
                {/* Search and Filter Section */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    {!hideSearch && (
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
                            <Button onClick={handleSearch} className="bg-blue-600 hover:bg-blue-700 text-white" disabled={isPending}>
                                Rechercher
                            </Button>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3">
                        <Select value={currentType ?? 'all'} onValueChange={handleTypeFilter}>
                            <SelectTrigger className="w-full sm:w-[170px] bg-gray-800 border-gray-700 text-gray-200">
                                <SelectValue placeholder="Filtrer par type" />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-700">
                                <SelectItem value="all" className="text-gray-200">Tous les types</SelectItem>
                                {availableTypes.map((t) => (
                                    <SelectItem key={t} value={t} className="text-gray-200">
                                        {PAYMENT_TYPE_LABELS[t]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={currentMethod ?? 'all'} onValueChange={handleMethodFilter}>
                            <SelectTrigger className="w-full sm:w-[170px] bg-gray-800 border-gray-700 text-gray-200">
                                <SelectValue placeholder="Filtrer par méthode" />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-700">
                                <SelectItem value="all" className="text-gray-200">Toutes les méthodes</SelectItem>
                                {availableMethods.map((m) => (
                                    <SelectItem key={m} value={m} className="text-gray-200">
                                        {PAYMENT_METHOD_LABELS[m]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
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

                {/* Payments Table */}
                <div className="relative">
                    {initialPayments.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-gray-400 text-lg">Aucun paiement trouvé</p>
                        </div>
                    ) : (
                        <div className={`border border-gray-800 rounded-lg overflow-hidden ${isPending ? 'opacity-50' : ''}`}>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-gray-800 border-b border-gray-700 hover:bg-gray-800">
                                            <TableHead className="text-gray-200 font-medium">ID</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Client</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Type</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Méthode</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Date de création</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Date de paiement</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Montant</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {initialPayments.map((payment) => (
                                            <TableRow
                                                key={payment.id}
                                                onClick={() => setViewPaymentId(payment.id)}
                                                className="border-b border-gray-700 cursor-pointer hover:bg-gray-750"
                                            >
                                                <TableCell className="font-medium text-gray-200">#{payment.id}</TableCell>
                                                <TableCell className="text-gray-200">
                                                    {payment.client ? (
                                                        <div>
                                                            <div className="font-medium">{payment.client.name || 'N/A'}</div>
                                                            <div className="text-sm text-gray-400">{payment.client.email}</div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-500 italic">Anonyme</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getPaymentTypeColor(payment.type)}`}>
                                                        {getPaymentTypeLabel(payment.type)}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    {getPaymentMethodLabel(payment.paymentMethod)}
                                                </TableCell>
                                                <TableCell className="text-gray-200">{formatDate(payment.creationDate)}</TableCell>
                                                <TableCell className="text-gray-200">{formatDate(payment.paymentDate)}</TableCell>
                                                <TableCell className="text-gray-200 font-semibold">{formatCurrency(payment.amount)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Pagination */}
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
                        {visiblePages.map((page, index) =>
                            typeof page === 'number' ? (
                                <Button
                                    key={index}
                                    variant={currentPage === page ? 'default' : 'outline'}
                                    size="sm"
                                    className={currentPage === page
                                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                                        : 'bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700'}
                                    onClick={() => handlePageChange(page)}
                                    disabled={isPending}
                                >
                                    {page}
                                </Button>
                            ) : (
                                <span key={index} className="text-gray-400 px-2">{page}</span>
                            )
                        )}
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

            {/* Add Payment Dialog */}
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">
                    <DialogHeader>
                        <DialogTitle className="text-gray-100">Créer un nouveau paiement</DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto px-1">
                        <AddPaymentFormBackend onSuccess={handlePaymentAdded} initialClient={presetClient} />
                    </div>
                </DialogContent>
            </Dialog>

            {/* View / Edit Payment Modal */}
            <EditPaymentModal
                isOpen={viewPaymentId !== null}
                onOpenChange={(open) => { if (!open) setViewPaymentId(null); }}
                paymentId={viewPaymentId}
                onRequestDelete={(id) => { setViewPaymentId(null); setPaymentToDelete(id); }}
                onPaymentUpdated={() => router.refresh()}
            />

            {/* Delete Payment Modal */}
            <DeletePaymentModal
                isOpen={paymentToDelete !== null}
                onOpenChange={(open) => { if (!open) setPaymentToDelete(null); }}
                paymentId={paymentToDelete}
                onPaymentDeleted={handlePaymentDeleted}
            />
        </Card>
    );
}