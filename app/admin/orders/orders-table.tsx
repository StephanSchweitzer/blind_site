'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Search, X, Plus, Loader2 } from 'lucide-react';
import { AddOrderForm } from './components/AddOrderForm';

type OrderWithRelations = {
    id: number;
    requestReceivedDate: string;
    closureDate: string | null;
    cost: number | null;
    billingStatus: string;
    deliveryMethod: string;
    lentPhysicalBook: boolean;
    aveugle: {
        name: string | null;
        email: string | null;
    };
    catalogue: {
        title: string;
        author: string;
    };
    status: {
        name: string;
    };
    mediaFormat: {
        name: string;
    };
};

type OrdersTableProps = {
    initialOrders: OrderWithRelations[];
    initialPage: number;
    initialSearch: string;
    totalPages: number;
    availableStatuses: { id: number; name: string }[];
    initialTotalOrders: number;
};

export default function OrdersTable({
                                        initialOrders,
                                        initialPage,
                                        initialSearch,
                                        totalPages,
                                        availableStatuses,
                                    }: OrdersTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const currentPage = initialPage;
    const currentBillingStatus = searchParams.get('billingStatus') || 'all';
    const currentStatusId = searchParams.get('statusId') || 'all';
    const currentIsDuplication = searchParams.get('isDuplication') || 'all';

    const createQueryString = useCallback(
        (updates: Record<string, string>) => {
            const params = new URLSearchParams(searchParams);
            Object.entries(updates).forEach(([key, value]) => {
                if (value === 'all' || value === '') {
                    params.delete(key);
                } else {
                    params.set(key, value);
                }
            });
            // Reset to page 1 when filters change
            if (!updates.page) {
                params.set('page', '1');
            }
            return params.toString();
        },
        [searchParams]
    );

    const handleSearch = () => {
        const queryString = createQueryString({ search: searchTerm });
        startTransition(() => {
            router.push(`?${queryString}`);
        });
    };

    const handleClearSearch = () => {
        setSearchTerm('');
        const queryString = createQueryString({ search: '' });
        startTransition(() => {
            router.push(`?${queryString}`);
        });
    };

    const handleFilterChange = (filterType: string, value: string) => {
        const queryString = createQueryString({ [filterType]: value });
        startTransition(() => {
            router.push(`?${queryString}`);
        });
    };

    const handlePageChange = (page: number) => {
        const queryString = createQueryString({ page: page.toString() });
        startTransition(() => {
            router.push(`?${queryString}`);
        });
    };

    const handleOrderAdded = () => {
        setIsAddModalOpen(false);
        router.refresh();
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('fr-FR');
    };

    const getBillingStatusLabel = (status: string) => {
        const labels: Record<string, string> = {
            UNBILLED: 'Non facturé',
            BILLED: 'Facturé',
            PAID: 'Payé',
        };
        return labels[status] || status;
    };

    const getStatusDisplayName = (statusName: string) => {
        const displayMap: Record<string, string> = {
            'Attente envoi vers lecteur': 'À envoyer',
            'En cours de traitement': 'En cours',
            'Commande terminée': 'Terminée',
            'En attente de validation': 'À valider',
            'Commande annulée': 'Annulée',
        };
        return displayMap[statusName] || statusName;
    };

    // Calculate visible pages (similar to books table)
    const getVisiblePages = () => {
        const pages: (number | string)[] = [];
        const maxVisible = 5;

        if (totalPages <= maxVisible + 2) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }

        pages.push(1);

        let start = Math.max(2, currentPage - 1);
        let end = Math.min(totalPages - 1, currentPage + 1);

        if (currentPage <= 3) {
            end = maxVisible - 1;
        } else if (currentPage >= totalPages - 2) {
            start = totalPages - maxVisible + 2;
        }

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
            <CardHeader className="border-b border-gray-800">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-2xl text-gray-100">Demandes</CardTitle>
                        <CardDescription className="text-gray-400 mt-1">
                            Gérer et suivre toutes les demandes
                        </CardDescription>
                    </div>
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Nouvelle demande
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="p-6">
                {/* Search and Filters */}
                <div className="mb-6 space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                type="text"
                                placeholder="Rechercher par client, livre..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                className="pl-10 bg-gray-800 border-gray-700 text-gray-200 placeholder:text-gray-500"
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
                            className="bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0"
                            disabled={isPending}
                        >
                            {isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Recherche...
                                </>
                            ) : (
                                <>
                                    <Search className="h-4 w-4 mr-2" />
                                    Rechercher
                                </>
                            )}
                        </Button>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {/*<div className="flex flex-col gap-1">*/}
                        {/*    <label className="text-xs text-gray-400 px-1">Urgency or something</label>*/}
                        {/*    <Select*/}
                        {/*        value={currentFilter}*/}
                        {/*        onValueChange={(value) => handleFilterChange('filter', value)}*/}
                        {/*        disabled={isPending}*/}
                        {/*    >*/}
                        {/*        <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200 w-[200px] flex-shrink-0">*/}
                        {/*            <SelectValue placeholder="Filtrer par" />*/}
                        {/*        </SelectTrigger>*/}
                        {/*        <SelectContent className="bg-gray-800 border-gray-700">*/}
                        {/*            <SelectItem value="all" className="text-gray-200">Toutes</SelectItem>*/}
                        {/*            <SelectItem value="needsReturn" className="text-gray-200">*/}
                        {/*                À retourner*/}
                        {/*            </SelectItem>*/}
                        {/*            <SelectItem value="late" className="text-gray-200">*/}
                        {/*                En retard*/}
                        {/*            </SelectItem>*/}
                        {/*        </SelectContent>*/}
                        {/*    </Select>*/}
                        {/*</div>*/}

                        {/* Type de demande */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-400 px-1">Type de demande</label>
                            <Select
                                value={currentIsDuplication}
                                onValueChange={(value) => handleFilterChange('isDuplication', value)}
                                disabled={isPending}
                            >
                                <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200 w-[200px] flex-shrink-0">
                                    <SelectValue placeholder="Type de demande" />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-800 border-gray-700">
                                    <SelectItem value="all" className="text-gray-200">Tous les types</SelectItem>
                                    <SelectItem value="true" className="text-gray-200">Duplications</SelectItem>
                                    <SelectItem value="false" className="text-gray-200">Livres à sauvegarder</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Statut de la demande */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-400 px-1">Statut de la demande</label>
                            <Select
                                value={currentStatusId}
                                onValueChange={(value) => handleFilterChange('statusId', value)}
                                disabled={isPending}
                            >
                                <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200 w-[200px] flex-shrink-0">
                                    <SelectValue placeholder="Statut" />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-800 border-gray-700">
                                    <SelectItem value="all" className="text-gray-200">Tous les statuts</SelectItem>
                                    {availableStatuses.map((status) => (
                                        <SelectItem
                                            key={status.id}
                                            value={status.id.toString()}
                                            className="text-gray-200"
                                        >
                                            {getStatusDisplayName(status.name)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* État de facturation */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-400 px-1">État de facturation</label>
                            <Select
                                value={currentBillingStatus}
                                onValueChange={(value) => handleFilterChange('billingStatus', value)}
                                disabled={isPending}
                            >
                                <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200 w-[200px] flex-shrink-0">
                                    <SelectValue placeholder="État de facturation" />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-800 border-gray-700">
                                    <SelectItem value="all" className="text-gray-200">Tous</SelectItem>
                                    <SelectItem value="UNBILLED" className="text-gray-200">Non facturé</SelectItem>
                                    <SelectItem value="BILLED" className="text-gray-200">Facturé</SelectItem>
                                    <SelectItem value="PAID" className="text-gray-200">Payé</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
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

                {/* Orders Table */}
                <div className="relative">
                    {initialOrders.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-gray-400 text-lg">Aucune commande trouvée</p>
                        </div>
                    ) : (
                        <div className={`border border-gray-800 rounded-lg overflow-hidden ${isPending ? 'opacity-50' : ''}`}>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-gray-800 border-b border-gray-700 hover:bg-gray-800">
                                            <TableHead className="text-gray-200 font-medium">ID</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Client</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Livre</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Date demande</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Statut</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Facturation</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {initialOrders.map((order) => (
                                            <TableRow
                                                key={order.id}
                                                className="border-b border-gray-700 hover:bg-gray-750 cursor-pointer"
                                            >
                                                <TableCell className="font-medium text-gray-200">
                                                    #{order.id}
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    <div>
                                                        <div className="font-medium">
                                                            {order.aveugle.name || order.aveugle.email}
                                                        </div>
                                                        {order.aveugle.name && (
                                                            <div className="text-sm text-gray-400">
                                                                {order.aveugle.email}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    <div>
                                                        <div className="font-medium">{order.catalogue.title}</div>
                                                        <div className="text-sm text-gray-400">
                                                            {order.catalogue.author}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    {formatDate(order.requestReceivedDate)}
                                                </TableCell>
                                                <TableCell>
                                                    <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800">
                                                        {getStatusDisplayName(order.status.name)}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <span
                                                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                                            order.billingStatus === 'PAID'
                                                                ? 'bg-green-100 text-green-800'
                                                                : order.billingStatus === 'BILLED'
                                                                    ? 'bg-yellow-100 text-yellow-800'
                                                                    : 'bg-gray-100 text-gray-800'
                                                        }`}
                                                    >
                                                        {getBillingStatusLabel(order.billingStatus)}
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
                            className="bg-gray-800 text-gray-700 hover:bg-gray-700"
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

            {/* Add Order Dialog */}
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">
                    <DialogHeader>
                        <DialogTitle className="text-gray-100">Ajouter une nouvelle demande</DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto px-1">
                        <AddOrderForm onSuccess={handleOrderAdded} />
                    </div>
                </DialogContent>
            </Dialog>
        </Card>
    );
}