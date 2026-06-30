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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { AddUserFormBackend } from '@/admin/UserFormBackendBase';
import { EditUserModal } from '@/admin/EditUserModal';
import { UserFormData, UserType } from '@/types';
import { useToast } from '@/hooks/use-toast';
import {
    getMemberTypeLabel,
    getMemberTypeColor,
    getAccessLevelLabel,
    getAccessLevelColor,
    USER_TYPE_META,
} from '@/lib/user-enums';
import {
    USER_ACTIVITY_STATUS_VALUES,
    getUserActivityStatusLabel,
    getUserActivityStatusColor,
} from '@/lib/user-activity-enums';

interface UsersTableProps {
    type: UserType;
    initialUsers: Array<{
        id: number;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        memberType: string;
        accessLevel: string;
        activityStatus: string;
        lastUpdated: string | null;
        civility?: { name: string } | null;
    }>;
    initialPage: number;
    initialSearch: string;
    initialStatus: string;
    totalPages: number;
    initialTotalUsers: number;
    activeCount: number;
    inactiveCount: number;
    currentUserAccessLevel?: string;
}

export default function UsersTable({
                                       type,
                                       initialUsers,
                                       initialPage,
                                       initialSearch,
                                       initialStatus,
                                       totalPages,
                                       initialTotalUsers,
                                       activeCount,
                                       inactiveCount,
                                       currentUserAccessLevel,
                                   }: UsersTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [statusFilter, setStatusFilter] = useState(initialStatus || 'all');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isLoadingUser, setIsLoadingUser] = useState(false);
    const [selectedUser, setSelectedUser] = useState<{
        id: string;
        data: UserFormData;
    } | null>(null);

    const currentPage = initialPage;
    const { plural, singular } = USER_TYPE_META[type];

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

    const handleStatusFilter = (value: string) => {
        setStatusFilter(value);
        updateUrl({ status: value === 'all' ? undefined : value, page: '1' });
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
            if (!response.ok) throw new Error('\u00c9chec du chargement des donn\u00e9es');

            const userData = await response.json();
            if (!userData) throw new Error('Donn\u00e9es incompl\u00e8tes re\u00e7ues');

            const formData: UserFormData = {
                email: userData.email || '',
                name: userData.name || '',
                memberType: userData.memberType || 'auditeur',
                accessLevel: userData.accessLevel || 'member',
                firstName: userData.firstName || '',
                lastName: userData.lastName || '',
                civilityId: userData.civilityId ?? null,
                civilityOther: userData.civilityOther || '',
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
                preferredMediaFormatId: userData.preferredMediaFormatId ?? null,
                isAvailable: userData.isAvailable ?? true,
                availabilityNotes: userData.availabilityNotes || '',
                specialization: userData.specialization || '',
                maxConcurrentAssignments: userData.maxConcurrentAssignments,
                notes: userData.notes || '',
                addresses: userData.addresses || [],
            };

            setSelectedUser({ id: user.id.toString(), data: formData });
            setIsEditModalOpen(true);
        } catch (error) {
            console.error('Error loading user:', error);
            toast({
                variant: "destructive",
                title: "Erreur",
                description: error instanceof Error ? error.message : "\u00c9chec du chargement des donn\u00e9es de la personne",
            });
        } finally {
            setIsLoadingUser(false);
        }
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'Non disponible';
        return new Date(dateString).toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const visiblePages = (() => {
        const pages: (number | string)[] = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
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
                for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
                pages.push('...');
                pages.push(totalPages);
            }
        }
        return pages;
    })();

    return (
        <Card className="border-border bg-card shadow-xl">
            <CardHeader className="border-b border-border">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <CardTitle className="text-2xl text-foreground">{plural}</CardTitle>
                        <CardDescription className="text-muted-foreground mt-1">
                            {initialTotalUsers} {singular}{initialTotalUsers > 1 ? 's' : ''} au total
                            {' \u2022 '}
                            {activeCount} actif{activeCount > 1 ? 's' : ''}
                            {' \u2022 '}
                            {inactiveCount} inactif{inactiveCount > 1 ? 's' : ''}
                        </CardDescription>
                    </div>
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Nouveau membre
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-2 mb-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Rechercher par nom, email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground"
                        />
                    </div>
                    <Button onClick={handleSearch} size="icon" className="bg-card border border-border text-foreground hover:bg-muted hover:text-white">
                        <Search className="h-4 w-4" />
                    </Button>
                    {searchTerm && (
                        <Button onClick={handleClearSearch} size="icon" variant="ghost" className="text-muted-foreground hover:text-foreground hover:bg-muted">
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                    <Select value={statusFilter} onValueChange={handleStatusFilter}>
                        <SelectTrigger className="bg-card border-border text-foreground sm:w-56">
                            <SelectValue placeholder="Statut" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            <SelectItem value="all" className="text-foreground">Tous les statuts</SelectItem>
                            <SelectItem value="inactive" className="text-foreground">Inactifs (tous sauf actifs)</SelectItem>
                            {USER_ACTIVITY_STATUS_VALUES.map((s) => (
                                <SelectItem key={s} value={s} className="text-foreground">
                                    {getUserActivityStatusLabel(s)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-6">
                    {initialUsers.length === 0 ? (
                        <div className="py-20 flex flex-col items-center justify-center border border-border rounded-lg bg-card/50">
                            <p className="text-muted-foreground text-lg">Aucun {singular} trouv&#233;</p>
                        </div>
                    ) : (
                        <div className={`border border-border rounded-lg overflow-hidden ${isPending ? 'opacity-50' : ''}`}>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-card">
                                        <TableRow className="border-b border-border hover:bg-muted">
                                            <TableHead className="text-foreground font-medium">ID</TableHead>
                                            <TableHead className="text-foreground font-medium">Email</TableHead>
                                            <TableHead className="text-foreground font-medium">Nom complet</TableHead>
                                            <TableHead className="text-foreground font-medium">
                                                {type === 'permanents' ? "Niveau d'acc\u00e8s" : 'Type de membre'}
                                            </TableHead>
                                            <TableHead className="text-foreground font-medium">Statut</TableHead>
                                            <TableHead className="text-foreground font-medium">Derni&#232;re mise &#224; jour</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {initialUsers.map((user) => (
                                            <TableRow
                                                key={user.id}
                                                onClick={() => handleRowClick(user)}
                                                className="border-b border-border hover:bg-muted cursor-pointer"
                                            >
                                                <TableCell className="font-medium text-foreground">#{user.id}</TableCell>
                                                <TableCell className="text-foreground">
                                                    {user.email || <span className="text-muted-foreground italic">Non d&#233;fini</span>}
                                                </TableCell>
                                                <TableCell className="text-foreground">
                                                    {(user.firstName || user.lastName || user.civility)
                                                        ? `${user.civility?.name ? user.civility.name + ' ' : ''}${user.firstName || ''} ${user.lastName || ''}`.trim()
                                                        : <span className="text-muted-foreground italic">Non d&#233;fini</span>}
                                                </TableCell>
                                                <TableCell>
                                                    {type === 'permanents' ? (
                                                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getAccessLevelColor(user.accessLevel)}`}>
                                                            {getAccessLevelLabel(user.accessLevel)}
                                                        </span>
                                                    ) : (
                                                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getMemberTypeColor(user.memberType)}`}>
                                                            {getMemberTypeLabel(user.memberType)}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getUserActivityStatusColor(user.activityStatus)}`}>
                                                        {getUserActivityStatusLabel(user.activityStatus)}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-foreground">{formatDate(user.lastUpdated)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    {isLoadingUser && (
                        <div className="fixed inset-0 bg-card/80 backdrop-blur-sm flex items-center justify-center z-50">
                            <div className="bg-card rounded-lg p-8 shadow-2xl border border-border">
                                <div className="flex flex-col items-center gap-4">
                                    <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
                                    <p className="text-lg font-medium text-foreground">Chargement de la personne...</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {totalPages > 1 && (
                    <div className={`flex flex-wrap justify-center items-center gap-2 mt-6 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
                        <Button size="sm" className="bg-card text-foreground border-border hover:bg-muted" onClick={() => handlePageChange(1)} disabled={currentPage === 1 || isPending}>{'<<'}</Button>
                        <Button size="sm" className="bg-card text-foreground border-border hover:bg-muted" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1 || isPending}>{'<'}</Button>
                        {visiblePages.map((page, index) => (
                            typeof page === 'number' ? (
                                <Button
                                    key={index}
                                    variant={currentPage === page ? "default" : "outline"}
                                    size="sm"
                                    className={currentPage === page ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-card text-foreground border-border hover:bg-muted"}
                                    onClick={() => handlePageChange(page)}
                                    disabled={isPending}
                                >
                                    {page}
                                </Button>
                            ) : (
                                <span key={index} className="text-muted-foreground px-2">{page}</span>
                            )
                        ))}
                        <Button size="sm" className="bg-card text-foreground border-border hover:bg-muted" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages || isPending}>{'>'}</Button>
                        <Button size="sm" className="bg-card text-foreground border-border hover:bg-muted" onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages || isPending}>{'>>'}</Button>
                    </div>
                )}

                {totalPages > 1 && (
                    <p className="text-center text-sm text-muted-foreground mt-2">Page {currentPage} sur {totalPages}</p>
                )}
            </CardContent>

            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Ajouter une nouvel personne</DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto px-1">
                        <AddUserFormBackend
                            onSuccess={handleUserAdded}
                            userType={type}
                            currentUserAccessLevel={currentUserAccessLevel}
                        />
                    </div>
                </DialogContent>
            </Dialog>

            {selectedUser && (
                <EditUserModal
                    isOpen={isEditModalOpen}
                    onOpenChange={(open) => {
                        setIsEditModalOpen(open);
                        if (!open) {
                            // The activity-status changer (UserActivityHistory) inside this
                            // modal persists via its own request without refreshing the table;
                            // the main-form save path doesn't run for a status-only change.
                            // Refresh on close so the new status shows without a hard reload.
                            setSelectedUser(null);
                            router.refresh();
                        }
                    }}
                    userId={selectedUser.id}
                    initialData={selectedUser.data}
                    onUserEdited={handleUserEdited}
                    onUserDeleted={handleUserDeleted}
                    currentUserAccessLevel={currentUserAccessLevel}
                    userType={type}
                />
            )}
        </Card>
    );
}