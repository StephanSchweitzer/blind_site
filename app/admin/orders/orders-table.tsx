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
import { AddOrderFormBackend } from '@/admin/OrderFormBackendBase';
import { EditOrderModal } from '@/admin/EditOrderModal';
import { OrderFormData } from '@/admin/OrderFormBackendBase';
import { useToast } from '@/hooks/use-toast';

interface User {
    id: number;
    name: string | null;
    email: string;
}

interface Book {
    id: number;
    title: string;
    author: string;
}

type OrderWithRelations = {
    id: number;
    requestReceivedDate: string;
    createdDate: Date | null;
    closureDate: string | null;
    cost: number | null;
    billingStatus: string;
    deliveryMethod: string;
    lentPhysicalBook: boolean;
    isDuplication: boolean;
    notes: string | null;
    statusId: number;
    mediaFormatId: number;
    processedByStaffId: number | null;
    aveugleId: number;
    catalogueId: number;
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
    const { toast } = useToast();

    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isLoadingOrder, setIsLoadingOrder] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<{
        id: string;
        data: OrderFormData;
        selectedUser: User;
        selectedBook: Book;
        selectedStaff: User | null;
    } | null>(null);

    const currentPage = initialPage;
    const currentBillingStatus = searchParams.get('billingStatus') || 'all';
    const currentStatusId = searchParams.get('statusId') || 'all';
    const currentIsDuplication = searchParams.get('isDuplication') || 'all';
    const currentRetard = searchParams.get('retard') || 'all';

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

    const handleOrderEdited = (orderId: number) => {
        console.log('Order edited:', orderId);
        setIsEditModalOpen(false);
        setSelectedOrder(null);
        router.refresh();
    };

    const handleOrderDeleted = (orderId: number) => {
        console.log('Order deleted:', orderId);
        setIsEditModalOpen(false);
        setSelectedOrder(null);
        router.refresh();
    };

    const handleRowClick = async (order: OrderWithRelations) => {
        setIsLoadingOrder(true);

        try {
            // Pre-fetch all required data
            const [userResponse, bookResponse, staffResponse] = await Promise.all([
                fetch(`/api/user/${order.aveugleId}`),
                fetch(`/api/books/${order.catalogueId}`),
                order.processedByStaffId
                    ? fetch(`/api/user/${order.processedByStaffId}`)
                    : Promise.resolve(null),
            ]);

            // Check if requests were successful
            if (!userResponse.ok || !bookResponse.ok) {
                throw new Error('Échec du chargement des données');
            }

            // Parse the JSON responses
            const userData = await userResponse.json();
            const bookData = await bookResponse.json();
            const staffData = staffResponse ? await staffResponse.json() : null;

            // Validate that we actually received the data
            if (!userData || !bookData) {
                throw new Error('Données incomplètes reçues');
            }

            // Validate staff data if needed
            if (order.processedByStaffId && staffResponse && !staffResponse.ok) {
                console.warn('Failed to load staff data, but continuing anyway');
            }

            // Transform the order data to OrderFormData format
            const formData: OrderFormData = {
                aveugleId: order.aveugleId,
                catalogueId: order.catalogueId,
                requestReceivedDate: new Date(order.requestReceivedDate),
                statusId: order.statusId,
                isDuplication: order.isDuplication,
                mediaFormatId: order.mediaFormatId,
                deliveryMethod: order.deliveryMethod as 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE',
                processedByStaffId: order.processedByStaffId,
                createdDate: order.createdDate ? new Date(order.createdDate) : null,
                closureDate: order.closureDate ? new Date(order.closureDate) : null,
                cost: order.cost?.toString() || '0.00',
                billingStatus: order.billingStatus as 'UNBILLED' | 'BILLED' | 'PAID',
                lentPhysicalBook: order.lentPhysicalBook,
                notes: order.notes || '',
            };

            setSelectedOrder({
                id: order.id.toString(),
                data: formData,
                selectedUser: userData,
                selectedBook: bookData,
                selectedStaff: staffData,
            });

            // Open modal only after all data is ready and validated
            setIsEditModalOpen(true);
        } catch (error) {
            console.error('Error loading order:', error);
            toast({
                variant: "destructive",
                title: "Erreur",
                description: "Erreur lors du chargement de la demande. Veuillez réessayer.",
            });
        } finally {
            setIsLoadingOrder(false);
        }
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
            'Demande terminée': 'Terminée',
            'En attente de validation': 'À valider',
            'Demande annulée': 'Annulée',
        };
        return displayMap[statusName] || statusName;
    };

    // Check if an order is overdue (>3 months old and statusId is not 3)
    const isOrderOverdue = (order: OrderWithRelations) => {
        // statusId 3 means completed - never overdue
        if (order.statusId === 3) {
            return false;
        }

        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const orderDate = new Date(order.requestReceivedDate);
        return orderDate < threeMonthsAgo;
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
            end = Math.min(maxVisible, totalPages - 1);
        }
        if (currentPage >= totalPages - 2) {
            start = Math.max(2, totalPages - maxVisible + 1);
        }

        if (start > 2) {
            pages.push('...');
        }

        for (let i = start; i <= end; i++) {
            pages.push(i);
        }

        if (end < totalPages - 1) {
            pages.push('...');
        }

        if (totalPages > 1) {
            pages.push(totalPages);
        }

        return pages;
    };

    const visiblePages = getVisiblePages();

    return (
        <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-2xl text-gray-100">Demandes</CardTitle>
                        <CardDescription className="text-gray-400">
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

            <CardContent className="space-y-6">
                {/* Search and Filters */}
                <div className="space-y-4">
                    {/* Search Bar */}
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                            <Input
                                placeholder="Rechercher par client, livre, ou email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                className="pl-10 bg-gray-800 border-gray-700 text-gray-200 placeholder-gray-400"
                            />
                        </div>
                        {searchTerm && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleClearSearch}
                                className="text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                        <Button
                            onClick={handleSearch}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            disabled={isPending}
                        >
                            Rechercher
                        </Button>
                    </div>

                    {/* Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="text-sm text-gray-400 mb-1.5 block">Statut de la demande</label>
                            <Select
                                value={currentStatusId}
                                onValueChange={(value) => handleFilterChange('statusId', value)}
                            >
                                <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-800 border-gray-700">
                                    <SelectItem value="all" className="text-gray-200">Tous les statuts</SelectItem>
                                    {availableStatuses.map((status) => (
                                        <SelectItem
                                            key={status.id}
                                            value={status.id.toString()}
                                            className="text-gray-200"
                                        >
                                            {status.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-sm text-gray-400 mb-1.5 block">Facturation</label>
                            <Select
                                value={currentBillingStatus}
                                onValueChange={(value) => handleFilterChange('billingStatus', value)}
                            >
                                <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-800 border-gray-700">
                                    <SelectItem value="all" className="text-gray-200">Tous</SelectItem>
                                    <SelectItem value="UNBILLED" className="text-gray-200">Non facturé</SelectItem>
                                    <SelectItem value="BILLED" className="text-gray-200">Facturé</SelectItem>
                                    <SelectItem value="PAID" className="text-gray-200">Payé</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-sm text-gray-400 mb-1.5 block">Type</label>
                            <Select
                                value={currentIsDuplication}
                                onValueChange={(value) => handleFilterChange('isDuplication', value)}
                            >
                                <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-800 border-gray-700">
                                    <SelectItem value="all" className="text-gray-200">Tous</SelectItem>
                                    <SelectItem value="true" className="text-gray-200">Duplication</SelectItem>
                                    <SelectItem value="false" className="text-gray-200">Enregistrement</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-sm text-gray-400 mb-1.5 block">Retard</label>
                            <Select
                                value={currentRetard}
                                onValueChange={(value) => handleFilterChange('retard', value)}
                            >
                                <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-800 border-gray-700">
                                    <SelectItem value="all" className="text-gray-200">Tous</SelectItem>
                                    <SelectItem value="true" className="text-gray-200">En retard</SelectItem>
                                    <SelectItem value="false" className="text-gray-200">À jour</SelectItem>
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
                            <p className="text-gray-400 text-lg">Aucune demande trouvée</p>
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
                                        {initialOrders.map((order) => {
                                            const isOverdue = isOrderOverdue(order);
                                            return (
                                                <TableRow
                                                    key={order.id}
                                                    onClick={() => handleRowClick(order)}
                                                    className={`border-b border-gray-700 hover:bg-gray-800 cursor-pointer transition-colors ${
                                                        isOverdue ? 'bg-red-950/30 hover:bg-red-950/40' : ''
                                                    }`}
                                                >
                                                    <TableCell className={`font-medium ${isOverdue ? 'text-red-300' : 'text-gray-200'}`}>
                                                        #{order.id}
                                                    </TableCell>
                                                    <TableCell className={isOverdue ? 'text-red-200' : 'text-gray-200'}>
                                                        <div>
                                                            <div className="font-medium">
                                                                {order.aveugle.name || order.aveugle.email}
                                                            </div>
                                                            {order.aveugle.name && (
                                                                <div className={`text-sm ${isOverdue ? 'text-red-300' : 'text-gray-400'}`}>
                                                                    {order.aveugle.email}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className={isOverdue ? 'text-red-200' : 'text-gray-200'}>
                                                        <div>
                                                            <div className="font-medium">{order.catalogue.title}</div>
                                                            <div className={`text-sm ${isOverdue ? 'text-red-300' : 'text-gray-400'}`}>
                                                                {order.catalogue.author}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className={isOverdue ? 'text-red-200' : 'text-gray-200'}>
                                                        {formatDate(order.requestReceivedDate)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                                            isOverdue
                                                                ? 'bg-red-200 text-red-900'
                                                                : 'bg-blue-100 text-blue-800'
                                                        }`}>
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
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    {/* Loading Overlay for Order Data */}
                    {isLoadingOrder && (
                        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50">
                            <div className="bg-gray-800 rounded-lg p-8 shadow-2xl border border-gray-700">
                                <div className="flex flex-col items-center gap-4">
                                    <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
                                    <p className="text-lg font-medium text-gray-200">Chargement de la demande...</p>
                                </div>
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

            {/* Add Order Dialog */}
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">
                    <DialogHeader>
                        <DialogTitle className="text-gray-100">Ajouter une nouvelle demande</DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto px-1">
                        <AddOrderFormBackend onSuccess={handleOrderAdded} />
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Order Modal */}
            {selectedOrder && (
                <EditOrderModal
                    isOpen={isEditModalOpen}
                    onOpenChange={setIsEditModalOpen}
                    orderId={selectedOrder.id}
                    initialData={selectedOrder.data}
                    onOrderEdited={handleOrderEdited}
                    onOrderDeleted={handleOrderDeleted}
                    initialSelectedUser={selectedOrder.selectedUser}
                    initialSelectedBook={selectedOrder.selectedBook}
                    initialSelectedStaff={selectedOrder.selectedStaff}
                />
            )}
        </Card>
    );
}