import React, {useState, useEffect, useCallback, useRef} from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Calendar, Search, History, User as UserIcon, ChevronRight, Package, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
    ReaderSummary,
    BookSummary,
    OrderSummary,
    Status,
    AssignmentFormData,
    AssignmentReaderHistory,
} from '@/types';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { STATUS } from '@/lib/statusSync';
import { useFormToast } from '@/hooks/useFormToast';
import { useInvalidField } from '@/hooks/useInvalidField';

// N3 — required fields, visual top→bottom (book derives from the order picker).
const ASSIGN_FIELD_ORDER = ['catalogueId', 'statusId'];

/**
 * Maps a server validation response ({ message, errors }) into readable French
 * lines so the user sees WHICH field failed and why — instead of a bare
 * "Données invalides" that looks like their fault.
 */
const FIELD_LABELS: Record<string, string> = {
    catalogueId: 'Livre',
    orderId: 'Commande',
    statusId: 'Statut',
    receptionDate: 'Date de réception',
    sentToReaderDate: 'Date d\'envoi au lecteur',
    returnedToECADate: 'Date de retour à l\'ECA',
    notes: 'Notes',
    processedByStaffId: 'Traité par',
};

function humanizeMessage(raw: string): string {
    // Normalize Zod date/datetime messages to something non-technical.
    if (/Invalid ISO date|Invalid ISO datetime|Invalid datetime|Invalid date/i.test(raw)) {
        return 'format de date invalide';
    }
    return raw;
}

function getFieldErrorLines(data: unknown): string[] {
    if (!data || typeof data !== 'object') return [];
    const errors = (data as { errors?: Record<string, string[]> }).errors;
    if (!errors || typeof errors !== 'object') return [];

    return Object.entries(errors).flatMap(([field, messages]) => {
        const label = FIELD_LABELS[field] ?? field;
        const list = Array.isArray(messages) ? messages : [String(messages)];
        return list.map((m) => `${label} : ${humanizeMessage(m)}`);
    });
}

function ErrorToastBody({ message, lines }: { message: string; lines: string[] }) {
    return (
        <div className="text-xl mt-2">
            <p>{message}</p>
            {lines.length > 0 && (
                <ul className="mt-2 list-disc list-inside text-base font-normal">
                    {lines.map((line, i) => (
                        <li key={i}>{line}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export interface AssignmentFormBackendBaseProps {
    presetClientId?: number | null;
    initialData?: AssignmentFormData;
    onSubmit: (formData: AssignmentFormData, readerId?: number | null) => Promise<number>;
    submitButtonText: string;
    loadingText: string;
    title: string;
    onSuccess?: (assignmentId: number, isDeleted?: boolean) => void;
    onDelete?: () => Promise<void>;
    showDelete?: boolean;
    assignmentId?: string;
    initialSelectedReader?: ReaderSummary | null;
    initialSelectedBook?: BookSummary | null;
    initialSelectedOrder?: OrderSummary | null;
    onReadersLoaded?: () => void;
    onOrdersLoaded?: () => void;
}

/**
 * Calendar-date helpers. These fields (reception / sent / returned) are dates,
 * not timestamps, so we keep them as "YYYY-MM-DD" and never round-trip through
 * toISOString() — which would convert local midnight to UTC and shift the day
 * (e.g. a date picked in Paris, UTC+2, lands on the previous day).
 */
function toDateOnly(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Parse a stored value (date-only, or a hydrated ISO datetime) into a LOCAL Date for display. */
function parseDateOnly(value: string | null): Date | undefined {
    if (!value) return undefined;
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d); // local midnight, no TZ shift
}

function DatePicker({
                        value,
                        onChange,
                        label,
                        placeholder,
                    }: {
    value: string | null;
    onChange: (date: string | null) => void;
    label: string;
    placeholder: string;
}) {
    const [open, setOpen] = useState(false);
    const date = parseDateOnly(value);

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium text-gray-200">{label}</label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                    >
                        <Calendar className="mr-2 h-4 w-4" />
                        {date ? format(date, 'PPP', { locale: fr }) : <span className="text-gray-400">{placeholder}</span>}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-gray-800 border-gray-700">
                    <CalendarComponent
                        mode="single"
                        selected={date}
                        onSelect={(newDate) => {
                            onChange(newDate ? toDateOnly(newDate) : null);
                            setOpen(false);
                        }}
                        initialFocus
                        locale={fr}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
}

export function AssignmentFormBackendBase({
                                              initialData,
                                              onSubmit,
                                              submitButtonText,
                                              loadingText,
                                              title,
                                              onSuccess,
                                              onDelete,
                                              showDelete,
                                              assignmentId,
                                              initialSelectedReader,
                                              initialSelectedBook,
                                              initialSelectedOrder,
                                              onReadersLoaded,
                                              onOrdersLoaded,
                                              presetClientId,
                                          }: AssignmentFormBackendBaseProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form data state (NO readerId here)
    const [formData, setFormData] = useState<AssignmentFormData>(initialData || {
        catalogueId: null,
        orderId: null,
        receptionDate: null,
        sentToReaderDate: null,
        returnedToECADate: null,
        statusId: null,
        notes: '',
    });

    // Reader state (separate from formData)
    const [selectedReaderId, setSelectedReaderId] = useState<number | null>(initialSelectedReader?.id ?? null);
    const [selectedReader, setSelectedReader] = useState<ReaderSummary | null>(initialSelectedReader || null);
    const [currentReader, setCurrentReader] = useState<ReaderSummary | null>(null);

    // Options data
    const [users, setUsers] = useState<ReaderSummary[]>([]);
    const [orders, setOrders] = useState<(OrderSummary & { _count?: { assignments: number }; isDuplication?: boolean })[]>([]);
    const [statuses, setStatuses] = useState<Status[]>([]);

    // Reader history
    const [readerHistory, setReaderHistory] = useState<AssignmentReaderHistory[]>([]);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    // Search states
    const [userSearch, setUserSearch] = useState('');
    const [orderSearch, setOrderSearch] = useState('');
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [isSearchingOrders, setIsSearchingOrders] = useState(false);

    // Popover open states
    const [userPopoverOpen, setUserPopoverOpen] = useState(false);
    const [orderPopoverOpen, setOrderPopoverOpen] = useState(false);

    // Selected display values
    const [selectedBook, setSelectedBook] = useState<BookSummary | null>(initialSelectedBook || null);
    const [selectedOrder, setSelectedOrder] = useState<OrderSummary | null>(initialSelectedOrder || null);

    // Reader reassignment
    const [isReassigningReader, setIsReassigningReader] = useState(false);
    const [reassignNotes, setReassignNotes] = useState('');
    const [showReassignSection, setShowReassignSection] = useState(false);

    const { toast } = useToast();
    const { toastError } = useFormToast();
    const { registerField, focusFirstInvalid } = useInvalidField();

    // Fetch initial data
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [statusesRes, ordersRes] = await Promise.all([
                    fetch('/api/statuses'),
                    // Recent list excludes duplications + already-attributed demandes
                    // server-side, so the slots backfill with older attributable demandes
                    // rather than going empty. All demandes still surface (greyed) on search.
                    fetch(`/api/orders?page=1&limit=100&isDuplication=false&unassigned=true${presetClientId ? `&aveugleId=${presetClientId}` : ''}`),
                ]);

                if (statusesRes.ok) {
                    const statusesData = await statusesRes.json();
                    setStatuses(statusesData);
                }

                if (ordersRes.ok) {
                    const ordersData = await ordersRes.json();
                    setOrders(ordersData.orders || []);
                }
            } catch (err) {
                console.error('Error fetching initial data:', err);
                setError('Échec du chargement des options du formulaire');
            } finally {
                onOrdersLoaded?.();
            }
        };

        fetchInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchReaderHistory = useCallback(async () => {
        if (!assignmentId) {
            onReadersLoaded?.();
            return;
        }

        try {
            const res = await fetch(`/api/assignments/${assignmentId}/readers`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    setReaderHistory(data);
                    const mostRecent = data[0];
                    if (mostRecent && mostRecent.reader) {
                        setCurrentReader(mostRecent.reader);
                        setSelectedReader(mostRecent.reader);
                        setSelectedReaderId(mostRecent.reader.id);
                    }
                }
            }
        } catch (err) {
            console.error('Error fetching reader history:', err);
        } finally {
            onReadersLoaded?.();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assignmentId]);

    useEffect(() => {
        const loadReaderHistory = async () => {
            await fetchReaderHistory();
        };
        loadReaderHistory();
    }, [fetchReaderHistory]);

    // Load initial selections if editing (only if not pre-fetched)
    useEffect(() => {
        if (initialData) {
            // Fetch selected book info only if not pre-fetched
            if (initialData.catalogueId && !initialSelectedBook) {
                fetch(`/api/books/${initialData.catalogueId}`)
                    .then(res => res.json())
                    .then(book => setSelectedBook(book))
                    .catch(err => console.error('Error fetching book:', err));
            }
            // Fetch selected order info only if not pre-fetched
            if (initialData.orderId && !initialSelectedOrder) {
                fetch(`/api/orders/${initialData.orderId}`)
                    .then(res => res.json())
                    .then(order => setSelectedOrder(order))
                    .catch(err => console.error('Error fetching order:', err));
            }
        }
    }, [initialData, initialSelectedBook, initialSelectedOrder]);

    // Search users (readers)
    useEffect(() => {
        const searchUsers = async () => {
            const q = userSearch.trim();
            if (q.length < 2) {
                setUsers([]);
                return;
            }

            setIsSearchingUsers(true);
            try {
                const response = await fetch(`/api/user/search?q=${encodeURIComponent(q)}&assignable=true`);
                if (response.ok) {
                    const data = await response.json();
                    setUsers(data);
                }
            } catch (err) {
                console.error('Error searching users:', err);
            } finally {
                setIsSearchingUsers(false);
            }
        };

        const debounce = setTimeout(searchUsers, 300);
        return () => clearTimeout(debounce);
    }, [userSearch]);

    // Skip the first run of the orders effect below — the mount effect already
    // loads the recent list (and fires onOrdersLoaded). After that, this effect
    // owns every change to `orders`.
    const ordersEffectMounted = useRef(false);

    // Orders: empty query → recent actionable list (duplications excluded
    // server-side); 2+ chars → full search including duplications, which the
    // render greys out instead of hiding. Clearing the box restores recent.
    useEffect(() => {
        if (!ordersEffectMounted.current) {
            ordersEffectMounted.current = true;
            return;
        }

        const q = orderSearch.trim();

        const run = async () => {
            setIsSearchingOrders(true);
            try {
                const params = new URLSearchParams({ page: '1', limit: '50' });
                if (q.length >= 2) {
                    params.set('search', q);
                } else {
                    params.set('isDuplication', 'false');
                    params.set('unassigned', 'true');
                }
                if (presetClientId) params.set('aveugleId', String(presetClientId));

                const response = await fetch(`/api/orders?${params.toString()}`);
                if (response.ok) {
                    const data = await response.json();
                    setOrders(data.orders || []);
                }
            } catch (err) {
                console.error('Error searching orders:', err);
            } finally {
                setIsSearchingOrders(false);
            }
        };

        const debounce = setTimeout(run, 300);
        return () => clearTimeout(debounce);
    }, [orderSearch, presetClientId]);

    const handleReaderSelect = (user: ReaderSummary) => {
        // #3 — warn when the reader has already reached their max concurrent
        // attributions. The count + max come from /api/user/search?assignable=true.
        const active = user.activeAssignmentCount ?? 0;
        const max = user.maxConcurrentAssignments ?? 3;
        if (active >= max) {
            const name = getReaderDisplayName(user) ?? 'Ce lecteur';
            const confirmed = window.confirm(
                `${name} a déjà atteint son nombre maximum d'attributions. ` +
                `Voulez-vous quand même lui en attribuer une autre ?`
            );
            if (!confirmed) {
                return;
            }
        }
        setSelectedReader(user);
        setSelectedReaderId(user.id);
        setUserPopoverOpen(false);
        setUserSearch('');
    };

    const handleOrderSelect = async (order: OrderSummary) => {
        setSelectedOrder(order);
        setFormData(prev => ({ ...prev, orderId: order.id }));
        setOrderPopoverOpen(false);
        setOrderSearch('');

        // Auto-populate book from order - catalogueId is now always present
        if (order.catalogue) {
            const catalogueId = (order as OrderSummary).catalogueId;

            if (catalogueId) {
                const bookData: BookSummary = {
                    id: catalogueId,
                    title: order.catalogue.title,
                    author: order.catalogue.author,
                };

                console.log('Setting book from order:', bookData);
                setSelectedBook(bookData);
                setFormData(prev => ({ ...prev, catalogueId: catalogueId }));
            } else {
                console.error('Order missing catalogueId - this should not happen with updated API');
            }
        }

        // Mirror the order's request-received date onto the assignment as a date-only
        // value. Slice the ISO string directly so no timezone conversion can shift the day.
        if (order.requestReceivedDate) {
            const dateString = String(order.requestReceivedDate).slice(0, 10);
            setFormData(prev => ({ ...prev, receptionDate: dateString }));
        }
    };

    // Recent list (empty search) shows only actionable demandes; search shows
    // everything with non-actionable rows greyed. Mirrors the per-row blockReason.
    const isOrderSearchMode = orderSearch.trim().length >= 2;
    const visibleOrders = isOrderSearchMode
        ? orders
        : orders.filter((order) => {
            if (order.id === selectedOrder?.id) return true;
            if (order.isDuplication) return false;
            if ((order._count?.assignments ?? 0) >= 1) return false;
            return true;
        });

    const handleReassignReader = async () => {
        if (!assignmentId || !selectedReaderId) {
            toast({
                variant: "destructive",
                title: "Erreur",
                description: "Veuillez sélectionner un lecteur",
            });
            return;
        }

        // Don't reassign if it's the same reader as current
        if (currentReader && selectedReaderId === currentReader.id) {
            toast({
                variant: "destructive",
                title: "Information",
                description: "Ce lecteur est déjà assigné à cette attribution",
            });
            return;
        }

        setIsReassigningReader(true);
        try {
            const response = await fetch(`/api/assignments/${assignmentId}/readers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    readerId: selectedReaderId,
                    notes: reassignNotes || 'Réattribution',
                }),
            });

            if (!response.ok) {
                // Surface the server's explanation (e.g. "attribution terminée") instead
                // of a generic message, so the toast is actually actionable.
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.message || 'Échec de la réattribution');
            }

            toast({
                title: "Succès",
                description: "Le lecteur a été réaffecté avec succès",
                className: "bg-green-100 border-2 border-green-500 text-green-900",
            });

            // Refresh reader history
            await fetchReaderHistory();
            setReassignNotes('');
            setShowReassignSection(false);
        } catch (error) {
            console.error('Error reassigning reader:', error);
            toast({
                variant: "destructive",
                title: "Erreur",
                description: error instanceof Error ? error.message : "Échec de la réattribution du lecteur",
            });
        } finally {
            setIsReassigningReader(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // N3 — collect failing required fields in visual order.
        const invalid: string[] = [];
        if (!formData.catalogueId) invalid.push('catalogueId');
        if (!formData.statusId) invalid.push('statusId');

        if (invalid.length) {
            const messages: Record<string, string> = {
                catalogueId: 'Veuillez sélectionner un livre du catalogue',
                statusId: 'Veuillez sélectionner un statut',
            };
            const firstName = ASSIGN_FIELD_ORDER.find((n) => invalid.includes(n)) ?? invalid[0];
            const msg = messages[firstName];
            setError(msg);
            toastError(msg);
            focusFirstInvalid(ASSIGN_FIELD_ORDER, new Set(invalid));
            return;
        }

        setIsLoading(true);

        try {
            // Safety net: force every date field to "YYYY-MM-DD" before it leaves the
            // form, regardless of how it was hydrated. Keeps the wire format consistent
            // with the strict z.string().date() validators on the server.
            const normalizedFormData: AssignmentFormData = {
                ...formData,
                receptionDate: formData.receptionDate ? formData.receptionDate.slice(0, 10) : null,
                sentToReaderDate: formData.sentToReaderDate ? formData.sentToReaderDate.slice(0, 10) : null,
                returnedToECADate: formData.returnedToECADate ? formData.returnedToECADate.slice(0, 10) : null,
            };

            // Pass readerId separately for create, not in formData
            const assignmentId = await onSubmit(normalizedFormData, selectedReaderId);
            if (onSuccess) {
                onSuccess(assignmentId);
            }
        } catch (err) {
            console.error('Submit error:', err);
            // The onSubmit wrapper already shows a detailed error toast (server
            // message + per-field lines). Keep only a quiet inline fallback here so
            // we never mask that toast (the toaster shows one at a time).
            setError(
                err instanceof Error && err.message
                    ? err.message
                    : 'Une erreur est survenue lors de la soumission du formulaire'
            );
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteClick = async () => {
        if (!onDelete) return;

        const confirmed = window.confirm(
            'Êtes-vous sûr de vouloir supprimer cette attribution ? Cette action est irréversible.'
        );

        if (!confirmed) return;

        setIsLoading(true);
        setError(null);

        try {
            await onDelete();
        } catch (err) {
            console.error('Delete error:', err);
            const msg = 'Échec de la suppression de l\'attribution';
            setError(msg);
            toastError(msg);
            setIsLoading(false);
        }
    };

    const getReaderDisplayName = (
        reader: ReaderSummary | null
    ) => {
        if (!reader) return null;

        // civility may come back as { name: "Monsieur" }, a plain string, or null
        const civilityRaw = (reader as { civility?: { name?: string } | string | null }).civility;
        const civility =
            typeof civilityRaw === 'string'
                ? civilityRaw
                : civilityRaw?.name ?? '';

        const fullName = [reader.firstName, reader.lastName]
            .filter(Boolean)
            .join(' ')
            .trim();

        const composed = [civility, fullName].filter(Boolean).join(' ').trim();

        return composed || reader.name || reader.email || 'Sans nom';
    };

    return (
        <Card className="w-full max-w-4xl mx-auto bg-gray-900 border-gray-800">
            <CardHeader className="border-b border-gray-800">
                <CardTitle className="text-2xl font-bold text-gray-100">{title}</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
                {error && (
                    <Alert variant="destructive" className="mb-6 bg-red-900/20 border-red-900 text-red-400">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Reader Selection/Display */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Lecteur {!assignmentId && <span className="text-red-400">*</span>}
                        </label>

                        {/* Edit mode: Compact reader display */}
                        {assignmentId ? (
                            <div className="space-y-2">
                                {/* Current reader compact bar */}
                                {currentReader ? (
                                    <div
                                        className="flex items-center justify-between p-3 bg-gray-800 border border-gray-700 rounded-md hover:bg-gray-750 cursor-pointer transition-colors"
                                        onClick={() => setShowReassignSection(!showReassignSection)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <UserIcon className="h-5 w-5 text-blue-400" />
                                            <div>
                                                <div className="font-medium text-gray-200">
                                                    {getReaderDisplayName(currentReader)}
                                                </div>
                                                {currentReader.email && (
                                                    <div className="text-sm text-gray-400">{currentReader.email}</div>
                                                )}
                                                <div className="text-xs text-gray-500 italic mt-0.5">
                                                    Cliquez pour réattribuer cette attribution.
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {readerHistory.length > 1 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowHistoryModal(true);
                                                    }}
                                                    className="text-gray-400 hover:text-gray-200"
                                                >
                                                    <History className="h-4 w-4 mr-1" />
                                                    <span className="text-xs">Historique</span>
                                                </Button>
                                            )}
                                            <ChevronRight className={`h-5 w-5 text-gray-400 transition-transform ${showReassignSection ? 'rotate-90' : ''}`} />
                                        </div>
                                    </div>
                                ) : (
                                    /* No reader assigned yet in edit mode - show simple selection like create mode */
                                    <div className="space-y-2">
                                        <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="w-full justify-between bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                                                >
                                                    {selectedReader ? (
                                                        <span>{getReaderDisplayName(selectedReader)}</span>
                                                    ) : (
                                                        <span className="text-gray-400">Sélectionner un lecteur...</span>
                                                    )}
                                                    <Search className="ml-2 h-4 w-4 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-[400px] p-0 bg-gray-800 border-gray-700">
                                                <div className="p-2">
                                                    <Input
                                                        placeholder="Rechercher un lecteur..."
                                                        value={userSearch}
                                                        onChange={(e) => setUserSearch(e.target.value)}
                                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                                    />
                                                </div>
                                                <div
                                                    className="max-h-[300px] overflow-y-auto"
                                                    onWheel={(e) => e.stopPropagation()}
                                                >
                                                    {isSearchingUsers ? (
                                                        <div className="p-4 text-center text-gray-400">Recherche...</div>
                                                    ) : users.length > 0 ? (
                                                        users.map((user) => (
                                                            <div
                                                                key={user.id}
                                                                className="px-4 py-2 hover:bg-gray-700 cursor-pointer text-gray-200"
                                                                onClick={() => handleReaderSelect(user)}
                                                            >
                                                                <div className="font-medium">
                                                                    {getReaderDisplayName(user)}
                                                                </div>
                                                                {user.email && (
                                                                    <div className="text-sm text-gray-400">{user.email}</div>
                                                                )}
                                                            </div>
                                                        ))
                                                    ) : userSearch.length >= 2 ? (
                                                        <div className="p-4 text-center text-gray-400">
                                                            Aucun lecteur trouvé
                                                        </div>
                                                    ) : (
                                                        <div className="p-4 text-center text-gray-400">
                                                            Tapez au moins 2 caractères pour rechercher
                                                        </div>
                                                    )}
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                        {selectedReader && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={handleReassignReader}
                                                disabled={isReassigningReader}
                                                className="w-full bg-blue-700 hover:bg-blue-600 text-gray-100 border-blue-500 disabled:opacity-50"
                                            >
                                                <UserIcon className="mr-2 h-4 w-4" />
                                                {isReassigningReader ? 'Attribution...' : 'Attribuer ce lecteur'}
                                            </Button>
                                        )}
                                    </div>
                                )}

                                {/* Reassignment section - collapsible (only when currentReader exists) */}
                                {showReassignSection && currentReader && (
                                    <div className="p-4 bg-gray-800 border border-gray-700 rounded-md space-y-3">
                                        <h4 className="font-medium text-gray-200">Réaffecter à un autre lecteur</h4>

                                        <div className="flex gap-2">
                                            <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="flex-1 justify-between bg-gray-900 border-gray-700 text-gray-200 hover:bg-gray-800"
                                                    >
                                                        {selectedReader && selectedReader.id !== currentReader?.id ? (
                                                            <span>{getReaderDisplayName(selectedReader)}</span>
                                                        ) : (
                                                            <span className="text-gray-400">Sélectionner un nouveau lecteur...</span>
                                                        )}
                                                        <Search className="ml-2 h-4 w-4 opacity-50" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[400px] p-0 bg-gray-800 border-gray-700">
                                                    <div className="p-2">
                                                        <Input
                                                            placeholder="Rechercher un lecteur..."
                                                            value={userSearch}
                                                            onChange={(e) => setUserSearch(e.target.value)}
                                                            className="bg-gray-900 border-gray-700 text-gray-200"
                                                        />
                                                    </div>
                                                    <div
                                                        className="max-h-[300px] overflow-y-auto"
                                                        onWheel={(e) => e.stopPropagation()}
                                                    >
                                                        {isSearchingUsers ? (
                                                            <div className="p-4 text-center text-gray-400">Recherche...</div>
                                                        ) : users.length > 0 ? (
                                                            users.map((user) => (
                                                                <div
                                                                    key={user.id}
                                                                    className="px-4 py-2 hover:bg-gray-700 cursor-pointer text-gray-200"
                                                                    onClick={() => handleReaderSelect(user)}
                                                                >
                                                                    <div className="font-medium">
                                                                        {getReaderDisplayName(user)}
                                                                    </div>
                                                                    {user.email && (
                                                                        <div className="text-sm text-gray-400">{user.email}</div>
                                                                    )}
                                                                </div>
                                                            ))
                                                        ) : userSearch.length >= 2 ? (
                                                            <div className="p-4 text-center text-gray-400">
                                                                Aucun lecteur trouvé
                                                            </div>
                                                        ) : (
                                                            <div className="p-4 text-center text-gray-400">
                                                                Tapez au moins 2 caractères pour rechercher
                                                            </div>
                                                        )}
                                                    </div>
                                                </PopoverContent>
                                            </Popover>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={handleReassignReader}
                                                disabled={isReassigningReader || !selectedReaderId || selectedReaderId === currentReader?.id}
                                                className="bg-blue-700 hover:bg-blue-600 text-gray-100 border-blue-500 disabled:opacity-50"
                                            >
                                                <UserIcon className="mr-2 h-4 w-4" />
                                                {isReassigningReader ? 'Réattribution...' : 'Réattribuer'}
                                            </Button>
                                        </div>

                                        <Input
                                            placeholder="Raison de la réattribution (optionnel)"
                                            value={reassignNotes}
                                            onChange={(e) => setReassignNotes(e.target.value)}
                                            className="bg-gray-900 border-gray-700 text-gray-200"
                                        />
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Create mode: Simple reader selection */
                            <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-between bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                                    >
                                        {selectedReader ? (
                                            <span>{getReaderDisplayName(selectedReader)}</span>
                                        ) : (
                                            <span className="text-gray-400">Sélectionner un lecteur...</span>
                                        )}
                                        <Search className="ml-2 h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[400px] p-0 bg-gray-800 border-gray-700">
                                    <div className="p-2">
                                        <Input
                                            placeholder="Rechercher un lecteur..."
                                            value={userSearch}
                                            onChange={(e) => setUserSearch(e.target.value)}
                                            className="bg-gray-900 border-gray-700 text-gray-200"
                                        />
                                    </div>
                                    <div
                                        className="max-h-[300px] overflow-y-auto"
                                        onWheel={(e) => e.stopPropagation()}
                                    >
                                        {isSearchingUsers ? (
                                            <div className="p-4 text-center text-gray-400">Recherche...</div>
                                        ) : users.length > 0 ? (
                                            users.map((user) => (
                                                <div
                                                    key={user.id}
                                                    className="px-4 py-2 hover:bg-gray-700 cursor-pointer text-gray-200"
                                                    onClick={() => handleReaderSelect(user)}
                                                >
                                                    <div className="font-medium">
                                                        {getReaderDisplayName(user)}
                                                    </div>
                                                    {user.email && (
                                                        <div className="text-sm text-gray-400">{user.email}</div>
                                                    )}
                                                </div>
                                            ))
                                        ) : userSearch.length >= 2 ? (
                                            <div className="p-4 text-center text-gray-400">
                                                Aucun lecteur trouvé
                                            </div>
                                        ) : (
                                            <div className="p-4 text-center text-gray-400">
                                                Tapez au moins 2 caractères pour rechercher
                                            </div>
                                        )}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>

                    {/* Order Selection - NOW SECOND */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">Commande</label>
                        <Popover open={orderPopoverOpen} onOpenChange={setOrderPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-between bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                                >
                                    {selectedOrder ? (
                                        <div className="flex items-center gap-2">
                                            <Package className="h-4 w-4 shrink-0" />
                                            <span className="text-base">
                                                {selectedOrder.aveugle?.name || 'Auditeur inconnu'}
                                                {(selectedOrder.requestReceivedDate || selectedOrder.createdDate) && (
                                                    <> · {format(new Date(selectedOrder.requestReceivedDate || selectedOrder.createdDate!), 'dd/MM/yyyy', { locale: fr })}</>
                                                )}
                                                <span className="text-gray-400"> (Cmd&nbsp;#{selectedOrder.id})</span>
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-gray-400">Sélectionner une demande...</span>
                                    )}
                                    <Search className="ml-2 h-4 w-4 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[600px] p-0 bg-gray-800 border-gray-700">
                                <div className="p-2">
                                    <Input
                                        placeholder="Rechercher une demande..."
                                        value={orderSearch}
                                        onChange={(e) => setOrderSearch(e.target.value)}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                                <div
                                    className="max-h-[400px] overflow-y-auto"
                                    onWheel={(e) => e.stopPropagation()}
                                >
                                    {isSearchingOrders ? (
                                        <div className="p-4 text-center text-gray-400">Recherche...</div>
                                    ) : visibleOrders.length > 0 ? (
                                        visibleOrders.map((order) => {
                                            // A demande is non-actionable for a new attribution when it's a
                                            // duplication (no reader needed) or already has an attribution
                                            // (one-per-demande, server-enforced). The currently-selected
                                            // demande is exempt so it stays visible/selectable in edit mode.
                                            const blockReason: 'duplication' | 'attributed' | null =
                                                order.id === selectedOrder?.id
                                                    ? null
                                                    : order.isDuplication
                                                        ? 'duplication'
                                                        : (order._count?.assignments ?? 0) >= 1
                                                            ? 'attributed'
                                                            : null;
                                            const blocked = blockReason !== null;
                                            return (
                                                <div
                                                    key={order.id}
                                                    aria-disabled={blocked}
                                                    className={
                                                        blocked
                                                            ? "px-4 py-3 border-b border-gray-700 last:border-b-0 opacity-50 cursor-not-allowed"
                                                            : "px-4 py-3 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-b-0"
                                                    }
                                                    onClick={blocked ? undefined : () => handleOrderSelect(order)}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1">
                                                            {/* Primary: who + when — same hierarchy as the trigger */}
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <Package className="h-4 w-4 text-blue-400 shrink-0" />
                                                                <span className="font-semibold text-gray-200 text-base">
                                                                {order.aveugle?.name || 'Auditeur inconnu'}
                                                            </span>
                                                                {(order.requestReceivedDate || order.createdDate) && (
                                                                    <span className="text-sm text-gray-400">
                                                                    · {format(new Date(order.requestReceivedDate || order.createdDate!), 'dd/MM/yyyy', { locale: fr })}
                                                                </span>
                                                                )}
                                                            </div>
                                                            {order.catalogue && (
                                                                <div className="text-sm text-gray-300">
                                                                    {order.catalogue.title}
                                                                    {order.catalogue.author && <span className="text-gray-500"> — {order.catalogue.author}</span>}
                                                                </div>
                                                            )}
                                                            {blockReason === 'attributed' && (
                                                                <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-400">
                                                                    Une attribution existe déjà
                                                                </div>
                                                            )}
                                                            {blockReason === 'duplication' && (
                                                                <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-400">
                                                                    Duplication — aucune attribution nécessaire
                                                                </div>
                                                            )}
                                                        </div>
                                                        <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">Cmd&nbsp;#{order.id}</span>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="p-4 text-center text-gray-400">
                                            {isOrderSearchMode
                                                ? "Aucune commande trouvée"
                                                : "Aucune demande récente attribuable — utilisez la recherche pour voir toutes les demandes."}
                                        </div>
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                        {selectedOrder && (
                            <Link
                                href={`/admin/orders?order=${selectedOrder.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm font-medium text-blue-400 hover:text-blue-300 underline underline-offset-2"
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Voir la demande
                            </Link>
                        )}
                    </div>

                    {/* Book — read-only: derived from the selected order (one book per order) */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Livre <span className="text-red-400">*</span>
                        </label>
                        <div
                            ref={registerField('catalogueId')}
                            tabIndex={-1}
                            className="flex items-center w-full rounded-md bg-gray-800/60 border border-gray-700 px-3 py-2 text-gray-200 cursor-not-allowed outline-none"
                            aria-readonly="true"
                            title="Le livre provient de la demande sélectionnée. Pour le changer, sélectionnez une autre demande ci-dessus."
                        >
                            {selectedBook ? (
                                <span>{selectedBook.title} - {selectedBook.author}</span>
                            ) : (
                                <span className="text-gray-400">Sélectionnez une demande pour définir le livre</span>
                            )}
                        </div>
                        <p className="text-xs text-gray-400">
                            Le livre est repris de la commande. Pour le modifier, changez la commande ci-dessus.
                        </p>
                    </div>

                    {/* Date Fields */}
                    <DatePicker
                        label="Date de réception"
                        placeholder="Sélectionner une date..."
                        value={formData.receptionDate}
                        onChange={(date) => setFormData({ ...formData, receptionDate: date })}
                    />

                    <DatePicker
                        label="Date d'envoi au lecteur"
                        placeholder="Sélectionner une date..."
                        value={formData.sentToReaderDate}
                        onChange={(date) => setFormData({ ...formData, sentToReaderDate: date })}
                    />

                    <DatePicker
                        label="Date de retour à l'ECA"
                        placeholder="Sélectionner une date..."
                        value={formData.returnedToECADate}
                        onChange={(date) => setFormData({ ...formData, returnedToECADate: date })}
                    />

                    {/* Status */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Statut <span className="text-red-400">*</span>
                        </label>
                        <Select
                            value={formData.statusId?.toString() || ''}
                            onValueChange={(value) =>
                                setFormData({ ...formData, statusId: parseInt(value) })
                            }
                        >
                            <SelectTrigger ref={registerField('statusId')} className="bg-gray-800 border-gray-700 text-gray-200">
                                <SelectValue placeholder="Sélectionner un statut" />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-700">
                                {/* #7a — an assignment can never hold "Soldé" (order-only status);
                                    filter it out so it isn't offered. Uses STATUS.SOLDE, not a literal. */}
                                {statuses
                                    .filter((status) => status.id !== STATUS.SOLDE)
                                    .map((status) => (
                                        <SelectItem key={status.id} value={status.id.toString()} className="text-gray-200">
                                            {status.name}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">Notes</label>
                        <Textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            className="bg-gray-800 border-gray-700 text-gray-200 min-h-[100px]"
                            placeholder="Ajouter des notes supplémentaires..."
                        />
                    </div>

                    {/* Submit Button */}
                    <div className="space-y-4">
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-gray-700 hover:bg-gray-600 text-gray-100 border-gray-100"
                        >
                            {isLoading ? loadingText : submitButtonText}
                        </Button>

                        {showDelete && onDelete && (
                            <Button
                                type="button"
                                variant="destructive"
                                disabled={isLoading}
                                onClick={handleDeleteClick}
                                className="w-full bg-red-700 hover:bg-red-600 text-gray-100 border-red-500"
                            >
                                Supprimer l&apos;attribution
                            </Button>
                        )}
                    </div>
                </form>
            </CardContent>

            {/* Reader History Modal */}
            <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
                <DialogContent className="max-w-2xl bg-gray-900 border-gray-700 [&>button>svg]:text-white">
                    <DialogHeader>
                        <DialogTitle className="text-gray-100">Historique des lecteurs</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                        {readerHistory.map((history, index) => (
                            <div
                                key={history.id}
                                className={`p-4 rounded ${
                                    index === 0
                                        ? 'bg-blue-900/20 border border-blue-800'
                                        : 'bg-gray-800 border border-gray-700'
                                }`}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <UserIcon className="h-4 w-4 text-gray-400" />
                                            <span className="font-medium text-gray-200">
                                                {getReaderDisplayName(history.reader)}
                                            </span>
                                            {index === 0 && (
                                                <span className="text-xs bg-blue-700 text-blue-100 px-2 py-1 rounded">
                                                    Actuel
                                                </span>
                                            )}
                                        </div>
                                        {history.reader.email && (
                                            <div className="text-sm text-gray-400 mb-2">{history.reader.email}</div>
                                        )}
                                        {history.notes && (
                                            <div className="text-sm text-gray-300 mt-2 p-2 bg-gray-900 rounded italic border-l-2 border-blue-700">
                                                {history.notes}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-sm text-gray-400 ml-4">
                                        {format(new Date(history.assignedDate), 'PPP', { locale: fr })}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

// Add Assignment Form using the base
export function AddAssignmentFormBackend({
                                             onSuccess,
                                             onOrdersLoaded,
                                             presetClientId,
                                             initialReader,
                                         }: {
    onSuccess?: (assignmentId: number) => void;
    onOrdersLoaded?: () => void;
    presetClientId?: number | null;
    initialReader?: ReaderSummary | null;
}) {
    const { toast } = useToast();

    const handleSubmit = async (formData: AssignmentFormData, readerId?: number | null): Promise<number> => {
        try {
            const payload = {
                ...formData,
                readerId, // Include readerId for create
            };

            console.log('Submitting assignment with data:', payload);

            const response = await fetch('/api/assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('Assignment creation failed:', data);
                const errorMessage = data?.message || data?.error || 'Échec de la création de l\'attribution';
                const fieldLines = getFieldErrorLines(data);

                toast({
                    variant: "destructive",
                    // @ts-expect-error jsx in toast
                    title: <span className="text-2xl font-bold">Erreur</span>,
                    description: <ErrorToastBody message={errorMessage} lines={fieldLines} />,
                    className: "bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6"
                });

                return Promise.reject();
            }

            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">L&apos;attribution a été créée avec succès</span>,
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
            });

            return data.assignment.id;
        } catch (error) {
            console.error('Submit error:', error);
            return Promise.reject();
        }
    };

    return (
        <AssignmentFormBackendBase
            onSubmit={handleSubmit}
            submitButtonText="Créer l'attribution"
            loadingText="Création en cours..."
            title="Créer une nouvelle attribution"
            onSuccess={onSuccess}
            onOrdersLoaded={onOrdersLoaded}
            presetClientId={presetClientId}
            initialSelectedReader={initialReader}
        />
    );
}

// Edit Assignment Form using the base
export function EditAssignmentFormBackend({
                                              assignmentId,
                                              initialData,
                                              onSuccess,
                                              initialSelectedReader,
                                              initialSelectedBook,
                                              initialSelectedOrder,
                                              onReadersLoaded,
                                              onOrdersLoaded,
                                          }: {
    assignmentId: string;
    initialData: AssignmentFormData;
    onSuccess?: (assignmentId: number, isDeleted?: boolean) => void;
    initialSelectedReader?: ReaderSummary | null;
    initialSelectedBook?: BookSummary | null;
    initialSelectedOrder?: OrderSummary | null;
    onReadersLoaded?: () => void;
    onOrdersLoaded?: () => void;
}) {
    const { toast } = useToast();

    const handleDelete = async (): Promise<void> => {
        try {
            const response = await fetch(`/api/assignments/${assignmentId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error('Échec de la suppression de l\'attribution');
            }

            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">L&apos;attribution a été supprimée avec succès</span>,
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
            });

            if (onSuccess) {
                onSuccess(parseInt(assignmentId), true);
            }
        } catch (error) {
            console.error('Delete error:', error);
            throw error;
        }
    };

    const handleSubmit = async (formData: AssignmentFormData): Promise<number> => {
        try {
            // For updates, we DON'T include readerId - it's handled via reassignment
            const response = await fetch(`/api/assignments/${assignmentId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData), // No readerId in update
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                const errorMessage = errorData?.message || 'Échec de la mise à jour de l\'attribution';
                const fieldLines = getFieldErrorLines(errorData);

                toast({
                    variant: "destructive",
                    // @ts-expect-error jsx in toast
                    title: <span className="text-2xl font-bold">Erreur</span>,
                    description: <ErrorToastBody message={errorMessage} lines={fieldLines} />,
                    className: "bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6"
                });

                return Promise.reject();
            }

            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">L&apos;attribution a été mise à jour avec succès</span>,
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
            });

            return parseInt(assignmentId);
        } catch (error) {
            console.error('Submit error:', error);
            return Promise.reject();
        }
    };

    return (
        <AssignmentFormBackendBase
            assignmentId={assignmentId}
            initialData={initialData}
            onSubmit={handleSubmit}
            onDelete={handleDelete}
            showDelete={true}
            submitButtonText="Mettre à jour l'attribution"
            loadingText="Mise à jour en cours..."
            title="Modifier l'attribution"
            onSuccess={onSuccess}
            initialSelectedReader={initialSelectedReader}
            initialSelectedBook={initialSelectedBook}
            initialSelectedOrder={initialSelectedOrder}
            onReadersLoaded={onReadersLoaded}
            onOrdersLoaded={onOrdersLoaded}
        />
    );
}