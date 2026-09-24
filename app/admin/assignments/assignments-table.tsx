// app/admin/assignments/assignments-table.tsx
'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
    UserSummary,
    BookSummary,
    OrderSummary,
    AssignmentWithCurrentReader,
} from '@/types';
import { STATUS } from '@/lib/statusSync';
import { getUserNameOnly } from '@/lib/users/displayName';
import { CopyIdButton } from '@/admin/CopyableId';
import { parisDate } from '@/lib/paris-day';
import { AideLink } from '@/components/ui/admin/AideLink';
import { BookFilterBadge } from '@/admin/BookFilterBadge';
import { BookFilterPicker } from '@/admin/BookFilterPicker';
import { MobileFilters } from '@/admin/MobileFilters';
import type { BookFilter } from '@/lib/books/bookFilter';
import { SearchRescue } from '@/components/ui/search-rescue';
import type { RescueSuggestion } from '@/lib/search-suggestion-types';
import type { SerializedDelai } from '@/lib/orders/delais';
import type { PageInfo } from '@/lib/pagination';
import { AdminPaginatedList } from '@/admin/AdminPagination';

interface AssignmentsTableProps {
    initialAssignments: AssignmentWithCurrentReader[];
    /** Page courante, taille, total — lib/pagination.ts `pageInfo`. */
    pagination: PageInfo;
    initialSearch: string;
    availableStatuses: StatusSummary[];
    hideSearch?: boolean;
    presetClientId?: number | null;
    presetReader?: ReaderSummary | null;
    presetClient?: UserSummary | null;
    /** Le livre du filtre `?bookId=`, résolu côté serveur — voir lib/books/bookFilter.ts. */
    filterBook?: BookFilter | null;
    /** Attributions past their stage's amber or red line, keyed by id — lib/orders/delais.ts. */
    delais?: Record<number, SerializedDelai>;
    /** « Vouliez-vous dire … ? », computed only when the search found nothing. */
    searchSuggestions?: RescueSuggestion[];
}

export default function AssignmentsTable({
                                             initialAssignments,
                                             pagination,
                                             initialSearch,
                                             availableStatuses,
                                             hideSearch = false,
                                             presetClientId = null,
                                             presetReader = null,
                                             presetClient = null,
                                             filterBook = null,
                                             delais = {},
                                             searchSuggestions,
                                         }: AssignmentsTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    // Pagination : un clic simple navigue dans une transition, pour griser la liste.
    const navigate = (href: string) => startTransition(() => router.push(href, { scroll: false }));
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

    const currentStatusId = searchParams.get('statusId') || 'all';
    const currentRetard = searchParams.get('retard') || 'all';

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

    const handleStatusFilter = (statusId: string) => {
        updateUrl({
            statusId: statusId === 'all' ? undefined : statusId,
            page: '1',
        });
    };

    // Délais par étape — the demandes list's « Retard » filter, same rule.
    const handleRetardFilter = (retard: string) => {
        updateUrl({
            retard: retard === 'all' ? undefined : retard,
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
        clearAssignmentParam();
        router.refresh();
    };

    const handleAssignmentDeleted = (assignmentId: number) => {
        console.log('Assignment deleted:', assignmentId);
        setIsEditModalOpen(false);
        setSelectedAssignment(null);
        clearAssignmentParam();
        router.refresh();

        toast({
            // @ts-expect-error jsx in toast
            title: <span className="text-2xl font-bold">Succès</span>,
            description: <span className="text-xl mt-2">L&apos;attribution a été supprimée</span>,
            className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
        });
    };

    const openAssignmentById = async (assignmentId: number | string) => {
        setIsLoadingAssignment(true);
        console.log('Fetching assignment details for ID:', assignmentId);

        try {
            const response = await fetch(`/api/assignments/${assignmentId}`);

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
                deliveryMethod: assignmentData.deliveryMethod ?? null,
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
                pages: assignmentData.order.pages,
                aveugle: assignmentData.order.aveugle,
                catalogue: assignmentData.order.catalogue,
            } as OrderSummary : null;

            setSelectedAssignment({
                id: assignmentData.id.toString(),
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
                description: <span className="text-xl mt-2">Impossible de charger les détails de l&apos;attribution</span>,
                className: "bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6"
            });
        } finally {
            setIsLoadingAssignment(false);
        }
    };

    const handleRowClick = (assignment: AssignmentWithCurrentReader) =>
        openAssignmentById(assignment.id);

    // Deep-link: open the edit modal when arriving with ?assignment=<id>.
    // openedRef prevents re-firing on router.refresh() / re-render for the same id.
    const assignmentParam = searchParams.get('assignment');
    const openedRef = useRef<string | null>(null);

    useEffect(() => {
        if (assignmentParam && openedRef.current !== assignmentParam) {
            openedRef.current = assignmentParam;
            openAssignmentById(assignmentParam);
        } else if (!assignmentParam) {
            openedRef.current = null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assignmentParam]);

    const clearAssignmentParam = () => {
        // No deep-link param to clear (the normal row-click edit case): do nothing.
        // Touching history here at all desyncs Next's router and swallows the
        // router.refresh() that runs right after an edit — which is exactly why
        // status/reassign edits never re-rendered. Bail out so refresh runs clean.
        if (!searchParams.get('assignment')) return;
        const params = new URLSearchParams(searchParams.toString());
        params.delete('assignment');
        // Use the History API instead of router.replace() so dropping the param
        // does NOT start a navigation that pre-empts the router.refresh() fired
        // right after it (that race was leaving the table stale after edits).
        const qs = params.toString();
        // Preserve Next's routing metadata; passing null wipes it and breaks refresh.
        window.history.replaceState(window.history.state, '', qs ? `?${qs}` : window.location.pathname);
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-';
        return parisDate(dateString);
    };

    const getStatusDisplayName = (statusName: string) => {
        const displayMap: Record<string, string> = {
            'Attente envoi vers lecteur': 'Attente envoi',
            'En attente de réception': 'En attente',
            'Réceptionné': 'Réceptionné',
            'Envoyé au lecteur': 'Envoyé',
            'Chez le lecteur': 'Chez lecteur',
            'Retourné aux ECA': 'Retourné',
            'Attribution terminée': 'Terminée',
            'Attribution annulée': 'Annulée',
        };
        return displayMap[statusName] || statusName;
    };

    const getStatusColor = (statusName: string) => {
        const colorMap: Record<string, string> = {
            'Attente envoi vers lecteur': 'bg-yellow-100 text-yellow-800 border border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-800',
            'En attente de réception': 'bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800',
            'Réceptionné': 'bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
            'Envoyé au lecteur': 'bg-purple-100 text-purple-800 border border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800',
            'Chez le lecteur': 'bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800',
            'Retourné aux ECA': 'bg-teal-100 text-teal-800 border border-teal-300 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800',
            'Attribution terminée': 'bg-green-100 text-green-800 border border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800',
            'Attribution annulée': 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',
        };
        return colorMap[statusName] || 'bg-muted text-muted-foreground border border-border';
    };

    return (
        <Card className="w-full bg-card border-border">
            <CardHeader className="border-b border-border">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-3xl font-bold text-foreground">
                                Attributions
                            </CardTitle>
                            <AideLink section="attributions" />
                        </div>
                        <CardDescription className="text-muted-foreground mt-2">
                            Gérer et suivre toutes les attributions
                        </CardDescription>
                    </div>
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        Ajouter une attribution
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-6">
                {/* Search and Filters */}
                <div className="mb-6 space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                        {!hideSearch && (
                            <div className="flex-1 flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                                    <Input
                                        type="text"
                                        placeholder="Rechercher par livre, lecteur, auditeur, numéro d'attribution ou de demande..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                        className="pl-10 pr-10 bg-card border-border text-foreground placeholder:text-muted-foreground"
                                    />
                                    {searchTerm && (
                                        <button
                                            onClick={handleClearSearch}
                                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                                <Button
                                    onClick={handleSearch}
                                    disabled={isPending}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                                >
                                    Rechercher
                                </Button>
                            </div>
                        )}
                        <MobileFilters
                            activeCount={[filterBook, currentStatusId !== 'all', currentRetard !== 'all'].filter(Boolean).length}
                            className="flex flex-col md:flex-row gap-4"
                        >
                        {/* Sans étiquette, comme le statut à côté : ici les filtres
                            s'annoncent par leur placeholder, pas par un label. */}
                        <BookFilterPicker
                            book={filterBook}
                            placeholder="Filtrer par livre"
                            className="w-full sm:w-64"
                        />
                        <div className="w-full sm:w-64">
                            <Select
                                value={currentStatusId}
                                onValueChange={handleStatusFilter}
                                disabled={isPending}
                            >
                                <SelectTrigger className="bg-field border-border text-foreground">
                                    <SelectValue placeholder="Filtrer par statut" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    <SelectItem value="all" className="text-foreground">
                                        Tous les statuts
                                    </SelectItem>
                                    {/* No attribution can hold « Soldé » (facture-only),
                                        « À faire » (duplication-only) or « Attente envoi vers
                                        auditeur » (demande-only), so filtering by any of them
                                        always returns nothing — don't offer them. */}
                                    {availableStatuses
                                        .filter((status) =>
                                            status.id !== STATUS.SOLDE &&
                                            status.id !== STATUS.A_FAIRE &&
                                            status.id !== STATUS.ATTENTE_AUDITEUR
                                        )
                                        .map((status) => (
                                            <SelectItem
                                                key={status.id}
                                                value={status.id.toString()}
                                                className="text-foreground"
                                            >
                                                {status.name}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-full sm:w-48">
                            <Select
                                value={currentRetard}
                                onValueChange={handleRetardFilter}
                                disabled={isPending}
                            >
                                <SelectTrigger
                                    aria-label="Filtrer par retard"
                                    className="bg-field border-border text-foreground"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    <SelectItem value="all" className="text-foreground">Tous les délais</SelectItem>
                                    <SelectItem value="true" className="text-foreground">En retard</SelectItem>
                                    <SelectItem value="surveiller" className="text-foreground">À surveiller</SelectItem>
                                    <SelectItem value="false" className="text-foreground">À jour</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        </MobileFilters>
                    </div>

                    {filterBook && <BookFilterBadge book={filterBook} noun="attributions" />}
                </div>

                <AdminPaginatedList
                    info={pagination}
                    noun={{ one: 'attribution', many: 'attributions', feminine: true }}
                    label="Pages des attributions"
                    onNavigate={navigate}
                    pending={isPending}
                >
                {/* Table — grisée par AdminPaginatedList pendant un chargement. */}
                <div className={isPending ? 'pointer-events-none' : ''}>
                    {initialAssignments.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-muted-foreground text-lg">
                                {searchTerm || currentStatusId !== 'all' || currentRetard !== 'all' || filterBook
                                    ? "Aucune attribution trouvée avec ces critères"
                                    : "Aucune attribution"}
                            </p>
                            <SearchRescue
                                suggestions={searchSuggestions}
                                unit={{ one: 'attribution', many: 'attributions', feminine: true }}
                                onApply={(s) => {
                                    setSearchTerm(s.query);
                                    // A lifted filter is its URL parameter, cleared.
                                    const lifted = Object.fromEntries(s.lifted.map((key) => [key, undefined]));
                                    updateUrl({ ...lifted, search: s.query, page: '1' });
                                }}
                                onOpenRow={(row) => openAssignmentById(row.id)}
                            />
                        </div>
                    ) : (
                        <div>
                            <div className="rounded-lg border border-border overflow-clip bg-card">
                                <Table stickyHeader mobileCards>
                                    <TableHeader className="bg-card border-b border-border">
                                        <TableRow className="hover:bg-muted border-b border-border">
                                            <TableHead className="text-foreground font-medium">ID</TableHead>
                                            <TableHead className="text-foreground font-medium">Lecteur</TableHead>
                                            <TableHead className="text-foreground font-medium">Livraison</TableHead>
                                            <TableHead className="text-foreground font-medium">Livre</TableHead>
                                            <TableHead className="text-foreground font-medium">Date de réception</TableHead>
                                            <TableHead className="text-foreground font-medium">Envoyé au lecteur</TableHead>
                                            <TableHead className="text-foreground font-medium">Retourné aux ECA</TableHead>
                                            <TableHead className="text-foreground font-medium w-[1%] whitespace-nowrap">Statut</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {initialAssignments.map((assignment) => {
                                            // Computed server-side, per stage — lib/orders/delais.ts.
                                            const delai = delais[assignment.id];
                                            return (
                                            <TableRow
                                                key={assignment.id}
                                                onClick={() => handleRowClick(assignment)}
                                                className={`group border-b border-border cursor-pointer transition-colors ${
                                                    delai?.niveau === 'en_retard'
                                                        ? 'bg-red-100/70 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/40'
                                                        : 'hover:bg-muted'
                                                }`}
                                            >
                                                <TableCell className="font-medium text-foreground whitespace-nowrap">
                                                    <CopyIdButton id={assignment.id} label="de l'attribution" />
                                                    {/* La demande d'origine, toujours affichée. Elle ne
                                                        l'était qu'en réponse à une recherche par son
                                                        numéro, pour expliquer pourquoi la ligne sortait ;
                                                        mais la question « de quelle demande vient cette
                                                        attribution ? » se pose tout le temps, et la
                                                        réponse n'existait autrement qu'en ouvrant la
                                                        fiche. La demande, elle, montre son attribution
                                                        depuis sa liste — c'est le retour manquant.
                                                        Sous le numéro plutôt qu'en colonne : la cellule
                                                        empile déjà, donc cela ne coûte aucune largeur, et
                                                        `orderId` est nullable — une colonne serait vide
                                                        pour toute attribution sans demande.
                                                        stopPropagation, sinon le clic ouvrirait aussi
                                                        l'attribution sous le lien. */}
                                                    {assignment.orderId && (
                                                        <div className="text-xs font-normal">
                                                            <Link
                                                                href={`/admin/orders?order=${assignment.orderId}`}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2"
                                                            >
                                                                ↳ demande #{assignment.orderId}
                                                            </Link>
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-foreground">
                                                    {assignment.currentReader ? (
                                                        <div>
                                                            {/* Vers le dossier du lecteur, onglet attributions —
                                                                celui qu'on lisait. Même raison que le nom de
                                                                l'auditeur sur la liste des demandes : une
                                                                attribution n'a qu'un lecteur courant, et son
                                                                dossier ne s'atteignait que par la liste des
                                                                membres.

                                                                Pas de lien dans le dossier D'UN LECTEUR
                                                                (`presetReader`) : toutes les lignes y sont les
                                                                siennes. Dans celui d'un auditeur, en revanche,
                                                                les lecteurs varient d'une ligne à l'autre et le
                                                                lien garde tout son sens. */}
                                                            <div className="font-medium">
                                                                {presetReader ? (
                                                                    getUserNameOnly(assignment.currentReader) || 'Sans nom'
                                                                ) : (
                                                                    <Link
                                                                        href={`/admin/users/dossier/${assignment.currentReader.id}/affectations`}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2"
                                                                    >
                                                                        {getUserNameOnly(assignment.currentReader) || 'Sans nom'}
                                                                    </Link>
                                                                )}
                                                            </div>
                                                            <div className="text-sm text-muted-foreground">
                                                                {assignment.currentReader.email}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-muted-foreground italic">Aucun lecteur assigné</div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">
                                                    {assignment.deliveryMethod === 'RETRAIT' ? (
                                                        <span className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                                            Retrait
                                                        </span>
                                                    ) : assignment.deliveryMethod === 'ENVOI' ? (
                                                        <span className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">
                                                            Envoi
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-foreground max-w-xs">
                                                    <div>
                                                        <div className="font-medium break-words">{assignment.catalogue.title}</div>
                                                        <div className="text-sm text-muted-foreground">
                                                            {assignment.catalogue.author}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-foreground whitespace-nowrap">
                                                    {formatDate(assignment.receptionDate)}
                                                </TableCell>
                                                <TableCell className="text-foreground whitespace-nowrap">
                                                    {formatDate(assignment.sentToReaderDate)}
                                                </TableCell>
                                                <TableCell className="text-foreground whitespace-nowrap">
                                                    {formatDate(assignment.returnedToECADate)}
                                                </TableCell>
                                                <TableCell className="w-[1%]">
                                                    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(assignment.status.name)}`}>
                                                        {getStatusDisplayName(assignment.status.name)}
                                                    </span>
                                                    {/* Same wording as on the demandes list: the reason in
                                                        words, only past a line. */}
                                                    {delai && (
                                                        <div
                                                            title={delai.phrase}
                                                            className={`mt-1 whitespace-nowrap text-xs font-medium ${
                                                                delai.niveau === 'en_retard'
                                                                    ? 'text-red-700 dark:text-red-300'
                                                                    : 'text-amber-700 dark:text-amber-300'
                                                            }`}
                                                        >
                                                            <span aria-hidden="true">{delai.badge}</span>
                                                            <span className="sr-only">{delai.phrase}</span>
                                                        </div>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    {/* Loading Overlay for Assignment Data */}
                    {isLoadingAssignment && (
                        <div className="fixed inset-0 bg-card/80 backdrop-blur-sm flex items-center justify-center z-50">
                            <div className="bg-card rounded-lg p-8 shadow-2xl border border-border">
                                <div className="flex flex-col items-center gap-4">
                                    <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
                                    <p className="text-lg font-medium text-foreground">Chargement de l&apos;attribution...</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                </AdminPaginatedList>
            </CardContent>

            {/* Add Assignment Modal - Using the new modal wrapper */}
            <AddAssignmentModal
                isOpen={isAddModalOpen}
                onOpenChange={setIsAddModalOpen}
                onAssignmentCreated={handleAssignmentAdded}
                presetClientId={presetClientId}
                presetReader={presetReader}
                presetClient={presetClient}
            />

            {/* Edit Assignment Modal */}
            {selectedAssignment && (
                <EditAssignmentModal
                    isOpen={isEditModalOpen}
                    onOpenChange={(open) => {
                        setIsEditModalOpen(open);
                        if (!open) {
                            setSelectedAssignment(null);
                            clearAssignmentParam();
                            // Sub-actions performed while the modal was open (reader
                            // reassignment hits POST /readers directly) persist without
                            // telling the table to refetch; the post-save close also lands
                            // here. Refresh on every close so the change shows in the table.
                            router.refresh();
                        }
                    }}
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