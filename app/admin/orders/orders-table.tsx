'use client';

import { useState, useCallback, useTransition, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
import { getOrderBillingStatusLabel } from '@/lib/billing-enums';
import { AddOrderFormBackend } from '@/admin/AddOrderFormBackend';
import { EditOrderModal } from '@/admin/EditOrderModal';
import { OrderFormData } from '@/admin/OrderFormBackendBase';
import { pagePricingFromRow } from '@/lib/orders/pagePricingForm';
import { useToast } from '@/hooks/use-toast';
import { STATUS } from '@/lib/statusSync';
import { getUserNameOnly } from '@/lib/users/displayName';
import { MailingLabelButton } from '@/admin/MailingLabelButton';
import { CopyIdButton } from '@/admin/CopyableId';

import type {
    SerializedOrderTableRow,
    OrderUserOption,
    OrderBookOption,
} from '@/types/models/order.model';
import type { SerializedBlockingRecording } from '@/lib/orders/duplicationBlocked';
import type { SerializedDelai } from '@/lib/orders/delais';
import { parisDate } from '@/lib/paris-day';
import { AideLink } from '@/components/ui/admin/AideLink';
import { BookFilterBadge } from '@/admin/BookFilterBadge';
import { BookFilterPicker } from '@/admin/BookFilterPicker';
import type { BookFilter } from '@/lib/books/bookFilter';
import { SearchRescue } from '@/components/ui/search-rescue';
import type { RescueSuggestion } from '@/lib/search-suggestion-types';

type OrdersTableProps = {
    initialOrders: SerializedOrderTableRow[];
    initialPage: number;
    initialSearch: string;
    totalPages: number;
    availableStatuses: { id: number; name: string }[];
    initialTotalOrders: number;
    /** Duplications that can't start yet, keyed by demande id. Derived server-side. */
    blockedDuplications?: Record<number, SerializedBlockingRecording>;
    /** Demandes past their stage's amber or red line, keyed by id — lib/orders/delais.ts. */
    delais?: Record<number, SerializedDelai>;
    hideSearch?: boolean;
    presetClient?: { id: number; name: string | null; email: string } | null;
    /** Le livre du filtre `?bookId=`, résolu côté serveur — voir lib/books/bookFilter.ts. */
    filterBook?: BookFilter | null;
    /** « Vouliez-vous dire … ? », computed only when the search found nothing. */
    searchSuggestions?: RescueSuggestion[];
};

export default function OrdersTable({
                                        initialOrders,
                                        initialPage,
                                        initialSearch,
                                        totalPages,
                                        availableStatuses,
                                        blockedDuplications = {},
                                        delais = {},
                                        hideSearch = false,
                                        searchSuggestions,
                                        presetClient = null,
                                        filterBook = null,
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
        selectedUser: OrderUserOption;
        selectedBook: OrderBookOption;
        selectedStaff: OrderUserOption | null;
        bill: SerializedOrderTableRow['bill'];
        /** ISO string when this demande is soft-deleted (open via ?order= deep-link only); null otherwise. */
        deletedAt: string | null;
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
        clearOrderParam();
        router.refresh();
    };

    const handleOrderDeleted = (orderId: number) => {
        console.log('Order deleted:', orderId);
        setIsEditModalOpen(false);
        setSelectedOrder(null);
        clearOrderParam();
        router.refresh();
    };

    const handleRowClick = async (order: SerializedOrderTableRow & { deletedAt?: string | null }) => {
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
                deliveryMethod: order.deliveryMethod,
                processedByStaffId: order.processedByStaffId,
                closureDate: order.closureDate ? new Date(order.closureDate) : null,
                cost: order.cost?.toString() || '0.00',
                pagePricing: pagePricingFromRow(order),
                billingStatus: order.billingStatus,
                lentPhysicalBook: order.lentPhysicalBook,
                notes: order.notes || '',
            };

            setSelectedOrder({
                id: order.id.toString(),
                data: formData,
                selectedUser: userData,
                selectedBook: bookData,
                selectedStaff: staffData,
                bill: order.bill,
                deletedAt: order.deletedAt ?? null,
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

    // Deep-link: open an order's edit modal directly from /admin/orders?order=<id>,
    // even when that order isn't on the current page. Fetches the row-shaped order
    // then reuses handleRowClick (which hydrates user/book/staff and opens the modal).
    const openOrderById = async (orderId: number | string) => {
        setIsLoadingOrder(true);
        try {
            const response = await fetch(`/api/orders/${orderId}?mode=full&include=bill`);
            if (!response.ok) throw new Error('Failed to fetch order');
            // mode=full returns every scalar column, deletedAt included — a
            // soft-deleted demande no longer 404s here (GET /api/orders/[id]),
            // so a deep-link can open it with the banner instead of an error toast.
            const order: SerializedOrderTableRow & { deletedAt: string | null } = await response.json();
            await handleRowClick(order);
        } catch (error) {
            console.error('Error loading order from deep-link:', error);
            toast({
                variant: "destructive",
                title: "Erreur",
                description: "Erreur lors du chargement de la demande. Veuillez réessayer.",
            });
            setIsLoadingOrder(false);
        }
    };

    const assignmentOrderParam = searchParams.get('order');
    const openedRef = useRef<string | null>(null);

    useEffect(() => {
        if (assignmentOrderParam && openedRef.current !== assignmentOrderParam) {
            openedRef.current = assignmentOrderParam;
            openOrderById(assignmentOrderParam);
        } else if (!assignmentOrderParam) {
            openedRef.current = null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assignmentOrderParam]);

    const clearOrderParam = () => {
        // No deep-link param to clear (the normal row-click edit case): do nothing.
        // Touching history here at all desyncs Next's router and swallows the
        // router.refresh() that runs right after an edit — which is exactly why
        // status/date edits never re-rendered. Bail out so refresh runs clean.
        if (!searchParams.get('order')) return;
        const params = new URLSearchParams(searchParams.toString());
        params.delete('order');
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

    // Tooltip behind the « En attente d'enregistrement » badge — names the lecteur
    // and the date d'envoi when known, so the admin can see what's holding it up.
    const blockedRecordingLabel = (recording: SerializedBlockingRecording) => {
        const details = [
            recording.readerName ? `lecteur ${recording.readerName}` : null,
            recording.sentToReaderDate ? `envoyé le ${formatDate(recording.sentToReaderDate)}` : null,
        ].filter(Boolean);

        return details.length
            ? `Duplication en attente : un enregistrement de cet ouvrage est en cours (${details.join(', ')}).`
            : "Duplication en attente : un enregistrement de cet ouvrage est en cours.";
    };

    // Wording lives in lib/billing-enums.ts — the journal des modifications
    // renders the same column and must not word it differently.

    // Keys are the real Status.name values (see prisma/seed.ts STATUSES) — the map
    // shortens them for the table and puts « Terminé »/« Soldé » in the feminine,
    // since a *demande* is what's being described.
    const getStatusDisplayName = (statusName: string) => {
        const displayMap: Record<string, string> = {
            'Attente envoi vers lecteur': 'À envoyer',
            'Attente envoi vers auditeur': 'À expédier',
            'Terminé': 'Terminée',
            'Soldé': 'Soldée',
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
        <Card className="bg-card border-border">
            <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-2xl text-foreground">Demandes</CardTitle>
                            <AideLink section="demandes" />
                        </div>
                        <CardDescription className="text-muted-foreground">
                            Gérer et suivre toutes les demandes
                        </CardDescription>
                    </div>
                    <Button
                        onClick={() => setIsAddModalOpen(true)}
                        className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Ajouter une demande
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-6">
                {/* Search and Filters */}
                <div className="space-y-4">
                    {/* Search Bar */}
                    {!hideSearch && (
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                                <Input
                                    placeholder="Rechercher par auditeur, livre, ou email..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground"
                                />
                            </div>
                            {searchTerm && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleClearSearch}
                                    className="text-muted-foreground hover:text-foreground hover:bg-muted"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                            <Button
                                onClick={handleSearch}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                                disabled={isPending}
                            >
                                Rechercher
                            </Button>
                        </div>
                    )}

                    {/* Filters — 6 colonnes pour que « Livre » en occupe deux :
                        un titre tient mal dans la largeur d'un select de statut. */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                        <BookFilterPicker
                            book={filterBook}
                            label="Livre"
                            className="md:col-span-2"
                        />

                        <div>
                            <label className="text-sm text-muted-foreground mb-1.5 block">Statut de la demande</label>
                            <Select
                                value={currentStatusId}
                                onValueChange={(value) => handleFilterChange('statusId', value)}
                            >
                                <SelectTrigger className="bg-field border-border text-foreground">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    <SelectItem value="all" className="text-foreground">Tous les statuts</SelectItem>
                                    {/* « Soldé » is a facture status — no demande can hold it, so it
                                        isn't offered as a filter (kept only if already in the URL). */}
                                    {availableStatuses
                                        .filter((status) => status.id !== STATUS.SOLDE || currentStatusId === String(STATUS.SOLDE))
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

                        <div>
                            <label className="text-sm text-muted-foreground mb-1.5 block">Facturation</label>
                            <Select
                                value={currentBillingStatus}
                                onValueChange={(value) => handleFilterChange('billingStatus', value)}
                            >
                                <SelectTrigger className="bg-field border-border text-foreground">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    <SelectItem value="all" className="text-foreground">Tous</SelectItem>
                                    <SelectItem value="UNBILLED" className="text-foreground">Non facturé</SelectItem>
                                    <SelectItem value="BILLED" className="text-foreground">Facturé</SelectItem>
                                    <SelectItem value="UNBILLABLE" className="text-foreground">Non facturable</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-sm text-muted-foreground mb-1.5 block">Type</label>
                            <Select
                                value={currentIsDuplication}
                                onValueChange={(value) => handleFilterChange('isDuplication', value)}
                            >
                                <SelectTrigger className="bg-field border-border text-foreground">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    <SelectItem value="all" className="text-foreground">Tous</SelectItem>
                                    <SelectItem value="true" className="text-foreground">Duplication</SelectItem>
                                    {/* Duplications held up by an enregistrement still in flight. */}
                                    <SelectItem value="blocked" className="text-foreground">Duplication en attente</SelectItem>
                                    <SelectItem value="false" className="text-foreground">Enregistrement</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-sm text-muted-foreground mb-1.5 block">Retard</label>
                            <Select
                                value={currentRetard}
                                onValueChange={(value) => handleFilterChange('retard', value)}
                            >
                                <SelectTrigger className="bg-field border-border text-foreground">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    <SelectItem value="all" className="text-foreground">Tous</SelectItem>
                                    <SelectItem value="true" className="text-foreground">En retard</SelectItem>
                                    <SelectItem value="surveiller" className="text-foreground">À surveiller</SelectItem>
                                    <SelectItem value="false" className="text-foreground">À jour</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {filterBook && <BookFilterBadge book={filterBook} noun="demandes" />}
                </div>

                {/* Loading Overlay */}
                {isPending && (
                    <div className="relative">
                        <div className="absolute inset-0 bg-card/50 flex items-center justify-center z-10 rounded-lg">
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                                <p className="text-sm text-foreground">Chargement...</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Orders Table */}
                <div className="relative">
                    {initialOrders.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-muted-foreground text-lg">Aucune demande trouvée</p>
                            <SearchRescue
                                suggestions={searchSuggestions}
                                unit={{ one: 'demande', many: 'demandes', feminine: true }}
                                onApply={(s) => {
                                    setSearchTerm(s.query);
                                    // A lifted filter is its URL parameter, cleared.
                                    const lifted = Object.fromEntries(s.lifted.map((key) => [key, '']));
                                    startTransition(() => {
                                        router.push(`?${createQueryString({ ...lifted, search: s.query })}`);
                                    });
                                }}
                                onOpenRow={(row) => openOrderById(row.id)}
                            />
                        </div>
                    ) : (
                        <div className={`border border-border rounded-lg overflow-hidden ${isPending ? 'opacity-50' : ''}`}>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-card">
                                        <TableRow className="border-b border-border hover:bg-muted">
                                            <TableHead className="text-foreground font-medium">ID</TableHead>
                                            <TableHead className="text-foreground font-medium">Auditeur</TableHead>
                                            <TableHead className="text-foreground font-medium">Livre</TableHead>
                                            <TableHead className="text-foreground font-medium">Date demande</TableHead>
                                            <TableHead className="text-foreground font-medium">Statut</TableHead>
                                            <TableHead className="text-foreground font-medium">Attribution</TableHead>
                                            <TableHead className="text-foreground font-medium">Facturation</TableHead>
                                            {/* Header text is for screen readers only, but the cell
                                                itself must stay in flow — an sr-only <th> is
                                                position:absolute and drops out of the column count,
                                                leaving the header one cell short of every body row. */}
                                            <TableHead className="text-foreground font-medium w-[1%] whitespace-nowrap">
                                                <span className="sr-only">Étiquette d&apos;adresse</span>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {initialOrders.map((order) => {
                                            // Computed server-side, per stage — lib/orders/delais.ts.
                                            const delai = delais[order.id];
                                            const isOverdue = delai?.niveau === 'en_retard';
                                            const blockedBy = blockedDuplications[order.id];
                                            const aveugleName = getUserNameOnly(order.aveugle);
                                            return (
                                                <TableRow
                                                    key={order.id}
                                                    onClick={() => handleRowClick(order)}
                                                    className={`group border-b border-border hover:bg-muted cursor-pointer transition-colors ${
                                                        isOverdue ? 'bg-red-100/70 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/40' : ''
                                                    }`}
                                                >
                                                    <TableCell className={`font-medium whitespace-nowrap ${isOverdue ? 'text-red-700 dark:text-red-300' : 'text-foreground'}`}>
                                                        <CopyIdButton id={order.id} label="de la demande" />
                                                    </TableCell>
                                                    <TableCell className={isOverdue ? 'text-red-900 dark:text-red-200' : 'text-foreground'}>
                                                        <div>
                                                            {/* Le nom mène au dossier de l'auditeur. C'était le
                                                                chemin manquant : une demande n'a qu'un auditeur —
                                                                donc un lien, pas un filtre — et son dossier ne
                                                                s'atteignait que par la liste des membres, alors
                                                                que c'est ici qu'on tombe sur son nom. Comme pour
                                                                la colonne « Attribution », stopPropagation :
                                                                sinon le clic ouvrirait aussi la demande.

                                                                Pas de lien dans un dossier (`presetClient`) : la
                                                                liste y est déjà celle de cette personne, chaque
                                                                ligne renverrait donc à la page ouverte. */}
                                                            <div className="font-medium">
                                                                {presetClient ? (
                                                                    aveugleName || order.aveugle.email
                                                                ) : (
                                                                    <Link
                                                                        href={`/admin/users/dossier/${order.aveugleId}/demandes`}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2"
                                                                    >
                                                                        {aveugleName || order.aveugle.email}
                                                                    </Link>
                                                                )}
                                                            </div>
                                                            {aveugleName && (
                                                                <div className={`text-sm ${isOverdue ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground'}`}>
                                                                    {order.aveugle.email}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className={isOverdue ? 'text-red-900 dark:text-red-200' : 'text-foreground'}>
                                                        <div>
                                                            <div className="font-medium">{order.catalogue.title}</div>
                                                            <div className={`text-sm ${isOverdue ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground'}`}>
                                                                {order.catalogue.author}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className={isOverdue ? 'text-red-900 dark:text-red-200' : 'text-foreground'}>
                                                        {formatDate(order.requestReceivedDate)}
                                                    </TableCell>
                                                    <TableCell>
                                                        {/* A duplication waiting on an in-flight enregistrement is
                                                            « À faire » in the DB but can't actually be started yet.
                                                            Derived, never stored — see lib/orders/duplicationBlocked.ts. */}
                                                        {blockedBy ? (
                                                            <span
                                                                title={blockedRecordingLabel(blockedBy)}
                                                                className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
                                                            >
                                                                En attente d&apos;enregistrement
                                                            </span>
                                                        ) : (
                                                            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                                                isOverdue
                                                                    ? 'bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-300'
                                                                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                                                            }`}>
                                                                {getStatusDisplayName(order.status.name)}
                                                            </span>
                                                        )}
                                                        {/* The reason, in words — the row colour alone says
                                                            nothing to a screen reader, nor which clock ran out.
                                                            Only past a line: an « à jour » row stays quiet. */}
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
                                                    {/* Visible sans ouvrir la ligne : c'est en cherchant à qui
                                                        une demande était déjà attribuée que les permanents
                                                        restaient bloqués. Le lien arrête la propagation, sinon
                                                        le clic ouvrirait aussi la demande. */}
                                                    <TableCell className="whitespace-nowrap">
                                                        {order.assignments[0] ? (
                                                            <Link
                                                                href={`/admin/assignments?assignment=${order.assignments[0].id}`}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="inline-flex flex-col text-sm"
                                                            >
                                                                <span className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2">
                                                                    #{order.assignments[0].id}
                                                                </span>
                                                                <span className="text-xs text-muted-foreground">
                                                                    {order.assignments[0].status.name}
                                                                </span>
                                                            </Link>
                                                        ) : order.isDuplication ? (
                                                            <span className="text-xs text-muted-foreground">Duplication</span>
                                                        ) : (
                                                            <span className="text-muted-foreground">
                                                                <span aria-hidden>—</span>
                                                                <span className="sr-only">Aucune attribution</span>
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <span
                                                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                                                order.billingStatus === 'BILLED'
                                                                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
                                                                    : 'bg-muted text-muted-foreground'
                                                            }`}
                                                        >
                                                            {getOrderBillingStatusLabel(order.billingStatus)}
                                                        </span>
                                                    </TableCell>
                                                    {/* Étiquette d'adresse. Offered on every demande rather
                                                        than only on « Attente envoi vers auditeur » ones: that
                                                        status IS the shipping worklist (lib/statusSync.ts), but
                                                        a label also gets reprinted after it has moved on — a
                                                        torn sleeve, a second parcel — and hiding the button then
                                                        is exactly the dead end this replaces. */}
                                                    <TableCell className="w-[1%] whitespace-nowrap text-right">
                                                        <MailingLabelButton
                                                            variant="icon"
                                                            userId={order.aveugleId}
                                                            shipment={{
                                                                orderId: order.id,
                                                                title: order.catalogue.title,
                                                                isDuplication: order.isDuplication,
                                                                mediaFormat: order.mediaFormat?.name,
                                                            }}
                                                        />
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
                        <div className="fixed inset-0 bg-card/80 backdrop-blur-sm flex items-center justify-center z-50">
                            <div className="bg-card rounded-lg p-8 shadow-2xl border border-border">
                                <div className="flex flex-col items-center gap-4">
                                    <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
                                    <p className="text-lg font-medium text-foreground">Chargement de la demande...</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Enhanced Pagination */}
                {totalPages > 1 && (
                    <div className={`flex flex-wrap justify-center items-center gap-2 mt-6 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
                        <Button
                            size="sm"
                            className="bg-card text-foreground border-border hover:bg-muted"
                            onClick={() => handlePageChange(1)}
                            disabled={currentPage === 1 || isPending}
                        >
                            {'<<'}
                        </Button>
                        <Button
                            size="sm"
                            className="bg-card text-foreground border-border hover:bg-muted"
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
                                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                        : "bg-card text-foreground border-border hover:bg-muted"}
                                    onClick={() => handlePageChange(page)}
                                    disabled={isPending}
                                >
                                    {page}
                                </Button>
                            ) : (
                                <span key={index} className="text-muted-foreground px-2">{page}</span>
                            )
                        ))}
                        <Button
                            size="sm"
                            className="bg-card text-foreground border-border hover:bg-muted"
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages || isPending}
                        >
                            {'>'}
                        </Button>
                        <Button
                            size="sm"
                            className="bg-card text-foreground border-border hover:bg-muted"
                            onClick={() => handlePageChange(totalPages)}
                            disabled={currentPage === totalPages || isPending}
                        >
                            {'>>'}
                        </Button>
                    </div>
                )}

                {totalPages > 1 && (
                    <p className="text-center text-sm text-muted-foreground mt-2">
                        Page {currentPage} sur {totalPages}
                    </p>
                )}
            </CardContent>

            {/* Add Order Dialog */}
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Ajouter une nouvelle demande</DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto px-1">
                        <AddOrderFormBackend onSuccess={handleOrderAdded} initialClient={presetClient} />
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Order Modal */}
            {selectedOrder && (
                <EditOrderModal
                    isOpen={isEditModalOpen}
                    onOpenChange={(open) => {
                        setIsEditModalOpen(open);
                        if (!open) {
                            setSelectedOrder(null);
                            clearOrderParam();
                            // Sub-actions performed while the modal was open (e.g. changing
                            // the book) persist via their own request but never told the
                            // table to refetch; the post-save close also lands here. Refresh
                            // on every close so any DB change is reflected in the table.
                            router.refresh();
                        }
                    }}
                    orderId={selectedOrder.id}
                    initialData={selectedOrder.data}
                    onOrderEdited={handleOrderEdited}
                    onOrderDeleted={handleOrderDeleted}
                    initialSelectedUser={selectedOrder.selectedUser}
                    initialSelectedBook={selectedOrder.selectedBook}
                    initialSelectedStaff={selectedOrder.selectedStaff}
                    initialBill={selectedOrder.bill}
                    deletedAt={selectedOrder.deletedAt}
                />
            )}
        </Card>
    );
}