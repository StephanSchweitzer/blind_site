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
import { Search, X, Plus, Loader2, ArrowDown, ArrowUp, ArrowUpDown, FilterX } from 'lucide-react';
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
import { MobileFilters } from '@/admin/MobileFilters';
import { AdminPaginationBottom, AdminPaginationTop } from '@/admin/AdminPagination';
import type { BookFilter } from '@/lib/books/bookFilter';
import { SearchRescue } from '@/components/ui/search-rescue';
import type { RescueSuggestion } from '@/lib/search-suggestion-types';
import type { PageInfo } from '@/lib/pagination';
import {
    DEFAULT_ORDER_SORT,
    ORDER_SORT_DEFAULT_DIR,
    type OrderSort,
    type OrderSortKey,
} from '@/lib/orders/orderSort';
import { orderStatusStyle } from '@/lib/orders/statusDisplay';
import { SECTION_ICONS, sectionAccent } from '@/components/admin/section-icons';
import { cn } from '@/lib/utils';

type OrdersTableProps = {
    initialOrders: SerializedOrderTableRow[];
    /** Page courante, taille, total — lib/pagination.ts `pageInfo`. */
    pagination: PageInfo;
    sort: OrderSort;
    initialSearch: string;
    availableStatuses: { id: number; name: string }[];
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

const NOUN = { one: 'demande', many: 'demandes', feminine: true };
const LIST_TOP = 'demandes-haut';
const SectionIcon = SECTION_ICONS['Demandes'];
const accent = sectionAccent('Demandes');

/**
 * En-tête de colonne triable. Le tri est une action sur la liste, pas un
 * lien : un bouton, et `aria-sort` sur la cellule pour le lecteur d'écran. Le
 * texte du bouton reste le seul nom de la colonne — la mise en page téléphone
 * le recopie devant chaque valeur (`data-label`, components/ui/table.tsx).
 */
function SortableHead({
    label,
    sortKey,
    sort,
    onSort,
    className,
}: {
    label: string;
    sortKey: OrderSortKey;
    sort: OrderSort;
    onSort: (key: OrderSortKey) => void;
    className?: string;
}) {
    const active = sort.key === sortKey;
    const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
        <TableHead
            aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
            className={cn('text-foreground font-medium', className)}
        >
            <button
                type="button"
                onClick={() => onSort(sortKey)}
                className={cn(
                    '-mx-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active && 'text-foreground font-semibold',
                )}
            >
                {label}
                <Icon className={cn('h-3.5 w-3.5', !active && 'text-muted-foreground/70')} aria-hidden="true" />
            </button>
        </TableHead>
    );
}

export default function OrdersTable({
                                        initialOrders,
                                        pagination,
                                        sort,
                                        initialSearch,
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

    const currentBillingStatus = searchParams.get('billingStatus') || 'all';
    const currentStatusId = searchParams.get('statusId') || 'all';
    const currentIsDuplication = searchParams.get('isDuplication') || 'all';
    const currentRetard = searchParams.get('retard') || 'all';

    // Every filter the URL carries except the free-text search — the « Filtres »
    // button's badge on a phone, and whether « Effacer les filtres » shows.
    const activeFilterCount = [
        filterBook,
        currentStatusId !== 'all',
        currentBillingStatus !== 'all',
        currentIsDuplication !== 'all',
        currentRetard !== 'all',
        searchParams.get('filter') === 'needsReturn',
    ].filter(Boolean).length;

    const navigate = useCallback(
        (href: string) => startTransition(() => router.push(href, { scroll: false })),
        [router],
    );

    // A filter, the search or the sort changes which rows exist, so the page
    // goes back to the first one (dropped from the URL rather than set to 1).
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
            if (!updates.page) params.delete('page');
            return params.toString();
        },
        [searchParams]
    );

    const push = (updates: Record<string, string>) => navigate(`?${createQueryString(updates)}`);

    const handleSearch = (e?: React.FormEvent) => {
        e?.preventDefault();
        push({ search: searchTerm.trim() });
    };

    const handleClearSearch = () => {
        setSearchTerm('');
        push({ search: '' });
    };

    const handleFilterChange = (filterType: string, value: string) => push({ [filterType]: value });

    const handleClearFilters = () =>
        push({ bookId: '', statusId: '', billingStatus: '', isDuplication: '', retard: '', filter: '' });

    // Same column: flip it. Another column: its natural direction. The default
    // order (date, newest first) leaves the URL bare.
    const handleSort = (key: OrderSortKey) => {
        const dir = sort.key === key
            ? (sort.dir === 'asc' ? 'desc' : 'asc')
            : ORDER_SORT_DEFAULT_DIR[key];
        const isDefault = key === DEFAULT_ORDER_SORT.key && dir === DEFAULT_ORDER_SORT.dir;
        push({ sort: isDefault ? '' : key, dir: isDefault || dir === ORDER_SORT_DEFAULT_DIR[key] ? '' : dir });
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

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        {/* La couleur de la section, celle de sa carte sur le tableau de bord. */}
                        <span
                            aria-hidden="true"
                            className={cn('hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg border sm:flex', accent.bg, accent.border, accent.text)}
                        >
                            <SectionIcon className="h-5 w-5" />
                        </span>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <CardTitle className="text-2xl text-foreground">Demandes</CardTitle>
                                <AideLink section="demandes" />
                            </div>
                            <CardDescription className="text-muted-foreground">
                                Gérer et suivre toutes les demandes
                            </CardDescription>
                        </div>
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

            <CardContent className="space-y-5">
                {/* Recherche et filtres — un bloc, que le mode d'emploi
                    photographie seul (scripts/capture-aide-screenshots.mjs). */}
                <div className="space-y-4">
                {!hideSearch && (
                    <form role="search" onSubmit={handleSearch} className="flex gap-2">
                        <div className="relative flex-1">
                            <label htmlFor="orders-search" className="sr-only">Rechercher une demande</label>
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" aria-hidden="true" />
                            <Input
                                id="orders-search"
                                type="search"
                                placeholder="Auditeur, livre ou n° de demande…"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 pr-10 bg-card border-border text-foreground placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={handleClearSearch}
                                    aria-label="Effacer la recherche"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                        <Button
                            type="submit"
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                            disabled={isPending}
                        >
                            Rechercher
                        </Button>
                    </form>
                )}

                {/* Filters — 6 colonnes pour que « Livre » en occupe deux :
                    un titre tient mal dans la largeur d'un select de statut. */}
                <MobileFilters
                    activeCount={activeFilterCount}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4"
                >
                    <BookFilterPicker
                        book={filterBook}
                        label="Livre"
                        className="md:col-span-2"
                    />

                    <div>
                        <label htmlFor="orders-status" className="text-sm text-muted-foreground mb-1.5 block">Statut de la demande</label>
                        <Select
                            value={currentStatusId}
                            onValueChange={(value) => handleFilterChange('statusId', value)}
                        >
                            <SelectTrigger id="orders-status" className="bg-field border-border text-foreground">
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
                        <label htmlFor="orders-billing" className="text-sm text-muted-foreground mb-1.5 block">Facturation</label>
                        <Select
                            value={currentBillingStatus}
                            onValueChange={(value) => handleFilterChange('billingStatus', value)}
                        >
                            <SelectTrigger id="orders-billing" className="bg-field border-border text-foreground">
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
                        <label htmlFor="orders-type" className="text-sm text-muted-foreground mb-1.5 block">Type</label>
                        <Select
                            value={currentIsDuplication}
                            onValueChange={(value) => handleFilterChange('isDuplication', value)}
                        >
                            <SelectTrigger id="orders-type" className="bg-field border-border text-foreground">
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
                        <label htmlFor="orders-retard" className="text-sm text-muted-foreground mb-1.5 block">Retard</label>
                        <Select
                            value={currentRetard}
                            onValueChange={(value) => handleFilterChange('retard', value)}
                        >
                            <SelectTrigger id="orders-retard" className="bg-field border-border text-foreground">
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
                </MobileFilters>

                {filterBook && <BookFilterBadge book={filterBook} noun="demandes" />}
                </div>

                {/* The list — aria-busy while a filter, sort or page change loads. */}
                <div aria-busy={isPending} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <AdminPaginationTop
                                info={pagination}
                                noun={NOUN}
                                label="Pages des demandes"
                                onNavigate={navigate}
                                pending={isPending}
                                anchorId={LIST_TOP}
                            />
                        </div>
                        {activeFilterCount > 0 && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleClearFilters}
                                className="text-muted-foreground hover:text-foreground hover:bg-muted"
                            >
                                <FilterX className="h-4 w-4" aria-hidden="true" />
                                Effacer les filtres
                            </Button>
                        )}
                    </div>

                    <div className="relative">
                        {/* Fine barre de chargement : la liste reste lisible, grisée,
                            plutôt que masquée par un voile. */}
                        {isPending && (
                            <div aria-hidden="true" className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden rounded-full bg-primary/20">
                                <div className="h-full w-1/3 animate-pulse bg-primary" />
                            </div>
                        )}

                        {initialOrders.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border py-12 text-center">
                                <p className="text-muted-foreground text-lg">Aucune demande trouvée</p>
                                {activeFilterCount > 0 && !searchSuggestions?.length && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleClearFilters}
                                        className="mt-4 border-border bg-card text-foreground hover:bg-muted"
                                    >
                                        <FilterX className="h-4 w-4" aria-hidden="true" />
                                        Effacer les filtres
                                    </Button>
                                )}
                                <SearchRescue
                                    suggestions={searchSuggestions}
                                    unit={{ one: 'demande', many: 'demandes', feminine: true }}
                                    onApply={(s) => {
                                        setSearchTerm(s.query);
                                        // A lifted filter is its URL parameter, cleared.
                                        const lifted = Object.fromEntries(s.lifted.map((key) => [key, '']));
                                        push({ ...lifted, search: s.query });
                                    }}
                                    onOpenRow={(row) => openOrderById(row.id)}
                                />
                            </div>
                        ) : (
                            <div className={cn('border border-border rounded-lg overflow-clip transition-opacity', isPending && 'opacity-60')}>
                                <Table stickyHeader mobileCards>
                                    <TableHeader className="bg-card">
                                        <TableRow className="border-b border-border hover:bg-transparent">
                                            <SortableHead label="N°" sortKey="id" sort={sort} onSort={handleSort} />
                                            {/* Dans un dossier, toutes les lignes ont le même auditeur. */}
                                            {presetClient ? (
                                                <TableHead className="text-foreground font-medium">Auditeur</TableHead>
                                            ) : (
                                                <SortableHead label="Auditeur" sortKey="auditeur" sort={sort} onSort={handleSort} />
                                            )}
                                            <SortableHead label="Livre" sortKey="livre" sort={sort} onSort={handleSort} />
                                            <SortableHead label="Date demande" sortKey="date" sort={sort} onSort={handleSort} />
                                            <SortableHead label="Statut" sortKey="statut" sort={sort} onSort={handleSort} />
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
                                            const statusStyle = orderStatusStyle({ id: order.statusId, name: order.status.name });
                                            return (
                                                <TableRow
                                                    key={order.id}
                                                    onClick={() => handleRowClick(order)}
                                                    className={cn(
                                                        'group border-b border-border hover:bg-muted cursor-pointer transition-colors',
                                                        isOverdue && 'bg-red-100/70 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/40',
                                                    )}
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
                                                        {/* Le titre ouvre la demande. La ligne entière reste
                                                            cliquable à la souris, mais une ligne n'est pas
                                                            atteignable au clavier : sans ce bouton, une demande
                                                            ne s'ouvrait qu'à la souris ou par un lien ?order=.
                                                            Un seul enfant dans la cellule : la carte téléphone
                                                            met le nom de colonne et la valeur sur deux colonnes. */}
                                                        <div>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleRowClick(order);
                                                                }}
                                                                className="text-left font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                                                            >
                                                                <span className="sr-only">Ouvrir la demande n°{order.id} : </span>
                                                                {order.catalogue.title}
                                                            </button>
                                                            <div className={`text-sm ${isOverdue ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground'}`}>
                                                                {order.catalogue.author}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className={cn('whitespace-nowrap tabular-nums', isOverdue ? 'text-red-900 dark:text-red-200' : 'text-foreground')}>
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
                                                            <span
                                                                title={order.status.name}
                                                                className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium', statusStyle.badge)}
                                                            >
                                                                {statusStyle.short}
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
                                                            className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${
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
                        )}
                    </div>

                    <AdminPaginationBottom
                        info={pagination}
                        noun={NOUN}
                        label="Pages des demandes"
                        onNavigate={navigate}
                        pending={isPending}
                        anchorId={LIST_TOP}
                    />
                </div>

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
