'use client';

import { useState, useCallback } from 'react';
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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Search, X } from 'lucide-react';

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
        email: string;
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
                                        initialTotalOrders,
                                    }: OrdersTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const currentPage = initialPage;
    const currentFilter = searchParams.get('filter') || 'all';
    const currentBillingStatus = searchParams.get('billingStatus') || 'all';
    const currentStatusId = searchParams.get('statusId') || 'all';

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
        router.push(`?${queryString}`);
    };

    const handleClearSearch = () => {
        setSearchTerm('');
        const queryString = createQueryString({ search: '' });
        router.push(`?${queryString}`);
    };

    const handleFilterChange = (filterType: string, value: string) => {
        const queryString = createQueryString({ [filterType]: value });
        router.push(`?${queryString}`);
    };

    const handlePageChange = (page: number) => {
        const queryString = createQueryString({ page: page.toString() });
        router.push(`?${queryString}`);
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
            <CardHeader className="border-b border-gray-800 pb-6">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-gray-100 text-2xl">Commandes</CardTitle>
                        <CardDescription className="text-gray-400 mt-1">
                            Gérer et suivre toutes les commandes
                        </CardDescription>
                    </div>
                    <p className="text-sm text-gray-400">
                        {initialTotalOrders} commande{initialTotalOrders !== 1 ? 's' : ''} au total
                    </p>
                </div>
            </CardHeader>

            <CardContent className="pt-6">
                {/* Search and Filters */}
                <div className="space-y-4 mb-6">
                    {/* Search Bar */}
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Input
                                placeholder="Rechercher par client ou livre..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleSearch();
                                    }
                                }}
                                className="pr-8 bg-gray-800 border-gray-700 text-gray-200 placeholder:text-gray-500"
                            />
                            {searchTerm && (
                                <button
                                    onClick={handleClearSearch}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        <Button
                            onClick={handleSearch}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            <Search className="h-4 w-4 mr-2" />
                            Rechercher
                        </Button>
                    </div>

                    {/* Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Select
                            value={currentFilter}
                            onValueChange={(value) => handleFilterChange('filter', value)}
                        >
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                                <SelectValue placeholder="Filtres spéciaux" />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-700">
                                <SelectItem value="all" className="text-gray-200">Toutes les commandes</SelectItem>
                                <SelectItem value="needsReturn" className="text-gray-200">À retourner</SelectItem>
                                <SelectItem value="late" className="text-gray-200">En retard</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select
                            value={currentStatusId}
                            onValueChange={(value) => handleFilterChange('statusId', value)}
                        >
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                                <SelectValue placeholder="Statut" />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-700">
                                <SelectItem value="all" className="text-gray-200">Tous les statuts</SelectItem>
                                {availableStatuses.map((status) => (
                                    <SelectItem key={status.id} value={status.id.toString()} className="text-gray-200">
                                        {status.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={currentBillingStatus}
                            onValueChange={(value) => handleFilterChange('billingStatus', value)}
                        >
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
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

                {/* Orders Table */}
                {initialOrders.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-400 text-lg">Aucune commande trouvée</p>
                    </div>
                ) : (
                    <div className="border border-gray-800 rounded-lg overflow-hidden">
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

                {/* Enhanced Pagination */}
                {totalPages > 1 && (
                    <div className="flex justify-center items-center gap-2 mt-6">
                        <Button
                            size="sm"
                            className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                            onClick={() => handlePageChange(1)}
                            disabled={currentPage === 1}
                        >
                            {'<<'}
                        </Button>
                        <Button
                            size="sm"
                            className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
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
                            disabled={currentPage === totalPages}
                        >
                            {'>'}
                        </Button>
                        <Button
                            size="sm"
                            className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                            onClick={() => handlePageChange(totalPages)}
                            disabled={currentPage === totalPages}
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
        </Card>
    );
}