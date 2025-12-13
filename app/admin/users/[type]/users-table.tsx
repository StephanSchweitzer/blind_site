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
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Search, X, Loader2, Plus } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { AddUserFormBackend } from '@/admin/UserFormBackendBase';
import { EditUserModal } from '@/admin/EditUserModal';
import { UserFormData } from '@/types';
import { useToast } from '@/hooks/use-toast';

interface UsersTableProps {
    type: 'lecteurs' | 'auditeurs';
    initialUsers: Array<{
        id: number;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        role: string;
        isActive: boolean | null;
        lastUpdated: string | null;
    }>;
    initialPage: number;
    initialSearch: string;
    totalPages: number;
    initialTotalUsers: number;
    currentUserRole?: string;
}

export default function UsersTable({
                                       type,
                                       initialUsers,
                                       initialPage,
                                       initialSearch,
                                       totalPages,
                                       initialTotalUsers,
                                       currentUserRole,
                                   }: UsersTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isLoadingUser, setIsLoadingUser] = useState(false);
    const [selectedUser, setSelectedUser] = useState<{
        id: string;
        data: UserFormData;
    } | null>(null);

    const currentPage = initialPage;

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

    const handleUserAdded = () => {
        setIsAddModalOpen(false);
        router.refresh();
    };

    const handleUserEdited = (userId: number) => {
        console.log('User edited:', userId);
        setIsEditModalOpen(false);
        setSelectedUser(null);
        router.refresh();
    };

    const handleUserDeleted = (userId: number) => {
        console.log('User deleted:', userId);
        setIsEditModalOpen(false);
        setSelectedUser(null);
        router.refresh();
    };

    const handleRowClick = async (user: typeof initialUsers[0]) => {
        setIsLoadingUser(true);

        try {
            const response = await fetch(`/api/user/${user.id}?mode=full&include=addresses`);

            if (!response.ok) {
                throw new Error('Échec du chargement des données');
            }

            const userData = await response.json();

            if (!userData) {
                throw new Error('Données incomplètes reçues');
            }

            const formData: UserFormData = {
                email: userData.email || '',
                name: userData.name || '',
                role: userData.role || 'user',
                firstName: userData.firstName || '',
                lastName: userData.lastName || '',
                homePhone: userData.homePhone || '',
                cellPhone: userData.cellPhone || '',
                gestconteNotes: userData.gestconteNotes || '',
                gestconteId: userData.gestconteId,
                nonProfitAffiliation: userData.nonProfitAffiliation || '',
                isActive: userData.isActive ?? true,
                terminationReason: userData.terminationReason || '',
                preferredDeliveryMethod: userData.preferredDeliveryMethod || '',
                paymentThreshold: userData.paymentThreshold?.toString() || '21.00',
                currentBalance: userData.currentBalance?.toString() || '0.00',
                preferredDistributionMethod: userData.preferredDistributionMethod || '',
                isAvailable: userData.isAvailable ?? true,
                availabilityNotes: userData.availabilityNotes || '',
                specialization: userData.specialization || '',
                maxConcurrentAssignments: userData.maxConcurrentAssignments,
                notes: userData.notes || '',
                addresses: userData.addresses || [],
            };

            setSelectedUser({
                id: user.id.toString(),
                data: formData,
            });

            setIsEditModalOpen(true);
        } catch (error) {
            console.error('Error loading user:', error);
            toast({
                variant: "destructive",
                title: "Erreur",
                description: "Erreur lors du chargement de l'individuel. Veuillez réessayer.",
            });
        } finally {
            setIsLoadingUser(false);
        }
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('fr-FR');
    };

    const getRoleDisplayName = (role: string) => {
        const displayMap: Record<string, string> = {
            'user': 'Auditeur',
            'admin': 'Lecteur',
            'super_admin': 'Super Admin',
            'lecteur': 'Lecteur',
            'auditeur': 'Auditeur',
            'AVEUGLE': 'Aveugle',
            'STAFF': 'Staff',
        };
        return displayMap[role] || role;
    };

    const getRoleColor = (role: string) => {
        const colorMap: Record<string, string> = {
            'user': 'bg-gray-100 text-gray-800',
            'admin': 'bg-blue-100 text-blue-800',
            'super_admin': 'bg-purple-100 text-purple-800',
            'lecteur': 'bg-green-100 text-green-800',
            'auditeur': 'bg-orange-100 text-orange-800',
            'AVEUGLE': 'bg-green-100 text-green-800',
            'STAFF': 'bg-yellow-100 text-yellow-800',
        };
        return colorMap[role] || 'bg-gray-100 text-gray-800';
    };

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
    const title = type === 'lecteurs' ? 'Gestion des Lecteurs' : 'Gestion des Auditeurs';

    return (
        <Card className="bg-gray-900 border-gray-800 shadow-xl">
            <CardHeader className="border-b border-gray-800">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle className="text-2xl font-bold text-gray-100">
                            {title}
                        </CardTitle>
                        <CardDescription className="text-gray-400 mt-1">
                            {initialTotalUsers} {type === 'lecteurs' ? 'lecteur' : 'auditeur'}{initialTotalUsers > 1 ? 's' : ''} au total
                        </CardDescription>
                    </div>
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Nouveau membre
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-6">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                        <Input
                            type="text"
                            placeholder="Rechercher par nom, prénom ou email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleSearch();
                                }
                            }}
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
                        className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                    >
                        Rechercher
                    </Button>
                </div>

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

                <div className="relative">
                    {initialUsers.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-gray-400 text-lg">Aucun {type === 'lecteurs' ? 'lecteur' : 'auditeur'} trouvé</p>
                        </div>
                    ) : (
                        <div className={`border border-gray-800 rounded-lg overflow-hidden ${isPending ? 'opacity-50' : ''}`}>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-gray-800 border-b border-gray-700 hover:bg-gray-800">
                                            <TableHead className="text-gray-200 font-medium">ID</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Email</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Nom complet</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Rôle</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Actif</TableHead>
                                            <TableHead className="text-gray-200 font-medium">Dernière mise à jour</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {initialUsers.map((user) => (
                                            <TableRow
                                                key={user.id}
                                                onClick={() => handleRowClick(user)}
                                                className="border-b border-gray-700 hover:bg-gray-750 cursor-pointer"
                                            >
                                                <TableCell className="font-medium text-gray-200">
                                                    #{user.id}
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    {user.email || <span className="text-gray-500 italic">Non défini</span>}
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    {(user.firstName || user.lastName) ? (
                                                        `${user.firstName || ''} ${user.lastName || ''}`.trim()
                                                    ) : (
                                                        <span className="text-gray-500 italic">Non défini</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getRoleColor(user.role)}`}>
                                                        {getRoleDisplayName(user.role)}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    {user.isActive ? (
                                                        <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-green-100 text-green-800">
                                                            Actif
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-red-100 text-red-800">
                                                            Inactif
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    {formatDate(user.lastUpdated)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    {isLoadingUser && (
                        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50">
                            <div className="bg-gray-800 rounded-lg p-8 shadow-2xl border border-gray-700">
                                <div className="flex flex-col items-center gap-4">
                                    <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
                                    <p className="text-lg font-medium text-gray-200">Chargement de l&apos;individuel...</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

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

            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">
                    <DialogHeader>
                        <DialogTitle className="text-gray-100">Ajouter une nouvel personne</DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto px-1">
                        <AddUserFormBackend onSuccess={handleUserAdded} userType={type} />
                    </div>
                </DialogContent>
            </Dialog>

            {selectedUser && (
                <EditUserModal
                    isOpen={isEditModalOpen}
                    onOpenChange={setIsEditModalOpen}
                    userId={selectedUser.id}
                    initialData={selectedUser.data}
                    onUserEdited={handleUserEdited}
                    onUserDeleted={handleUserDeleted}
                    currentUserRole={currentUserRole}
                    userType={type}
                />
            )}
        </Card>
    );
}