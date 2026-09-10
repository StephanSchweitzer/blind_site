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
import { Search, X, Plus, Loader2, ExternalLink, ArrowDown, ArrowUp, ChevronsUpDown, RotateCcw, Download, SlidersHorizontal } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
    PaymentType,
    PaymentMethod,
    PAYMENT_TYPE_LABELS,
    PAYMENT_METHOD_LABELS,
    getPaymentTypeColor,
    getPaymentTypeLabel,
    getPaymentMethodLabel,
} from '@/lib/payment-enums';
import { AddPaymentFormBackend } from '@/admin/PaymentFormBackendBase';
import { EditPaymentModal } from '@/admin/EditPaymentModal';
import { DeletePaymentModal } from '@/admin/DeletePaymentModal';
import { CopyIdButton } from '@/admin/CopyableId';
import type { SerializedPaymentTableRow as Payment } from '@/types/models/payment.model';
import { getUserNameOnly } from '@/lib/users/displayName';
import { parisDateDisplay } from '@/lib/paris-day';
import { BillingStatus, getBillingStatusLabel, getBillingStatusColor } from '@/lib/billing-enums';
// list-params, pas list-query : ce fichier est 'use client', et list-query
// importe @prisma/client — qui ne peut pas entrer dans le bundle navigateur.
import {
    isDefaultPaymentFilters,
    paymentListParamsToQuery,
    type PaymentListParams,
    type PaymentSortField,
} from '@/lib/payments/list-params';
import { AideLink } from '@/components/ui/admin/AideLink';

interface PaymentsTableProps {
    initialPayments: Payment[];
    initialPage: number;
    /** Recherche, filtres et tri déjà analysés par lib/payments/list-query.ts. */
    initialParams: PaymentListParams;
    totalPages: number;
    availableTypes: PaymentType[];
    availableMethods: PaymentMethod[];
    initialTotalPayments: number;
    initialTotalAmount: string;
    hideSearch?: boolean;
    presetClient?: { id: number; name: string | null; firstName: string | null; lastName: string | null; email: string | null } | null;
}

/**
 * Un en-tête de colonne triable.
 *
 * Défini ici et non dans le rendu : un composant redéclaré à chaque rendu est
 * remonté par React à chaque fois (règle `static-components` du dépôt).
 *
 * La colonne active porte une flèche pleine, les autres un chevron estompé —
 * sans quoi rien ne distingue « trié par ce critère » de « triable ».
 */
function SortableHead({
    field,
    label,
    activeField,
    direction,
    onSort,
    className = '',
}: {
    field: PaymentSortField;
    label: string;
    activeField: PaymentSortField;
    direction: 'asc' | 'desc';
    onSort: (field: PaymentSortField) => void;
    className?: string;
}) {
    const isActive = activeField === field;
    return (
        <TableHead
            className={`text-foreground font-medium ${className}`}
            aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
            <button
                type="button"
                onClick={() => onSort(field)}
                title={`Trier par ${label.toLowerCase()}`}
                className="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
                {label}
                {isActive ? (
                    direction === 'asc' ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                    ) : (
                        <ArrowDown className="h-3.5 w-3.5" />
                    )
                ) : (
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                )}
            </button>
        </TableHead>
    );
}

/**
 * Un filtre posé, sous forme d'étiquette retirable.
 *
 * Les filtres vivent maintenant dans un panneau replié : sans ces étiquettes,
 * une liste filtrée serait indiscernable de la liste entière — on lirait « 47
 * paiements » sans voir nulle part pourquoi il n'y en a que 47. Elles rendent
 * la sélection lisible sans rouvrir le panneau, et chacune se retire seule.
 */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
            {label}
            <button
                type="button"
                onClick={onRemove}
                title={`Retirer le filtre « ${label} »`}
                aria-label={`Retirer le filtre ${label}`}
                className="text-muted-foreground hover:text-foreground transition-colors"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </span>
    );
}

/** 'YYYY-MM-DD' (jour parisien, cf. lib/paris-day.ts) → '31/01/2026', sans repasser par un Date. */
const frDay = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
};

export default function PaymentsTable({
                                          initialPayments,
                                          initialPage,
                                          initialParams,
                                          totalPages,
                                          availableTypes,
                                          availableMethods,
                                          initialTotalPayments,
                                          initialTotalAmount,
                                          hideSearch = false,
                                          presetClient = null,
                                      }: PaymentsTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [searchTerm, setSearchTerm] = useState(initialParams.search);
    // Le panneau de filtres s'ouvre à la demande et part replié, même quand des
    // filtres sont posés : ce sont les étiquettes sous la barre qui disent
    // lesquels: les rouvrir d'office remettrait le mur de contrôles que ce
    // panneau existe pour éviter.
    const [showFilters, setShowFilters] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    // Deep-link: open the view/edit modal directly from /admin/payments?payment=<id>.
    const [viewPaymentId, setViewPaymentId] = useState<number | null>(() => {
        const param = searchParams.get('payment');
        const id = param ? parseInt(param, 10) : NaN;
        return Number.isNaN(id) ? null : id;
    });
    const [paymentToDelete, setPaymentToDelete] = useState<number | null>(null);

    const currentPage = initialPage;
    // Le serveur a déjà validé chaque paramètre ; relire l'URL ici ferait afficher
    // comme actif un filtre que le serveur a écarté (« ?type=nimportequoi »).
    const { type: currentType, paymentMethod: currentMethod, sort, dir } = initialParams;
    const hasFilters = !isDefaultPaymentFilters(initialParams);

    // L'export part des paramètres ANALYSÉS, pas de l'URL du navigateur : dans
    // l'onglet d'un dossier, le client vient du segment de route et n'apparaît
    // dans aucune query string — un export construit sur l'URL aurait versé les
    // paiements de toute l'association. Un simple lien : le navigateur suit le
    // Content-Disposition de la route, sans fetch ni blob à gérer ici.
    const exportQuery = paymentListParamsToQuery(initialParams);
    const exportHref = `/api/payments/export${exportQuery ? `?${exportQuery}` : ''}`;

    const updateUrl = (updates: Record<string, string | undefined>) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(updates).forEach(([key, value]) => {
            if (value) params.set(key, value);
            else params.delete(key);
        });
        startTransition(() => {
            router.push(`?${params.toString()}`);
        });
    };

    // Strip the `payment` param from the URL so closing/reopening behaves
    // cleanly and the deep-link state doesn't linger after the modal closes.
    const clearPaymentParam = () => {
        if (searchParams.get('payment')) {
            const params = new URLSearchParams(searchParams.toString());
            params.delete('payment');
            const qs = params.toString();
            window.history.replaceState(window.history.state, '', qs ? `?${qs}` : window.location.pathname);
        }
    };

    const handleSearch = () => updateUrl({ search: searchTerm || undefined, page: '1' });
    const handleClearSearch = () => { setSearchTerm(''); updateUrl({ search: undefined, page: '1' }); };
    const handlePageChange = (newPage: number) => updateUrl({ page: newPage.toString() });
    const handleTypeFilter = (value: string) => updateUrl({ type: value === 'all' ? undefined : value, page: '1' });
    const handleMethodFilter = (value: string) => updateUrl({ paymentMethod: value === 'all' ? undefined : value, page: '1' });
    const handleDateFieldChange = (value: string) => updateUrl({ dateField: value === 'creationDate' ? undefined : value, page: '1' });
    const handleBoundChange = (key: 'from' | 'to', value: string) => updateUrl({ [key]: value || undefined, page: '1' });
    const handleToggle = (key: 'unlinked' | 'unallocated', on: boolean) => updateUrl({ [key]: on ? 'true' : undefined, page: '1' });

    // Un clic sur une colonne déjà triée inverse le sens ; sur une autre, il la
    // prend dans son sens le plus utile — décroissant pour une date ou un
    // montant (le plus récent, le plus gros), croissant pour un numéro.
    const handleSort = (field: PaymentSortField) => {
        const nextDir = sort === field ? (dir === 'asc' ? 'desc' : 'asc') : field === 'id' ? 'asc' : 'desc';
        updateUrl({
            sort: field === 'creationDate' && nextDir === 'desc' ? undefined : field,
            dir: nextDir === 'desc' ? undefined : nextDir,
            page: '1',
        });
    };

    const handleResetFilters = () => {
        setSearchTerm('');
        updateUrl({
            search: undefined, type: undefined, paymentMethod: undefined,
            from: undefined, to: undefined, dateField: undefined,
            unlinked: undefined, unallocated: undefined,
            sort: undefined, dir: undefined, page: '1',
        });
    };

    // Les filtres posés, dans l'ordre du panneau. La recherche n'en fait pas
    // partie : son champ reste visible et porte déjà sa propre croix.
    const activeFilters: { key: string; label: string; remove: () => void }[] = [];
    if (currentType) {
        activeFilters.push({ key: 'type', label: `Type : ${PAYMENT_TYPE_LABELS[currentType]}`, remove: () => handleTypeFilter('all') });
    }
    if (currentMethod) {
        activeFilters.push({ key: 'method', label: `Méthode : ${PAYMENT_METHOD_LABELS[currentMethod]}`, remove: () => handleMethodFilter('all') });
    }
    if (initialParams.from || initialParams.to) {
        const on = initialParams.dateField === 'paymentDate' ? 'Paiement' : 'Création';
        const span = initialParams.from && initialParams.to
            ? `du ${frDay(initialParams.from)} au ${frDay(initialParams.to)}`
            : initialParams.from
                ? `depuis le ${frDay(initialParams.from)}`
                : `jusqu'au ${frDay(initialParams.to!)}`;
        activeFilters.push({
            key: 'period',
            label: `${on} ${span}`,
            remove: () => updateUrl({ from: undefined, to: undefined, page: '1' }),
        });
    }
    if (initialParams.unlinked) {
        activeFilters.push({ key: 'unlinked', label: 'Sans facture liée', remove: () => handleToggle('unlinked', false) });
    }
    if (initialParams.unallocated) {
        activeFilters.push({ key: 'unallocated', label: 'Non affectés', remove: () => handleToggle('unallocated', false) });
    }

    const handlePaymentAdded = () => { setIsAddModalOpen(false); router.refresh(); };
    const handlePaymentDeleted = () => { setPaymentToDelete(null); router.refresh(); };

    // Le jour PARISIEN, pas celui du navigateur.
    //
    // `toLocaleDateString` datait chaque ligne dans le fuseau de qui regarde :
    // sur un poste réglé à l'ouest d'UTC, un paiement stocké au 9 juin à minuit
    // UTC s'affichait « 08/06/2026 ». Le décalage est resté invisible tant que
    // tout le monde lisait la liste depuis la France — jusqu'à ce que l'export
    // CSV, lui daté en heure française, annonce un autre jour que l'écran dont
    // il sort. C'est l'association qui date ses paiements, pas le poste qui les
    // consulte : même parti pris que lib/stats.ts et lib/billing.ts.
    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-';
        return parisDateDisplay(new Date(dateString));
    };

    const formatCurrency = (amount: string) =>
        new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(amount));

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
        for (let i = start; i <= end; i++) pages.push(i);
        if (end < totalPages - 1) pages.push('...');
        pages.push(totalPages);

        return pages;
    };

    const visiblePages = getVisiblePages();

    return (
        <Card className="bg-card border-border">
            <CardHeader className="border-b border-border pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-2xl font-bold text-foreground">Paiements</CardTitle>
                            <AideLink section="paiements" />
                        </div>
                        <CardDescription className="text-muted-foreground mt-1">
                            {initialTotalPayments} paiement{initialTotalPayments > 1 ? 's' : ''}
                            {' · '}
                            <span className="font-semibold text-foreground">{formatCurrency(initialTotalAmount)}</span>
                        </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <a
                            href={exportHref}
                            title={`Exporter ${initialTotalPayments} paiement${initialTotalPayments > 1 ? 's' : ''} au format CSV`}
                            className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-medium bg-card text-foreground border border-border hover:bg-muted transition-colors"
                        >
                            <Download className="h-4 w-4" />
                            Exporter (CSV)
                        </a>
                        <Button
                            onClick={() => setIsAddModalOpen(true)}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            Ajouter un paiement
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-6">
                {/* Une seule barre : chercher, et ouvrir les filtres.
                    Les six contrôles de filtrage tenaient auparavant sur deux
                    rangées pleine largeur, en permanence — un mur à traverser
                    avant d'atteindre le tableau, alors que la plupart des visites
                    ne posent aucun filtre. Ils vivent maintenant dans un panneau
                    replié, et l'état de la sélection se lit sur les étiquettes
                    juste en dessous. */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                    {!hideSearch && (
                        <div className="flex-1 flex gap-2 min-w-0">
                            <div className="relative flex-1 min-w-0">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                                <Input
                                    placeholder="Nom, n° de paiement, n° de facture, référence..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    className="pl-10 pr-9 bg-card border-border text-foreground placeholder:text-muted-foreground"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={handleClearSearch}
                                        title="Effacer la recherche"
                                        aria-label="Effacer la recherche"
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                            <Button onClick={handleSearch} className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isPending}>
                                Rechercher
                            </Button>
                        </div>
                    )}

                    <Button
                        variant="outline"
                        onClick={() => setShowFilters((open) => !open)}
                        aria-expanded={showFilters}
                        aria-controls="payment-filters"
                        className="h-10 shrink-0 bg-card text-foreground border-border hover:bg-muted flex items-center gap-2"
                    >
                        <SlidersHorizontal className="h-4 w-4" />
                        Filtres
                        {activeFilters.length > 0 && (
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                                {activeFilters.length}
                            </span>
                        )}
                    </Button>
                </div>

                {/* Les filtres posés, lisibles panneau fermé. */}
                {hasFilters && (
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        {activeFilters.map((f) => (
                            <FilterChip key={f.key} label={f.label} onRemove={f.remove} />
                        ))}
                        <button
                            type="button"
                            onClick={handleResetFilters}
                            disabled={isPending}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Tout réinitialiser
                        </button>
                    </div>
                )}

                {/* Le panneau de filtres.
                    La période porte au choix sur la date de création ou celle du
                    règlement : « qu'a-t-on saisi en janvier » et « qu'a-t-on encaissé
                    en janvier » sont deux questions, et une seule des deux colonnes
                    ne peut pas répondre aux deux. Les bornes sont des jours
                    parisiens, inclusives (voir lib/paris-day.ts). */}
                {showFilters && (
                    <div
                        id="payment-filters"
                        className="rounded-lg border border-border bg-muted/40 p-4 mb-6 space-y-4"
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-1.5">
                                <label className="block text-xs text-muted-foreground uppercase tracking-wide">Type</label>
                                <Select value={currentType ?? 'all'} onValueChange={handleTypeFilter}>
                                    <SelectTrigger className="w-full bg-field border-border text-foreground">
                                        <SelectValue placeholder="Filtrer par type" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border">
                                        <SelectItem value="all" className="text-foreground">Tous les types</SelectItem>
                                        {availableTypes.map((t) => (
                                            <SelectItem key={t} value={t} className="text-foreground">
                                                {PAYMENT_TYPE_LABELS[t]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-xs text-muted-foreground uppercase tracking-wide">Méthode</label>
                                <Select value={currentMethod ?? 'all'} onValueChange={handleMethodFilter}>
                                    <SelectTrigger className="w-full bg-field border-border text-foreground">
                                        <SelectValue placeholder="Filtrer par méthode" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border">
                                        <SelectItem value="all" className="text-foreground">Toutes les méthodes</SelectItem>
                                        {availableMethods.map((m) => (
                                            <SelectItem key={m} value={m} className="text-foreground">
                                                {PAYMENT_METHOD_LABELS[m]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-xs text-muted-foreground uppercase tracking-wide">Période sur</label>
                                <Select value={initialParams.dateField} onValueChange={handleDateFieldChange}>
                                    <SelectTrigger className="w-full bg-field border-border text-foreground">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border">
                                        <SelectItem value="creationDate" className="text-foreground">Date de création</SelectItem>
                                        <SelectItem value="paymentDate" className="text-foreground">Date de paiement</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="block text-xs text-muted-foreground uppercase tracking-wide">Du</label>
                                    <Input
                                        type="date"
                                        value={initialParams.from ?? ''}
                                        onChange={(e) => handleBoundChange('from', e.target.value)}
                                        className="w-full bg-field border-border text-foreground"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-xs text-muted-foreground uppercase tracking-wide">Au</label>
                                    <Input
                                        type="date"
                                        value={initialParams.to ?? ''}
                                        onChange={(e) => handleBoundChange('to', e.target.value)}
                                        className="w-full bg-field border-border text-foreground"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-3">
                            <span className="text-xs text-muted-foreground uppercase tracking-wide">Rapprochement</span>
                            <label className="flex items-center gap-2 text-foreground text-sm cursor-pointer whitespace-nowrap">
                                <Checkbox
                                    checked={initialParams.unlinked}
                                    onCheckedChange={(checked) => handleToggle('unlinked', !!checked)}
                                    className="border-border"
                                />
                                Sans facture liée
                            </label>

                            <label className="flex items-center gap-2 text-foreground text-sm cursor-pointer whitespace-nowrap">
                                <Checkbox
                                    checked={initialParams.unallocated}
                                    onCheckedChange={(checked) => handleToggle('unallocated', !!checked)}
                                    className="border-border"
                                />
                                Non affectés
                            </label>
                        </div>
                    </div>
                )}

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

                {/* Payments Table */}
                <div className="relative">
                    {initialPayments.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-muted-foreground text-lg">Aucun paiement trouvé</p>
                        </div>
                    ) : (
                        <div className={`border border-border rounded-lg overflow-hidden ${isPending ? 'opacity-50' : ''}`}>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-card">
                                        <TableRow className="border-b border-border hover:bg-muted">
                                            {/* Seules les colonnes que la base sait trier sont
                                                cliquables : « Client » se trie sur une relation et
                                                « Type » sur l'ordre de l'enum, pas sur son
                                                libellé — un tri qui rendrait Cotisation, Don,
                                                Enregistrement dans le désordre alphabétique
                                                mentirait plus qu'il n'aiderait. */}
                                            <SortableHead field="id" label="ID" activeField={sort} direction={dir} onSort={handleSort} />
                                            <TableHead className="text-foreground font-medium">Client</TableHead>
                                            <TableHead className="text-foreground font-medium">Type</TableHead>
                                            <TableHead className="text-foreground font-medium">Méthode</TableHead>
                                            <TableHead className="text-foreground font-medium">Facture</TableHead>
                                            <SortableHead field="creationDate" label="Date de création" activeField={sort} direction={dir} onSort={handleSort} />
                                            <SortableHead field="paymentDate" label="Date de paiement" activeField={sort} direction={dir} onSort={handleSort} />
                                            <SortableHead field="amount" label="Montant" activeField={sort} direction={dir} onSort={handleSort} />
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {initialPayments.map((payment) => (
                                            <TableRow
                                                key={payment.id}
                                                onClick={() => setViewPaymentId(payment.id)}
                                                className="group border-b border-border cursor-pointer hover:bg-muted"
                                            >
                                                <TableCell className="font-medium text-foreground whitespace-nowrap">
                                                    #{payment.id}
                                                    <CopyIdButton id={payment.id} label="du paiement" />
                                                </TableCell>
                                                <TableCell className="text-foreground">
                                                    {payment.client ? (
                                                        <div>
                                                            <div className="font-medium">{getUserNameOnly(payment.client) || 'N/A'}</div>
                                                            <div className="text-sm text-muted-foreground">{payment.client.email}</div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground italic">Anonyme</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getPaymentTypeColor(payment.type)}`}>
                                                        {getPaymentTypeLabel(payment.type)}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-foreground">
                                                    {getPaymentMethodLabel(payment.paymentMethod)}
                                                </TableCell>
                                                <TableCell className="text-foreground">
                                                    {payment.bill ? (
                                                        <a
                                                            href={`/admin/bills?bill=${payment.bill.id}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            title="Ouvrir la facture dans un nouvel onglet"
                                                            className="inline-flex items-center gap-1.5 whitespace-nowrap hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                                        >
                                                            #{payment.bill.id}
                                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getBillingStatusColor(payment.bill.state as BillingStatus)}`}>
                                                                {getBillingStatusLabel(payment.bill.state as BillingStatus)}
                                                            </span>
                                                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                                        </a>
                                                    ) : (
                                                        <span className="text-muted-foreground">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-foreground">{formatDate(payment.creationDate)}</TableCell>
                                                <TableCell className="text-foreground">{formatDate(payment.paymentDate)}</TableCell>
                                                <TableCell className="text-foreground font-semibold">{formatCurrency(payment.amount)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Pagination */}
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
                        {visiblePages.map((page, index) =>
                            typeof page === 'number' ? (
                                <Button
                                    key={index}
                                    variant={currentPage === page ? 'default' : 'outline'}
                                    size="sm"
                                    className={currentPage === page
                                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                        : 'bg-card text-foreground border-border hover:bg-muted'}
                                    onClick={() => handlePageChange(page)}
                                    disabled={isPending}
                                >
                                    {page}
                                </Button>
                            ) : (
                                <span key={index} className="text-muted-foreground px-2">{page}</span>
                            )
                        )}
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

            {/* Add Payment Dialog */}
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Créer un nouveau paiement</DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto px-1">
                        <AddPaymentFormBackend onSuccess={handlePaymentAdded} initialClient={presetClient} />
                    </div>
                </DialogContent>
            </Dialog>

            {/* View / Edit Payment Modal */}
            <EditPaymentModal
                isOpen={viewPaymentId !== null}
                onOpenChange={(open) => { if (!open) { setViewPaymentId(null); clearPaymentParam(); } }}
                paymentId={viewPaymentId}
                onRequestDelete={(id) => { setViewPaymentId(null); clearPaymentParam(); setPaymentToDelete(id); }}
                onPaymentUpdated={() => router.refresh()}
            />

            {/* Delete Payment Modal */}
            <DeletePaymentModal
                isOpen={paymentToDelete !== null}
                onOpenChange={(open) => { if (!open) setPaymentToDelete(null); }}
                paymentId={paymentToDelete}
                onPaymentDeleted={handlePaymentDeleted}
            />
        </Card>
    );
}