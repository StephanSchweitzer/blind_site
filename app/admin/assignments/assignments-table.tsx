// app/admin/assignments/assignments-table.tsx
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
import { AddAssignmentFormBackend } from '@/admin/AssignmentFormBackendBase';
import { EditAssignmentModal } from '@/admin/EditAssignmentModal';
import { AssignmentFormData } from '@/admin/AssignmentFormBackendBase';
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

interface Order {
    id: number;
}

interface Assignment {
    id: number;
    readerId: number;
    catalogueId: number;
    orderId: number | null;
    receptionDate: string | null;
    sentToReaderDate: string | null;
    returnedToECADate: string | null;
    statusId: number;
    notes: string | null;
    reader: {
        name: string | null;
        email: string | null;
    };
    catalogue: {
        title: string;
        author: string;
    };
    order: {
        id: number;
    } | null;
    status: {
        name: string;
    };
}

interface Status {
    id: number;
    name: string;
}

interface AssignmentsTableProps {
    initialAssignments: Assignment[];
    initialPage: number;
    initialSearch: string;
    totalPages: number;
    availableStatuses: Status[];
    initialTotalAssignments: number;
}

export default function AssignmentsTable({
                                             initialAssignments,
                                             initialPage,
                                             initialSearch,
                                             totalPages,
                                             availableStatuses,
                                             initialTotalAssignments,
                                         }: AssignmentsTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isLoadingAssignment, setIsLoadingAssignment] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState<{
        id: string;
        data: AssignmentFormData;
        selectedReader: User;
        selectedBook: Book;
        selectedOrder: Order | null;
    } | null>(null);

    const currentPage = initialPage;
    const currentStatusId = searchParams.get('statusId') || 'all';

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

    const handleStatusFilter = (statusId: string) => {
        updateUrl({
            statusId: statusId === 'all' ? undefined : statusId,
            page: '1',
        });
    };

    const handleAssignmentAdded = () => {
        setIsAddModalOpen(false);
        router.refresh();
    };

    const handleAssignmentEdited = (assignmentId: number) => {
        console.log('Assignment edited:', assignmentId);
        setIsEditModalOpen(false);
        setSelectedAssignment(null);
        router.refresh();
    };

    const handleAssignmentDeleted = (assignmentId: number) => {
        console.log('Assignment deleted:', assignmentId);
        setIsEditModalOpen(false);
        setSelectedAssignment(null);
        router.refresh();

        toast({
            // @ts-expect-error jsx in toast
            title: <span className="text-2xl font-bold">Succès</span>,
            description: <span className="text-xl mt-2">L&apos;affectation a été supprimée</span>,
            className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
        });
    };

    const handleRowClick = async (assignment: Assignment) => {
        setIsLoadingAssignment(true);
        console.log('Fetching assignment details for ID:', assignment.id);

        try {
            const response = await fetch(`/api/assignments/${assignment.id}`);

            if (!response.ok) {
                throw new Error('Failed to fetch assignment details');
            }

            const assignmentData = await response.json();
            console.log('Fetched assignment data:', assignmentData);

            // Convert the assignment data to the form format
            const formData: AssignmentFormData = {
                readerId: assignmentData.readerId,
                catalogueId: assignmentData.catalogueId,
                orderId: assignmentData.orderId,
                receptionDate: assignmentData.receptionDate ? new Date(assignmentData.receptionDate) : null,
                sentToReaderDate: assignmentData.sentToReaderDate ? new Date(assignmentData.sentToReaderDate) : null,
                returnedToECADate: assignmentData.returnedToECADate ? new Date(assignmentData.returnedToECADate) : null,
                statusId: assignmentData.statusId,
                notes: assignmentData.notes || '',
            };

            const selectedReader: User = {
                id: assignmentData.reader.id,
                name: assignmentData.reader.name,
                email: assignmentData.reader.email,
            };

            const selectedBook: Book = {
                id: assignmentData.catalogue.id,
                title: assignmentData.catalogue.title,
                author: assignmentData.catalogue.author,
            };

            const selectedOrder: Order | null = assignmentData.order ? {
                id: assignmentData.order.id,
            } : null;

            setSelectedAssignment({
                id: assignment.id.toString(),
                data: formData,
                selectedReader,
                selectedBook,
                selectedOrder,
            });

            console.log('Opening edit modal');
            setIsEditModalOpen(true);
        } catch (error) {
            console.error('Error fetching assignment details:', error);
            toast({
                variant: "destructive",
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Erreur</span>,
                description: <span className="text-xl mt-2">Impossible de charger les détails de l&apos;affectation</span>,
                className: "bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6"
            });
        } finally {
            setIsLoadingAssignment(false);
        }
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('fr-FR');
    };

    const getStatusDisplayName = (statusName: string) => {
        const displayMap: Record<string, string> = {
            'Attente envoi vers lecteur': 'Attente envoie',
            'En attente de réception': 'En attente',
            'Réceptionné': 'Réceptionné',
            'Envoyé au lecteur': 'Envoyé',
            'Chez le lecteur': 'Chez lecteur',
            'Retourné à l\'ECA': 'Retourné',
            'Assignation terminée': 'Terminée',
            'Assignation annulée': 'Annulée',
        };
        return displayMap[statusName] || statusName;
    };

    const getStatusColor = (statusName: string) => {
        const colorMap: Record<string, string> = {
            'Pending': 'bg-yellow-100 text-yellow-800',
            'In Progress': 'bg-blue-100 text-blue-800',
            'Completed': 'bg-green-100 text-green-800',
            'Cancelled': 'bg-red-100 text-red-800',
        };
        return colorMap[statusName] || 'bg-gray-100 text-gray-800';
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
        <Card className="bg-gray-900 border-gray-700">
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle className="text-gray-100">Affectations</CardTitle>
                        <CardDescription className="text-gray-400">
                            Gérer les affectations de livres aux lecteurs ({initialTotalAssignments} total)
                        </CardDescription>
                    </div>
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={isPending}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        Nouvelle affectation
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Search and Filters */}
                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 flex gap-2">
                        <Input
                            placeholder="Rechercher par lecteur, livre..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className="bg-gray-800 border-gray-700 text-gray-200"
                            disabled={isPending}
                        />
                        <Button
                            onClick={handleSearch}
                            variant="outline"
                            className="bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                            disabled={isPending}
                        >
                            <Search className="h-4 w-4" />
                        </Button>
                        {searchTerm && (
                            <Button
                                onClick={handleClearSearch}
                                variant="outline"
                                className="bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                                disabled={isPending}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>

                    <Select
                        value={currentStatusId}
                        onValueChange={handleStatusFilter}
                    >
                        <SelectTrigger className="w-full sm:w-[200px] bg-gray-800 border-gray-700 text-gray-200">
                            <SelectValue placeholder="Filtrer par statut" />
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

                {/* Assignments Table */}
                <div className="relative">
                    {initialAssignments.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-gray-400 text-lg">Aucune assignation trouvée</p>
                        </div>
                    ) : (
                        <div className={`border border-gray-800 rounded-lg overflow-hidden ${isPending ? 'opacity-50' : ''}`}>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-gray-800 border-b border-gray-700 hover:bg-gray-800">
                                            <TableHead className="text-gray-200 font-medium">ID</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Lecteur</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Livre</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Date de réception</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Envoyé au lecteur</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Retourné aux ECA</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Statut</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {initialAssignments.map((assignment) => (
                                            <TableRow
                                                key={assignment.id}
                                                onClick={() => handleRowClick(assignment)}
                                                className="border-b border-gray-700 hover:bg-gray-800 cursor-pointer transition-colors"
                                            >
                                                <TableCell className="font-medium text-gray-200">
                                                    #{assignment.id}
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    <div>
                                                        <div className="font-medium">{assignment.reader.name}</div>
                                                        <div className="text-sm text-gray-400">
                                                            {assignment.reader.email}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    <div>
                                                        <div className="font-medium">{assignment.catalogue.title}</div>
                                                        <div className="text-sm text-gray-400">
                                                            {assignment.catalogue.author}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    {formatDate(assignment.receptionDate)}
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    {formatDate(assignment.sentToReaderDate)}
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    {formatDate(assignment.returnedToECADate)}
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(assignment.status.name)}`}>
                                                        {getStatusDisplayName(assignment.status.name)}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    {/* Loading Overlay for Assignment Data */}
                    {isLoadingAssignment && (
                        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50">
                            <div className="bg-gray-800 rounded-lg p-8 shadow-2xl border border-gray-700">
                                <div className="flex flex-col items-center gap-4">
                                    <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
                                    <p className="text-lg font-medium text-gray-200">Chargement de l&apos;affectation...</p>
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

            {/* Add Assignment Dialog */}
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">
                    <DialogHeader>
                        <DialogTitle className="text-gray-100">Ajouter une nouvelle affectation</DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto px-1">
                        <AddAssignmentFormBackend onSuccess={handleAssignmentAdded} />
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Assignment Modal */}
            {selectedAssignment && (
                <EditAssignmentModal
                    isOpen={isEditModalOpen}
                    onOpenChange={setIsEditModalOpen}
                    assignmentId={selectedAssignment.id}
                    initialData={selectedAssignment.data}
                    onAssignmentEdited={handleAssignmentEdited}
                    onAssignmentDeleted={handleAssignmentDeleted}
                    initialSelectedReader={selectedAssignment.selectedReader}
                    initialSelectedBook={selectedAssignment.selectedBook}
                    initialSelectedOrder={selectedAssignment.selectedOrder}
                />
            )}
        </Card>
    );
}