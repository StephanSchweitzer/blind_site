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
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Search, X, Plus, Loader2 } from 'lucide-react';
import { AddAssignmentModal } from '@/admin/AddAssignmentModal';
import { EditAssignmentModal } from '@/admin/EditAssignmentModal';
import { useToast } from '@/hooks/use-toast';
import {
    StatusSummary,
    AssignmentFormData,
    ReaderSummary,
    BookSummary,
    OrderSummary,
    AssignmentWithCurrentReader,
} from '@/types';

interface AssignmentsTableProps {
    initialAssignments: AssignmentWithCurrentReader[];
    initialPage: number;
    initialSearch: string;
    totalPages: number;
    availableStatuses: StatusSummary[];
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
        selectedReader: ReaderSummary | null;
        selectedBook: BookSummary;
        selectedOrder: OrderSummary | null;
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

    const handleRowClick = async (assignment: AssignmentWithCurrentReader) => {
        setIsLoadingAssignment(true);
        console.log('Fetching assignment details for ID:', assignment.id);

        try {
            const response = await fetch(`/api/assignments/${assignment.id}`);

            if (!response.ok) {
                throw new Error('Failed to fetch assignment details');
            }

            const assignmentData = await response.json();
            console.log('Fetched assignment data:', assignmentData);

            // Add this helper function
            const formatDateForForm = (date: string | Date | null | undefined): string | null => {
                if (!date) return null;
                if (typeof date === 'string') {
                    return date.split('T')[0];
                }
                return date.toISOString().split('T')[0];
            };

            const currentReader = assignmentData.readerHistory?.[0]?.reader || null;

            const formData: AssignmentFormData = {
                catalogueId: assignmentData.catalogueId,
                orderId: assignmentData.orderId,
                receptionDate: formatDateForForm(assignmentData.receptionDate),
                sentToReaderDate: formatDateForForm(assignmentData.sentToReaderDate),
                returnedToECADate: formatDateForForm(assignmentData.returnedToECADate),
                statusId: assignmentData.statusId,
                notes: assignmentData.notes || '',
            };

            const selectedReader: ReaderSummary | null = currentReader ? {
                id: currentReader.id,
                name: currentReader.name,
                email: currentReader.email,
                firstName : currentReader.firstName,
                lastName : currentReader.lastName
            } : null;

            const selectedBook: BookSummary= {
                id: assignmentData.catalogue.id,
                title: assignmentData.catalogue.title,
                author: assignmentData.catalogue.author,
            };

            // Fix: Properly type the OrderSummary with all required fields
            const selectedOrder: OrderSummary | null = assignmentData.order ? {
                id: assignmentData.order.id,
                requestReceivedDate: assignmentData.order.requestReceivedDate,
                createdDate: assignmentData.order.createdDate,
                aveugle: assignmentData.order.aveugle,
                catalogue: assignmentData.order.catalogue,
            } as OrderSummary : null;

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
            'Attente envoi vers lecteur': 'bg-yellow-100 text-yellow-800 border border-yellow-300',
            'En attente de réception': 'bg-orange-100 text-orange-800 border border-orange-300',
            'Réceptionné': 'bg-blue-100 text-blue-800 border border-blue-300',
            'Envoyé au lecteur': 'bg-purple-100 text-purple-800 border border-purple-300',
            'Chez le lecteur': 'bg-indigo-100 text-indigo-800 border border-indigo-300',
            'Retourné à l\'ECA': 'bg-teal-100 text-teal-800 border border-teal-300',
            'Assignation terminée': 'bg-green-100 text-green-800 border border-green-300',
            'Assignation annulée': 'bg-red-100 text-red-800 border border-red-300',
        };
        return colorMap[statusName] || 'bg-gray-100 text-gray-800 border border-gray-300';
    };

    const calculatePageNumbers = () => {
        const pages: (number | string)[] = [];
        const delta = 2;

        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            if (currentPage <= 4) {
                for (let i = 1; i <= 5; i++) pages.push(i);
                pages.push('...');
                pages.push(totalPages);
            } else if (currentPage >= totalPages - 3) {
                pages.push(1);
                pages.push('...');
                for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
            } else {
                pages.push(1);
                pages.push('...');
                for (let i = currentPage - delta; i <= currentPage + delta; i++) {
                    pages.push(i);
                }
                pages.push('...');
                pages.push(totalPages);
            }
        }

        return pages;
    };

    const visiblePages = calculatePageNumbers();

    return (
        <Card className="w-full bg-gray-900 border-gray-800">
            <CardHeader className="border-b border-gray-800">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-3xl font-bold text-gray-100">
                            Affectations
                        </CardTitle>
                        <CardDescription className="text-gray-400 mt-2">
                            {initialTotalAssignments} affectation{initialTotalAssignments !== 1 ? 's' : ''} au total
                        </CardDescription>
                    </div>
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        Nouvelle affectation
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-6">
                {/* Search and Filters */}
                <div className="mb-6 space-y-4">
                    <div className="flex gap-4">
                        <div className="flex-1 flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                                <Input
                                    type="text"
                                    placeholder="Rechercher par livre, lecteur ou numéro..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    className="pl-10 pr-10 bg-gray-800 border-gray-700 text-gray-200 placeholder:text-gray-500"
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
                                disabled={isPending}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                Rechercher
                            </Button>
                        </div>
                        <div className="w-64">
                            <Select
                                value={currentStatusId}
                                onValueChange={handleStatusFilter}
                                disabled={isPending}
                            >
                                <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                                    <SelectValue placeholder="Filtrer par statut" />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-800 border-gray-700">
                                    <SelectItem value="all" className="text-gray-200">
                                        Tous les statuts
                                    </SelectItem>
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
                    </div>
                </div>

                {/* Table */}
                <div className={isPending ? 'opacity-50 pointer-events-none' : ''}>
                    {initialAssignments.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-gray-400 text-lg">
                                {searchTerm || currentStatusId !== 'all'
                                    ? "Aucune affectation trouvée avec ces critères"
                                    : "Aucune affectation"}
                            </p>
                        </div>
                    ) : (
                        <div>
                            <div className="rounded-lg border border-gray-700 overflow-hidden bg-gray-800">
                                <Table>
                                    <TableHeader className="bg-gray-800 border-b border-gray-700">
                                        <TableRow className="hover:bg-gray-800 border-b border-gray-700">
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
                                                    {assignment.currentReader ? (
                                                        <div>
                                                            <div className="font-medium">{assignment.currentReader.name || 'Sans nom'}</div>
                                                            <div className="text-sm text-gray-400">
                                                                {assignment.currentReader.email}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-gray-400 italic">Aucun lecteur assigné</div>
                                                    )}
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

            {/* Add Assignment Modal - Using the new modal wrapper */}
            <AddAssignmentModal
                isOpen={isAddModalOpen}
                onOpenChange={setIsAddModalOpen}
                onAssignmentCreated={handleAssignmentAdded}
            />

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