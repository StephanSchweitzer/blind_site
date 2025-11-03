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
import { AddAssignmentForm } from './components/AddAssignmentForm';

interface Assignment {
    id: number;
    readerId: number;
    catalogueId: number;
    orderId: number | null;
    receptionDate: string | null;
    sentToReaderDate: string | null;
    returnedToECADate: string | null;
    statusId: number;
    reader: {
        name: string | null;
        email: string;
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

    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
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
        <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="border-b border-gray-800">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-2xl text-gray-100">Affectations</CardTitle>
                        <CardDescription className="text-gray-400 mt-1">
                            Affichage de {initialAssignments.length} sur {initialTotalAssignments} affectations
                        </CardDescription>
                    </div>
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Nouvelle affectation
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="pt-6">
                {/* Search and Filters */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="flex-1 relative">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                            <Input
                                placeholder="Rechercher par lecteur, titre du livre ou auteur..."
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
                    </div>

                    <Button
                        onClick={handleSearch}
                        disabled={isPending}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        <Search className="h-4 w-4 mr-2" />
                        Rechercher
                    </Button>

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
                                            <TableHead className="text-gray-200 font-medium">Retourné à l&apos;ECA</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Statut</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {initialAssignments.map((assignment) => (
                                            <TableRow
                                                key={assignment.id}
                                                className="border-b border-gray-700 hover:bg-gray-750 cursor-pointer"
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
                        <AddAssignmentForm onSuccess={handleAssignmentAdded} />
                    </div>
                </DialogContent>
            </Dialog>
        </Card>
    );
}