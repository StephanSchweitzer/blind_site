import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Calendar, Search, Plus, Trash2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import Link from 'next/link';
import { getBillingStatusLabel } from '@/lib/billing-enums';
import type { BillingStatus } from '@prisma/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AddBookFormBackend } from '@/admin/BookFormBackendBase';
import { useFormToast } from '@/hooks/useFormToast';
import { useInvalidField } from '@/hooks/useInvalidField';
import { useRecordingCheck } from '@/hooks/useRecordingCheck';

// N3 — required fields, visual top→bottom.
const EDIT_FIELD_ORDER = ['aveugleId', 'catalogueId', 'statusId', 'mediaFormatId', 'deliveryMethod'];
const CREATE_FIELD_ORDER = ['aveugleId', 'deliveryMethod', 'mediaFormatId', 'lines'];

interface User {
    id: number;
    name: string | null;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    civility?: { name: string } | string | null;
}

interface Book {
    id: number;
    title: string;
    author: string;
    audio_filepath?: string | null;
}

interface Status {
    id: number;
    name: string;
}

interface MediaFormat {
    id: number;
    name: string;
}

export interface OrderFormData {
    aveugleId: number | null;
    catalogueId: number | null;
    requestReceivedDate: Date;
    statusId: number | null;
    isDuplication: boolean;
    mediaFormatId: number | null;
    deliveryMethod: 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE' | null;
    processedByStaffId: number | null;
    // createdDate: Date | null;
    closureDate: Date | null;
    cost: string;
    billingStatus: 'UNBILLED' | 'BILLED' | 'UNBILLABLE';
    lentPhysicalBook: boolean;
    notes: string;
}

// Read-only context for the affectation linked to this order (if any).
// statusName comes straight from the Status table; reader is the current
// reader (most recent entry in the assignment's reader history).
export interface OrderAssignment {
    id: number;
    statusId: number;
    statusName: string;
    reader?: { id: number; name: string | null } | null;
    sentToReaderDate?: string | null;
    returnedToECADate?: string | null;
}

interface OrderFormBackendBaseProps {
    initialData?: OrderFormData;
    /** Order id when editing — lets the recording-duplicate check ignore self. */
    currentOrderId?: number;
    onSubmit: (formData: OrderFormData) => Promise<number>;
    submitButtonText: string;
    loadingText: string;
    title: string;
    onSuccess?: (orderId: number, isDeleted?: boolean) => void;
    onDelete?: () => Promise<void>;
    showDelete?: boolean;
    // Pre-fetched selections to avoid additional API calls
    initialSelectedUser?: User | null;
    initialSelectedBook?: Book | null;
    initialSelectedStaff?: User | null;
    // Linked bill (read-only context)
    initialBill?: { id: number; state: string } | null;
    // Linked affectation (read-only context)
    initialAssignment?: OrderAssignment | null;
}

// Euro display helpers: keep only digits + one decimal separator while typing,
// then pad to 2 decimals on blur. The € sign is a visual adornment, never stored.
const sanitizeDecimal = (v: string): string => {
    const raw = (v ?? '').replace(/[^0-9.,]/g, '').replace(',', '.');
    const parts = raw.split('.');
    return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : raw;
};
const formatEuro2 = (v: string | null | undefined): string => {
    if (v == null || String(v).trim() === '') return '';
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isNaN(n) ? '' : n.toFixed(2);
};

// Compose a user's display name as "Civilité Prénom Nom".
// /api/user/search returns firstName/lastName/civility but no `name`,
// so build it here and fall back to name/email when parts are missing.
const getUserDisplayName = (
    user: Pick<User, 'name' | 'email' | 'firstName' | 'lastName' | 'civility'> | null
): string => {
    if (!user) return '';
    const civRaw = user.civility;
    const civ = typeof civRaw === 'string' ? civRaw : civRaw?.name ?? '';
    const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    const composed = [civ, full].filter(Boolean).join(' ').trim();
    return composed || user.name || user.email || 'Sans nom';
};

export function OrderFormBackendBase({
                                         initialData,
                                         currentOrderId,
                                         onSubmit,
                                         submitButtonText,
                                         loadingText,
                                         title,
                                         onSuccess,
                                         onDelete,
                                         showDelete,
                                         initialSelectedUser,
                                         initialSelectedBook,
                                         initialSelectedStaff,
                                         initialBill,
                                         initialAssignment,
                                     }: OrderFormBackendBaseProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toastError } = useFormToast();
    const { registerField, focusFirstInvalid } = useInvalidField();
    const { check: checkRecording, getFor: getRecordingFor } = useRecordingCheck();

    // Cost is locked while the linked bill is finalized (payée/soldée); reopen to edit.
    const costLocked = initialBill?.state === 'PAID' || initialBill?.state === 'SOLDE';

    // Form data state
    const [formData, setFormData] = useState<OrderFormData>(() =>
        initialData
            ? { ...initialData, cost: formatEuro2(initialData.cost) }
            : {
                aveugleId: initialSelectedUser?.id ?? null,
                catalogueId: null,
                requestReceivedDate: new Date(),
                statusId: null,
                isDuplication: false,
                mediaFormatId: null,
                deliveryMethod: null,
                processedByStaffId: null,
                //createdDate: new Date(),
                closureDate: null,
                cost: '3.00',
                billingStatus: 'UNBILLED',
                lentPhysicalBook: false,
                notes: '',
            }
    );

    // Options data
    const [users, setUsers] = useState<User[]>([]);
    const [books, setBooks] = useState<Book[]>([]);
    const [statuses, setStatuses] = useState<Status[]>([]);
    const [mediaFormats, setMediaFormats] = useState<MediaFormat[]>([]);

    // Search states
    const [userSearch, setUserSearch] = useState('');
    const [bookSearch, setBookSearch] = useState('');
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [isSearchingBooks, setIsSearchingBooks] = useState(false);

    // Popover open states
    const [userPopoverOpen, setUserPopoverOpen] = useState(false);
    const [bookPopoverOpen, setBookPopoverOpen] = useState(false);
    // Selected display values
    const [selectedUser, setSelectedUser] = useState<User | null>(initialSelectedUser || null);
    const [selectedBook, setSelectedBook] = useState<Book | null>(initialSelectedBook || null);
    const [selectedStaff, setSelectedStaff] = useState<User | null>(initialSelectedStaff || null);

    // Fetch initial data
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [statusesRes, formatsRes] = await Promise.all([
                    fetch('/api/statuses'),
                    fetch('/api/media-formats'),
                ]);

                if (statusesRes.ok) {
                    const statusesData = await statusesRes.json();
                    setStatuses(statusesData);
                }

                if (formatsRes.ok) {
                    const formatsData = await formatsRes.json();
                    setMediaFormats(formatsData);
                }
            } catch (err) {
                console.error('Error fetching initial data:', err);
                setError('Échec du chargement des options du formulaire');
            }
        };

        fetchInitialData();
    }, []);

    // Load initial selections if editing (only if not pre-fetched)
    useEffect(() => {
        if (initialData) {
            // Fetch selected user info only if not pre-fetched
            if (initialData.aveugleId && !initialSelectedUser) {
                fetch(`/api/user/${initialData.aveugleId}`)
                    .then(res => res.json())
                    .then(user => setSelectedUser(user))
                    .catch(err => console.error('Error fetching user:', err));
            }
            // Fetch selected book info only if not pre-fetched
            if (initialData.catalogueId && !initialSelectedBook) {
                fetch(`/api/books/${initialData.catalogueId}`)
                    .then(res => res.json())
                    .then(book => setSelectedBook(book))
                    .catch(err => console.error('Error fetching book:', err));
            }
            // Fetch selected staff info only if not pre-fetched
            if (initialData.processedByStaffId && !initialSelectedStaff) {
                fetch(`/api/user/${initialData.processedByStaffId}`)
                    .then(res => res.json())
                    .then(user => setSelectedStaff(user))
                    .catch(err => console.error('Error fetching staff:', err));
            }
        }
    }, [initialData, initialSelectedUser, initialSelectedBook, initialSelectedStaff]);

    // Search users (aveugles)
    useEffect(() => {
        const searchUsers = async () => {
            if (userSearch.length < 2) {
                setUsers([]);
                return;
            }

            setIsSearchingUsers(true);
            try {
                const response = await fetch(`/api/user/search?q=${encodeURIComponent(userSearch)}`);
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

    // Search books
    useEffect(() => {
        const searchBooks = async () => {
            if (bookSearch.length < 2) {
                setBooks([]);
                return;
            }

            setIsSearchingBooks(true);
            try {
                const response = await fetch(`/api/books?search=${encodeURIComponent(bookSearch)}&limit=10`);
                if (response.ok) {
                    const { books } = await response.json();
                    setBooks(books);
                }
            } catch (err) {
                console.error('Error searching books:', err);
            } finally {
                setIsSearchingBooks(false);
            }
        };

        const debounce = setTimeout(searchBooks, 300);
        return () => clearTimeout(debounce);
    }, [bookSearch]);


    const handleUserSelect = (user: User) => {
        setSelectedUser(user);
        setFormData({ ...formData, aveugleId: user.id });
        setUserPopoverOpen(false);
        setUserSearch('');
    };

    const handleBookSelect = async (book: Book) => {
        setBookPopoverOpen(false);
        setBookSearch('');

        // The search results are lightweight; fetch the full book so we know
        // whether it already has an audio file.
        let full: Book = book;
        try {
            const res = await fetch(`/api/books/${book.id}`);
            if (res.ok) full = await res.json();
        } catch (err) {
            console.error('Error fetching book details:', err);
        }

        setSelectedBook(full);

        const hasAudio = Boolean(full.audio_filepath);
        setFormData(prev => ({
            ...prev,
            catalogueId: full.id,
            // Audio already exists -> default this to a duplication (not forced;
            // the admin can uncheck it, e.g. for a re-recording / re-read).
            ...(hasAudio ? { isDuplication: true, lentPhysicalBook: false } : {}),
        }));
    };


    const handleDuplicationChange = (checked: boolean) => {
        setFormData(prev => {
            // Check if current status is "Terminé"
            const currentStatus = statuses.find(s => s.id === prev.statusId);
            const isTerminated = currentStatus?.name.toLowerCase().includes('terminé');

            return {
                ...prev,
                isDuplication: checked,
                lentPhysicalBook: checked ? false : prev.lentPhysicalBook,
                // Set status to "en cours" when duplication is selected, but only if not already "Terminé"
                statusId: (checked && !isTerminated)
                    ? statuses.find(s => s.name.toLowerCase().includes('en cours'))?.id || prev.statusId
                    : prev.statusId
            };
        });
    };

    const handleRecordingChange = (checked: boolean) => {
        setFormData(prev => {
            // Check if current status is "Terminé"
            const currentStatus = statuses.find(s => s.id === prev.statusId);
            const isTerminated = currentStatus?.name.toLowerCase().includes('terminé');

            return {
                ...prev,
                lentPhysicalBook: checked,
                isDuplication: checked ? false : prev.isDuplication,
                // Set status to "attente d'envoie vers lecteur" when recording is selected, but only if not already "Terminé"
                statusId: (checked && !isTerminated)
                    ? statuses.find(s => s.name.toLowerCase().includes('attente') && s.name.toLowerCase().includes('lecteur'))?.id || prev.statusId
                    : prev.statusId
            };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        // N3 — collect failing required fields in visual order.
        const invalid: string[] = [];
        if (!formData.aveugleId) invalid.push('aveugleId');
        if (!formData.catalogueId) invalid.push('catalogueId');
        if (!formData.statusId) invalid.push('statusId');
        if (!formData.mediaFormatId) invalid.push('mediaFormatId');
        if (!formData.deliveryMethod) invalid.push('deliveryMethod');

        if (invalid.length) {
            const messages: Record<string, string> = {
                aveugleId: 'Veuillez sélectionner un auditeur',
                catalogueId: 'Veuillez sélectionner un livre',
                statusId: 'Veuillez sélectionner un statut',
                mediaFormatId: 'Veuillez sélectionner un format média',
                deliveryMethod: 'Veuillez sélectionner une méthode de livraison',
            };
            const firstName = EDIT_FIELD_ORDER.find((n) => invalid.includes(n)) ?? invalid[0];
            const msg = messages[firstName];
            setError(msg);
            toastError(msg);
            focusFirstInvalid(EDIT_FIELD_ORDER, new Set(invalid));
            setIsLoading(false);
            return;
        }

        // Guard: warn before creating a SECOND active recording demande for this book.
        if (formData.lentPhysicalBook && formData.catalogueId) {
            const res = await checkRecording(formData.catalogueId, currentOrderId);
            if (res && res.activeRecordingCount > 0) {
                const who = res.orders[0]?.aveugle?.name;
                const confirmed = window.confirm(
                    `Il existe déjà ${res.activeRecordingCount === 1
                        ? 'une demande d\u2019enregistrement active'
                        : `${res.activeRecordingCount} demandes d\u2019enregistrement actives`} pour cet ouvrage${who ? ` (ex. ${who})` : ''}.\n\n` +
                    `Voulez-vous vraiment créer une nouvelle demande d\u2019enregistrement pour ce livre ?`
                );
                if (!confirmed) {
                    setIsLoading(false);
                    return;
                }
            }
        }

        try {
            const newOrderId = await onSubmit(formData);
            if (onSuccess) {
                onSuccess(newOrderId);
            }
        } catch (err) {
            // The onSubmit wrapper already shows a detailed error toast; keep only a
            // quiet inline fallback here so we never mask it (one toast at a time).
            const msg = err instanceof Error && err.message ? err.message : 'Échec du traitement de la demande';
            setError(msg);
            return;
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteClick = async () => {
        if (!onDelete) return;

        if (window.confirm('Êtes-vous sûr de vouloir supprimer cette demande ?')) {
            setIsLoading(true);
            try {
                await onDelete();
            } catch (err) {
                if (err instanceof Error) {
                    setError(err.message);
                } else {
                    setError('Échec de la suppression de la demande');
                }
            } finally {
                setIsLoading(false);
            }
        }
    };

    const audioAlreadyExists = Boolean(selectedBook?.audio_filepath);

    // Active "enregistrement nécessaire" already exists for this book (excluding
    // the order being edited). Checked whenever the book or the recording flag
    // changes; result drives an inline warning + a submit-time confirm.
    useEffect(() => {
        if (formData.catalogueId && formData.lentPhysicalBook) {
            void checkRecording(formData.catalogueId, currentOrderId);
        }
    }, [formData.catalogueId, formData.lentPhysicalBook, currentOrderId, checkRecording]);

    const recordingDup = formData.lentPhysicalBook
        ? getRecordingFor(formData.catalogueId)
        : null;
    const hasRecordingDup = (recordingDup?.activeRecordingCount ?? 0) > 0;

    return (
        <Card className="bg-gray-900 border-gray-700">
            <CardHeader>
                <CardTitle className="text-gray-100">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive" className="mb-4 bg-red-900/20 border-red-800">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-red-200">{error}</AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* User Search (Aveugle) */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Auditeur <span className="text-red-500">*</span>
                        </label>
                        <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    ref={registerField('aveugleId')}
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750 transition-colors"
                                >
                                    {selectedUser ? (
                                        <span className="truncate">
                                            {getUserDisplayName(selectedUser)}
                                        </span>
                                    ) : (
                                        <span className="text-gray-400">Rechercher un auditeur ...</span>
                                    )}
                                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[400px] p-0 bg-gray-800 border-gray-700" align="start">
                                <div className="p-2">
                                    <Input
                                        placeholder="Rechercher par nom ou email..."
                                        value={userSearch}
                                        onChange={(e) => setUserSearch(e.target.value)}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                                <div className="max-h-[200px] overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                                    {isSearchingUsers && (
                                        <div className="p-4 text-center text-gray-400">Recherche...</div>
                                    )}
                                    {!isSearchingUsers && users.length === 0 && userSearch.length >= 2 && (
                                        <div className="p-4 text-center text-gray-400">Aucun utilisateur trouvé</div>
                                    )}
                                    {users.map((user) => (
                                        <button
                                            key={user.id}
                                            onClick={() => handleUserSelect(user)}
                                            className="w-full text-left px-4 py-2 hover:bg-gray-700 text-gray-200 transition-colors"
                                        >
                                            <div className="font-medium">{getUserDisplayName(user)}</div>
                                            <div className="text-sm text-gray-400">{user.email}</div>
                                        </button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Book Search */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Livre <span className="text-red-500">*</span>
                        </label>
                        <Popover open={bookPopoverOpen} onOpenChange={setBookPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    ref={registerField('catalogueId')}
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750 transition-colors"
                                >
                                    {selectedBook ? (
                                        <span className="truncate">
                                            {selectedBook.title} - {selectedBook.author}
                                        </span>
                                    ) : (
                                        <span className="text-gray-400">Rechercher un livre ...</span>
                                    )}
                                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[400px] p-0 bg-gray-800 border-gray-700" align="start">
                                <div className="p-2">
                                    <Input
                                        placeholder="Rechercher par titre ou auteur..."
                                        value={bookSearch}
                                        onChange={(e) => setBookSearch(e.target.value)}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                                <div className="max-h-[200px] overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                                    {isSearchingBooks && (
                                        <div className="p-4 text-center text-gray-400">Recherche...</div>
                                    )}
                                    {!isSearchingBooks && books.length === 0 && bookSearch.length >= 2 && (
                                        <div className="p-4 text-center text-gray-400">Aucun livre trouvé</div>
                                    )}
                                    {books.map((book) => (
                                        <button
                                            key={book.id}
                                            onClick={() => handleBookSelect(book)}
                                            className="w-full text-left px-4 py-2 hover:bg-gray-700 text-gray-200 transition-colors"
                                        >
                                            <div className="font-medium">{book.title}</div>
                                            <div className="text-sm text-gray-400">{book.author}</div>
                                        </button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Request Received Date */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Date de réception <span className="text-red-500">*</span>
                        </label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-full justify-start text-left bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750"
                                >
                                    <Calendar className="mr-2 h-4 w-4" />
                                    {formData.requestReceivedDate ? (
                                        format(formData.requestReceivedDate, 'PPP', { locale: fr })
                                    ) : (
                                        <span>Sélectionner une date</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-gray-800 border-gray-700">
                                <CalendarComponent
                                    mode="single"
                                    selected={formData.requestReceivedDate}
                                    onSelect={(date) => date && setFormData({ ...formData, requestReceivedDate: date })}
                                    initialFocus
                                    className="bg-gray-800 text-gray-200"
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Closure Date */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">Date de cloture</label>
                        <p className="text-xs text-gray-400">Date à laquelle la commande terminée est expédiée à l&apos;auditeur (clôture).</p>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-full justify-start text-left bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750"
                                >
                                    <Calendar className="mr-2 h-4 w-4" />
                                    {formData.closureDate ? (
                                        format(formData.closureDate, 'PPP', { locale: fr })
                                    ) : (
                                        <span>Sélectionner une date</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-gray-800 border-gray-700">
                                <CalendarComponent
                                    mode="single"
                                    selected={formData.closureDate || undefined}
                                    onSelect={(date) => setFormData({ ...formData, closureDate: date || null })}
                                    initialFocus
                                    className="bg-gray-800 text-gray-200"
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Type de la demande */}
                    <div className="space-y-2 pt-4 border-t border-gray-700">
                        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                            Type de la demande
                        </h3>
                        <div className="space-y-4">
                            {audioAlreadyExists && (
                                <div className="bg-amber-900/30 border border-amber-700 text-amber-200 p-3 rounded-lg text-sm">
                                    Un fichier audio existe déjà pour ce livre. La case
                                    « Duplication » a été cochée automatiquement — décochez-la
                                    s&apos;il s&apos;agit d&apos;une réécoute / nouvel enregistrement.
                                </div>
                            )}
                            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                                <div className="flex items-center space-x-3">
                                    <Checkbox
                                        id="isDuplication"
                                        checked={formData.isDuplication}
                                        onCheckedChange={handleDuplicationChange}
                                        className="border-2 border-gray-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 w-6 h-6"
                                    />
                                    <label htmlFor="isDuplication" className="text-base font-bold text-gray-100 cursor-pointer leading-tight flex-1">
                                        Duplication
                                    </label>
                                </div>
                            </div>

                            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                                <div className="flex items-center space-x-3">
                                    <Checkbox
                                        id="lentPhysicalBook"
                                        checked={formData.lentPhysicalBook}
                                        onCheckedChange={handleRecordingChange}
                                        className="border-2 border-gray-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 w-6 h-6"
                                    />
                                    <label htmlFor="lentPhysicalBook" className="text-base font-bold text-gray-100 cursor-pointer leading-tight flex-1">
                                        Enregistrement nécessaire
                                    </label>
                                </div>
                                {audioAlreadyExists && formData.lentPhysicalBook && (
                                    <p className="mt-2 ml-9 text-sm text-amber-400">
                                        Attention : un enregistrement audio existe déjà pour cet ouvrage.
                                        Vérifiez qu&apos;un nouvel enregistrement est réellement nécessaire
                                        avant de poursuivre — il s&apos;agit peut-être plutôt d&apos;une duplication.
                                    </p>
                                )}
                                {hasRecordingDup && (
                                    <p className="mt-2 ml-9 text-sm text-amber-400">
                                        Il existe déjà {recordingDup!.activeRecordingCount === 1
                                            ? 'une demande d\u2019enregistrement active'
                                            : `${recordingDup!.activeRecordingCount} demandes d\u2019enregistrement actives`}{' '}
                                        pour cet ouvrage
                                        {recordingDup!.orders[0]?.aveugle?.name
                                            ? ` (ex. ${recordingDup!.orders[0].aveugle!.name})`
                                            : ''}. Êtes-vous sûr de vouloir en créer une nouvelle&nbsp;?
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Status */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Statut <span className="text-red-500">*</span>
                        </label>
                        <Select
                            value={formData.statusId?.toString() || ''}
                            onValueChange={(value) => setFormData({ ...formData, statusId: parseInt(value) })}
                        >
                            <SelectTrigger ref={registerField('statusId')} className="bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750 transition-colors">
                                <SelectValue placeholder="Sélectionner un statut" />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-700 max-h-[280px] overflow-y-auto">
                                <div className="py-1">
                                    {statuses.map((status) => (
                                        <SelectItem
                                            key={status.id}
                                            value={status.id.toString()}
                                            className="text-gray-200 hover:bg-gray-700 focus:bg-gray-700 cursor-pointer pl-8 pr-3 py-2.5 border-b border-gray-700/50 last:border-b-0 transition-colors"
                                        >
                                            <span className="font-medium">{status.name}</span>
                                        </SelectItem>
                                    ))}
                                </div>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Media Format */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Format média <span className="text-red-500">*</span>
                        </label>
                        <Select
                            value={formData.mediaFormatId?.toString() || ''}
                            onValueChange={(value) => setFormData({ ...formData, mediaFormatId: parseInt(value) })}
                        >
                            <SelectTrigger ref={registerField('mediaFormatId')} className="bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750 transition-colors">
                                <SelectValue placeholder="Sélectionner un format" />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-700 max-h-[280px] overflow-y-auto">
                                <div className="py-1">
                                    {mediaFormats.map((format) => (
                                        <SelectItem
                                            key={format.id}
                                            value={format.id.toString()}
                                            className="text-gray-200 hover:bg-gray-700 focus:bg-gray-700 cursor-pointer pl-8 pr-3 py-2.5 border-b border-gray-700/50 last:border-b-0 transition-colors"
                                        >
                                            <span className="font-medium">{format.name}</span>
                                        </SelectItem>
                                    ))}
                                </div>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Delivery Method */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Méthode de livraison <span className="text-red-500">*</span>
                        </label>
                        <Select
                            value={formData.deliveryMethod || ''}
                            onValueChange={(value) => setFormData({ ...formData, deliveryMethod: value as 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE'})}
                        >
                            <SelectTrigger ref={registerField('deliveryMethod')} className="bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750 transition-colors">
                                <SelectValue placeholder="Sélectionner une méthode" />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-700">
                                <div className="py-1">
                                    <SelectItem
                                        value="RETRAIT"
                                        className="text-gray-200 hover:bg-gray-700 focus:bg-gray-700 cursor-pointer pl-8 pr-3 py-2.5 border-b border-gray-700/50 transition-colors"
                                    >
                                        <span className="font-medium">Retrait</span>
                                    </SelectItem>
                                    <SelectItem
                                        value="ENVOI"
                                        className="text-gray-200 hover:bg-gray-700 focus:bg-gray-700 cursor-pointer pl-8 pr-3 py-2.5 border-b border-gray-700/50 transition-colors"
                                    >
                                        <span className="font-medium">Envoi</span>
                                    </SelectItem>
                                    <SelectItem
                                        value="NON_APPLICABLE"
                                        className="text-gray-200 hover:bg-gray-700 focus:bg-gray-700 cursor-pointer pl-8 pr-3 py-2.5 transition-colors"
                                    >
                                        <span className="font-medium">Non applicable</span>
                                    </SelectItem>
                                </div>
                            </SelectContent>
                        </Select>
                    </div>


                    {/* Billing Status */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">État de facturation</label>
                        {formData.billingStatus === 'BILLED' ? (
                            <div className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2.5 text-gray-300">
                                Facturé <span className="text-xs text-gray-500">(géré par la facture liée)</span>
                            </div>
                        ) : (
                            <Select
                                value={formData.billingStatus}
                                onValueChange={(value) => setFormData({ ...formData, billingStatus: value as 'UNBILLED' | 'BILLED' | 'UNBILLABLE'})}
                            >
                                <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750 transition-colors">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-800 border-gray-700">
                                    <div className="py-1">
                                        <SelectItem
                                            value="UNBILLED"
                                            className="text-gray-200 hover:bg-gray-700 focus:bg-gray-700 cursor-pointer pl-8 pr-3 py-2.5 border-b border-gray-700/50 transition-colors"
                                        >
                                            <span className="font-medium">Non facturé</span>
                                        </SelectItem>
                                        <SelectItem
                                            value="UNBILLABLE"
                                            className="text-gray-200 hover:bg-gray-700 focus:bg-gray-700 cursor-pointer pl-8 pr-3 py-2.5 transition-colors"
                                        >
                                            <span className="font-medium">Non facturable</span>
                                        </SelectItem>
                                    </div>
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {/* Linked Bill — read-only */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">Facture associée</label>
                        {initialBill ? (
                            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-800 border border-gray-700 rounded-md">
                                <span className="text-gray-200 text-sm">
                                    Facture #{initialBill.id} — {getBillingStatusLabel(initialBill.state as BillingStatus)}
                                </span>
                                <Link
                                    href={`/admin/bills?bill=${initialBill.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-medium text-blue-400 hover:text-blue-300 underline underline-offset-2 whitespace-nowrap"
                                >
                                    Voir la facture
                                </Link>
                            </div>
                        ) : (
                            <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-500 text-sm italic">
                                Aucune facture associée
                            </div>
                        )}
                    </div>

                    {/* Affectation liée — read-only. Hidden for duplications:
                        a duplication never has an affectation, so showing it confuses the team. */}
                    {!formData.isDuplication && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-200">Attribution</label>
                            {initialAssignment ? (
                                <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-800 border border-gray-700 rounded-md">
                                    <div className="text-sm text-gray-200 space-y-0.5">
                                        <div>
                                            <span className="text-gray-300">{initialAssignment.statusName}</span>
                                            {initialAssignment.reader && (
                                                <span> — Lecteur : <span className="text-gray-100">{initialAssignment.reader.name ?? 'Sans nom'}</span></span>
                                            )}
                                        </div>
                                        {initialAssignment.sentToReaderDate && (
                                            <div className="text-xs text-gray-500">
                                                Envoyé au lecteur le {format(new Date(initialAssignment.sentToReaderDate), 'dd/MM/yyyy', { locale: fr })}
                                            </div>
                                        )}
                                    </div>
                                    <Link
                                        href={`/admin/assignments?assignment=${initialAssignment.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm font-medium text-blue-400 hover:text-blue-300 underline underline-offset-2 whitespace-nowrap"
                                    >
                                        Voir l&apos;attribution
                                    </Link>
                                </div>
                            ) : (
                                <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-500 text-sm italic">
                                    Aucune attribution
                                </div>
                            )}
                        </div>
                    )}

                    {/* Cost */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">Coût</label>
                        <div className="relative">
                            <Input
                                type="text"
                                inputMode="decimal"
                                value={formData.cost}
                                onChange={(e) => setFormData({ ...formData, cost: sanitizeDecimal(e.target.value) })}
                                onBlur={() => setFormData({ ...formData, cost: formatEuro2(formData.cost) })}
                                disabled={costLocked}
                                className={`bg-gray-800 border-gray-700 text-gray-200 pr-8 ${costLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                placeholder="0.00"
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400">€</span>
                        </div>
                        {costLocked && (
                            <p className="text-xs text-amber-400">
                                Coût verrouillé : la facture #{initialBill?.id} est {initialBill?.state === 'PAID' ? 'payée' : 'soldée'}. Rouvrez-la pour le modifier.
                            </p>
                        )}
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

                    {/* System Information - Read Only */}
                    {selectedStaff && (
                        <div className="space-y-2 pt-4 border-t border-gray-700">
                            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                                Informations système
                            </h3>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-400">
                                    Traité par
                                </label>
                                <div className="px-3 py-2 bg-gray-850 border border-gray-700 rounded-md text-gray-400 cursor-not-allowed opacity-75">
                                    {getUserDisplayName(selectedStaff)}
                                </div>
                                <p className="text-xs text-gray-500 italic">
                                </p>
                            </div>
                        </div>
                    )}

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
                                Supprimer la demande
                            </Button>
                        )}
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Multi-book order creation (fan-out: one order is created per book)
// ---------------------------------------------------------------------------

type OrderLineType = 'DUPLICATION' | 'ENREGISTREMENT';

interface OrderBookLine {
    key: string;
    book: Book | null;
    type: OrderLineType;
    cost: string;
    mediaFormatId: number | null; // null => use the header default
}

let lineKeySeq = 0;
const makeLine = (cost: string): OrderBookLine => ({
    key: `line-${++lineKeySeq}-${Date.now()}`,
    book: null,
    type: 'DUPLICATION',
    cost,
    mediaFormatId: null,
});

// Cap a displayed string so long titles don't blow out the layout
const clip = (s: string, n = 40) => (s.length > n ? s.slice(0, n).trimEnd() + '…' : s);

// Search-an-existing-book picker for a single line
function BookLinePicker({ selected, onSelect }: { selected: Book | null; onSelect: (book: Book) => void }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<Book[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const t = setTimeout(async () => {
            if (search.length < 2) { setResults([]); setLoading(false); return; }
            setLoading(true);
            try {
                const res = await fetch(`/api/books?search=${encodeURIComponent(search)}&limit=10`);
                if (res.ok) { const { books } = await res.json(); setResults(books); }
            } catch (err) { console.error('Book search error:', err); }
            finally { setLoading(false); }
        }, 300);
        return () => clearTimeout(t);
    }, [search]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox"
                        className="w-full justify-between bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750">
                    {selected
                        ? <span className="truncate">{clip(`${selected.title} — ${selected.author}`)}</span>
                        : <span className="text-gray-400">Rechercher un livre existant ...</span>}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0 bg-gray-800 border-gray-700" align="start">
                <div className="p-2">
                    <Input placeholder="Rechercher par titre ou auteur..." value={search}
                           onChange={(e) => setSearch(e.target.value)}
                           className="bg-gray-900 border-gray-700 text-gray-200" />
                </div>
                <div className="max-h-[200px] overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                    {loading && <div className="p-4 text-center text-gray-400">Recherche...</div>}
                    {!loading && results.length === 0 && search.length >= 2 && (
                        <div className="p-4 text-center text-gray-400">Aucun livre trouvé</div>
                    )}
                    {results.map((book) => (
                        <button key={book.id} type="button"
                                onClick={() => { onSelect(book); setOpen(false); setSearch(''); }}
                                className="w-full text-left px-4 py-2 hover:bg-gray-700 text-gray-200 transition-colors">
                            <div className="font-medium">{book.title}</div>
                            <div className="text-sm text-gray-400">{book.author}</div>
                        </button>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}

// Create-a-new-book modal that returns the created book to the calling line
function CreateBookDialog({ onCreated }: { onCreated: (book: Book) => void }) {
    const [open, setOpen] = useState(false);

    const handleSuccess = async (bookId: number) => {
        try {
            const res = await fetch(`/api/books/${bookId}`);
            if (res.ok) {
                const book = await res.json();
                onCreated({ id: book.id, title: book.title, author: book.author });
            } else {
                onCreated({ id: bookId, title: 'Nouveau livre', author: '' });
            }
        } catch {
            onCreated({ id: bookId, title: 'Nouveau livre', author: '' });
        }
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button type="button" variant="outline"
                        className="bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700 whitespace-nowrap">
                    <Plus className="h-4 w-4 mr-2" /> Nouveau livre
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">
                <DialogHeader>
                    <DialogTitle className="text-gray-100">Créer un nouveau livre</DialogTitle>
                </DialogHeader>
                <AddBookFormBackend onSuccess={handleSuccess} />
            </DialogContent>
        </Dialog>
    );
}

// Add Order Form — multiple books, one order created per book
export function AddOrderFormBackend({ onSuccess, initialClient }: { onSuccess?: (orderId: number) => void; initialClient?: User | null }) {
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toastError } = useFormToast();
    const { registerField, focusFirstInvalid } = useInvalidField();
    const { check: checkRecording, getFor: getRecordingFor } = useRecordingCheck();

    // Options
    const [statuses, setStatuses] = useState<Status[]>([]);
    const [mediaFormats, setMediaFormats] = useState<MediaFormat[]>([]);

    // Header (shared across every book)
    const [aveugleId, setAveugleId] = useState<number | null>(initialClient?.id ?? null);
    const [selectedUser, setSelectedUser] = useState<User | null>(initialClient ?? null);
    const [requestReceivedDate, setRequestReceivedDate] = useState<Date>(new Date());
    const [deliveryMethod, setDeliveryMethod] = useState<'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE' | null>(null);
    const [mediaFormatId, setMediaFormatId] = useState<number | null>(null);
    const [billingStatus, setBillingStatus] = useState<'UNBILLED' | 'BILLED' | 'UNBILLABLE'>('UNBILLED');
    const [defaultCost, setDefaultCost] = useState('3.00');
    const [notes, setNotes] = useState('');

    // Book lines
    const [lines, setLines] = useState<OrderBookLine[]>([makeLine('3.00')]);

    // For each ENREGISTREMENT line with a book, look up whether the book already
    // has an active recording demande (drives the per-line warning + submit confirm).
    useEffect(() => {
        for (const l of lines) {
            if (l.type === 'ENREGISTREMENT' && l.book) {
                void checkRecording(l.book.id);
            }
        }
    }, [lines, checkRecording]);

    // Auditeur search
    const [userSearch, setUserSearch] = useState('');
    const [users, setUsers] = useState<User[]>([]);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [userPopoverOpen, setUserPopoverOpen] = useState(false);

    useEffect(() => {
        const fetchOptions = async () => {
            try {
                const [statusesRes, formatsRes] = await Promise.all([
                    fetch('/api/statuses'),
                    fetch('/api/media-formats'),
                ]);
                if (statusesRes.ok) setStatuses(await statusesRes.json());
                if (formatsRes.ok) setMediaFormats(await formatsRes.json());
            } catch (err) {
                console.error('Error fetching options:', err);
                setError('Échec du chargement des options du formulaire');
            }
        };
        fetchOptions();
    }, []);

    useEffect(() => {
        const t = setTimeout(async () => {
            if (userSearch.length < 2) { setUsers([]); setIsSearchingUsers(false); return; }
            setIsSearchingUsers(true);
            try {
                const res = await fetch(`/api/user/search?q=${encodeURIComponent(userSearch)}`);
                if (res.ok) setUsers(await res.json());
            } catch (err) { console.error('Error searching users:', err); }
            finally { setIsSearchingUsers(false); }
        }, 300);
        return () => clearTimeout(t);
    }, [userSearch]);

    // Derive a line's status from its type (same rule as the single-order form)
    const statusForType = (type: OrderLineType): number | null => {
        const find = (pred: (s: Status) => boolean) => statuses.find(pred)?.id ?? null;
        return type === 'DUPLICATION'
            ? find(s => s.name.toLowerCase().includes('en cours'))
            : find(s => s.name.toLowerCase().includes('attente') && s.name.toLowerCase().includes('lecteur'));
    };

    const updateLine = (key: string, patch: Partial<OrderBookLine>) =>
        setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));
    const removeLine = (key: string) =>
        setLines(prev => (prev.length > 1 ? prev.filter(l => l.key !== key) : prev));
    const addLine = () => setLines(prev => [...prev, makeLine(defaultCost)]);
    const handleDefaultCostChange = (value: string) => {
        setDefaultCost(value);
        setLines(prev => prev.map(l => ({ ...l, cost: value })));
    };

    const dupCount = lines.filter(l => l.type === 'DUPLICATION').length;
    const recCount = lines.length - dupCount;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        // N3 — collect failing required fields in visual order.
        const invalid: string[] = [];
        if (!aveugleId) invalid.push('aveugleId');
        if (!deliveryMethod) invalid.push('deliveryMethod');
        if (!mediaFormatId) invalid.push('mediaFormatId');
        const firstLineMissingBook = lines.findIndex((l) => !l.book);
        if (lines.length === 0 || firstLineMissingBook !== -1) invalid.push('lines');

        if (invalid.length) {
            let msg: string;
            const firstName = CREATE_FIELD_ORDER.find((n) => invalid.includes(n)) ?? invalid[0];
            if (firstName === 'aveugleId') msg = 'Veuillez sélectionner un auditeur';
            else if (firstName === 'deliveryMethod') msg = 'Veuillez sélectionner une méthode de livraison';
            else if (firstName === 'mediaFormatId') msg = 'Veuillez sélectionner un format média par défaut';
            else if (lines.length === 0) msg = 'Ajoutez au moins un ouvrage';
            else msg = `La ligne ${firstLineMissingBook + 1} doit comporter un livre`;
            setError(msg);
            toastError(msg);
            focusFirstInvalid(CREATE_FIELD_ORDER, new Set(invalid));
            setIsLoading(false);
            return;
        }

        const books = lines.map(l => ({
            catalogueId: l.book!.id,
            isDuplication: l.type === 'DUPLICATION',
            lentPhysicalBook: l.type === 'ENREGISTREMENT',
            statusId: statusForType(l.type),
            mediaFormatId: l.mediaFormatId ?? mediaFormatId,
            cost: l.cost || defaultCost,
        }));

        if (books.some(b => !b.statusId)) {
            const msg = "Statut introuvable pour un type d'ouvrage. Vérifiez la table des statuts.";
            setError(msg);
            toastError(msg);
            setIsLoading(false);
            return;
        }

        // Guard: warn before creating recording demande(s) for book(s) that already
        // have an active recording demande. One confirm covers all offending lines.
        const recordingLines = lines.filter((l) => l.type === 'ENREGISTREMENT' && l.book);
        const dupTitles: string[] = [];
        for (const l of recordingLines) {
            const r = await checkRecording(l.book!.id);
            if (r && r.activeRecordingCount > 0) dupTitles.push(l.book!.title);
        }
        if (dupTitles.length > 0) {
            const confirmed = window.confirm(
                `Une demande d\u2019enregistrement active existe déjà pour : ${dupTitles.join(', ')}.\n\n` +
                `Voulez-vous vraiment créer ${dupTitles.length > 1 ? 'ces nouvelles demandes' : 'cette nouvelle demande'} d\u2019enregistrement ?`
            );
            if (!confirmed) {
                setIsLoading(false);
                return;
            }
        }

        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aveugleId, requestReceivedDate, deliveryMethod, billingStatus, notes, books }),
            });
            const data = await res.json();

            if (!res.ok) {
                const msg = data?.message || 'Échec de la création des commandes';
                toast({
                    variant: "destructive",
                    // @ts-expect-error jsx in toast
                    title: <span className="text-2xl font-bold">Erreur</span>,
                    description: <span className="text-xl mt-2">{msg}</span>,
                    className: "bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6"
                });
                setError(msg);
                return;
            }

            const ids: number[] = data.orderIds || [];
            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">{ids.length} commande(s) créée(s){ids.length ? ` : #${ids.join(', #')}` : ''}</span>,
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
            });
            if (data.autoBill) {
                toast({
                    // @ts-expect-error jsx in toast
                    title: <span className="text-2xl font-bold">Facture en brouillon créée</span>,
                    description: <span className="text-xl mt-2">Le seuil de paiement du client est atteint : une facture en brouillon (#{data.autoBill.billId}) regroupant {data.autoBill.orderCount} commande(s) a été créée.</span>,
                    className: "bg-blue-100 border-2 border-blue-500 text-blue-900 shadow-lg p-6"
                });
            }
            if (onSuccess && ids.length) onSuccess(ids[0]);
        } catch (err) {
            console.error('Batch submit error:', err);
            const msg = 'Échec de la création des commandes';
            setError(msg);
            toastError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="bg-gray-900 border-gray-700">
            <CardHeader>
                <CardTitle className="text-gray-100">Créer une ou plusieurs demandes</CardTitle>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive" className="mb-4 bg-red-900/20 border-red-800">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-red-200">{error}</AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Auditeur */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Auditeur <span className="text-red-500">*</span>
                        </label>
                        <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button ref={registerField('aveugleId')} type="button" variant="outline" role="combobox"
                                        className="w-full justify-between bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750 transition-colors">
                                    {selectedUser
                                        ? <span className="truncate">{clip(getUserDisplayName(selectedUser))}</span>
                                        : <span className="text-gray-400">Rechercher un auditeur ...</span>}
                                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[400px] p-0 bg-gray-800 border-gray-700" align="start">
                                <div className="p-2">
                                    <Input placeholder="Rechercher par nom ou email..." value={userSearch}
                                           onChange={(e) => setUserSearch(e.target.value)}
                                           className="bg-gray-900 border-gray-700 text-gray-200" />
                                </div>
                                <div className="max-h-[200px] overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                                    {isSearchingUsers && <div className="p-4 text-center text-gray-400">Recherche...</div>}
                                    {!isSearchingUsers && users.length === 0 && userSearch.length >= 2 && (
                                        <div className="p-4 text-center text-gray-400">Aucun utilisateur trouvé</div>
                                    )}
                                    {users.map((user) => (
                                        <button key={user.id} type="button"
                                                onClick={() => { setSelectedUser(user); setAveugleId(user.id); setUserPopoverOpen(false); setUserSearch(''); }}
                                                className="w-full text-left px-4 py-2 hover:bg-gray-700 text-gray-200 transition-colors">
                                            <div className="font-medium">{getUserDisplayName(user)}</div>
                                            <div className="text-sm text-gray-400">{user.email}</div>
                                        </button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Shared header fields */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-200">Date de réception <span className="text-red-500">*</span></label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button type="button" variant="outline"
                                            className="w-full justify-start text-left bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750">
                                        <Calendar className="mr-2 h-4 w-4" />
                                        {format(requestReceivedDate, 'PPP', { locale: fr })}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-gray-800 border-gray-700">
                                    <CalendarComponent mode="single" selected={requestReceivedDate}
                                                       onSelect={(d) => d && setRequestReceivedDate(d)} initialFocus className="bg-gray-800 text-gray-200" />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-200">Méthode de livraison <span className="text-red-500">*</span></label>
                            <Select value={deliveryMethod || ''} onValueChange={(v) => setDeliveryMethod(v as 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE')}>
                                <SelectTrigger ref={registerField('deliveryMethod')} className="bg-gray-800 border-gray-700 text-gray-200"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                                <SelectContent className="bg-gray-800 border-gray-700">
                                    <SelectItem value="RETRAIT" className="text-gray-200">Retrait</SelectItem>
                                    <SelectItem value="ENVOI" className="text-gray-200">Envoi</SelectItem>
                                    <SelectItem value="NON_APPLICABLE" className="text-gray-200">Non applicable</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-200">Format média par défaut <span className="text-red-500">*</span></label>
                            <Select value={mediaFormatId?.toString() || ''} onValueChange={(v) => setMediaFormatId(parseInt(v))}>
                                <SelectTrigger ref={registerField('mediaFormatId')} className="bg-gray-800 border-gray-700 text-gray-200"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                                <SelectContent className="bg-gray-800 border-gray-700 max-h-[280px] overflow-y-auto">
                                    {mediaFormats.map((f) => (
                                        <SelectItem key={f.id} value={f.id.toString()} className="text-gray-200">{f.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-200">État de facturation</label>
                            <Select value={billingStatus} onValueChange={(v) => setBillingStatus(v as 'UNBILLED' | 'BILLED' | 'UNBILLABLE')}>
                                <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-gray-800 border-gray-700">
                                    <SelectItem value="UNBILLED" className="text-gray-200">Non facturé</SelectItem>
                                    <SelectItem value="UNBILLABLE" className="text-gray-200">Non facturable</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Default cost */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">Coût par défaut</label>
                        <div className="relative">
                            <Input type="text" inputMode="decimal" value={defaultCost}
                                   onChange={(e) => handleDefaultCostChange(sanitizeDecimal(e.target.value))}
                                   onBlur={() => handleDefaultCostChange(formatEuro2(defaultCost))}
                                   className="bg-gray-800 border-gray-700 text-gray-200 pr-8" placeholder="0.00" />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400">€</span>
                        </div>
                    </div>

                    {/* Book lines */}
                    <div className="space-y-3 pt-4 border-t border-gray-700">
                        <div className="flex items-center justify-between">
                            <h3 ref={registerField('lines')} tabIndex={-1} className="text-sm font-medium text-gray-400 uppercase tracking-wide outline-none">Ouvrages ({lines.length})</h3>
                            <span className="text-xs text-gray-500">{dupCount} duplication(s) · {recCount} enregistrement(s)</span>
                        </div>

                        {lines.map((line, idx) => (
                            <div key={line.key} className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-300">Ouvrage {idx + 1}</span>
                                    {lines.length > 1 && (
                                        <button type="button" onClick={() => removeLine(line.key)}
                                                className="text-gray-500 hover:text-red-400 transition-colors" aria-label="Retirer l'ouvrage">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <div className="flex-1 min-w-0">
                                        <BookLinePicker selected={line.book} onSelect={(b) => updateLine(line.key, { book: b })} />
                                    </div>
                                    <CreateBookDialog onCreated={(b) => updateLine(line.key, { book: b })} />
                                </div>

                                {/* Type — per book */}
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => updateLine(line.key, { type: 'DUPLICATION' })}
                                            className={`p-3 rounded-md border text-sm font-medium transition-colors ${line.type === 'DUPLICATION' ? 'bg-green-700/30 border-green-600 text-green-200' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}>
                                        Duplication
                                    </button>
                                    <button type="button" onClick={() => updateLine(line.key, { type: 'ENREGISTREMENT' })}
                                            className={`p-3 rounded-md border text-sm font-medium transition-colors ${line.type === 'ENREGISTREMENT' ? 'bg-amber-700/30 border-amber-600 text-amber-200' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}>
                                        Enregistrement nécessaire
                                    </button>
                                </div>

                                {/* #2 — audio already exists for this book */}
                                {line.type === 'ENREGISTREMENT' && line.book?.audio_filepath && (
                                    <p className="text-sm text-amber-400">
                                        Attention : un enregistrement audio existe déjà pour cet ouvrage.
                                        Vérifiez qu&apos;un nouvel enregistrement est réellement nécessaire — il
                                        s&apos;agit peut-être plutôt d&apos;une duplication.
                                    </p>
                                )}
                                {/* Active recording demande already exists for this book */}
                                {line.type === 'ENREGISTREMENT' && line.book &&
                                    (getRecordingFor(line.book.id)?.activeRecordingCount ?? 0) > 0 && (
                                    <p className="text-sm text-amber-400">
                                        Il existe déjà une demande d&apos;enregistrement active pour cet
                                        ouvrage{getRecordingFor(line.book.id)!.orders[0]?.aveugle?.name
                                            ? ` (ex. ${getRecordingFor(line.book.id)!.orders[0].aveugle!.name})`
                                            : ''}. Êtes-vous sûr de vouloir en créer une nouvelle&nbsp;?
                                    </p>
                                )}

                                {/* Per-line overrides */}
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-xs text-gray-400">Format (sinon défaut)</label>
                                        <Select value={line.mediaFormatId?.toString() || ''}
                                                onValueChange={(v) => updateLine(line.key, { mediaFormatId: v ? parseInt(v) : null })}>
                                            <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200 h-9"><SelectValue placeholder="Format par défaut" /></SelectTrigger>
                                            <SelectContent className="bg-gray-800 border-gray-700 max-h-[240px] overflow-y-auto">
                                                {mediaFormats.map((f) => (
                                                    <SelectItem key={f.id} value={f.id.toString()} className="text-gray-200">{f.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-gray-400">Coût</label>
                                        <div className="relative">
                                            <Input type="text" inputMode="decimal" value={line.cost}
                                                   onChange={(e) => updateLine(line.key, { cost: sanitizeDecimal(e.target.value) })}
                                                   onBlur={() => updateLine(line.key, { cost: formatEuro2(line.cost) })}
                                                   className="bg-gray-800 border-gray-700 text-gray-200 h-9 pr-8" placeholder={defaultCost} />
                                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400">€</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        <Button type="button" variant="outline" onClick={addLine}
                                className="w-full bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700">
                            <Plus className="h-4 w-4 mr-2" /> Ajouter un ouvrage
                        </Button>
                    </div>

                    {/* Shared notes */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">Notes (communes)</label>
                        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                                  className="bg-gray-800 border-gray-700 text-gray-200 min-h-[100px]"
                                  placeholder="Ajouter des notes supplémentaires..." />
                    </div>

                    <div className="rounded-md bg-gray-800/50 border border-gray-700 p-3 text-sm text-gray-300">
                        {lines.length === 1
                            ? '1 ouvrage → 1 commande sera créée. Le numéro sera attribué lors de la soumission.'
                            : `${lines.length} ouvrages → ${lines.length} commandes seront créées. Les numéros seront attribués lors de la soumission.`}
                    </div>

                    <Button type="submit" disabled={isLoading}
                            className="w-full bg-gray-700 hover:bg-gray-600 text-gray-100 border-gray-100">
                        {isLoading ? 'Création en cours...' : `Créer ${lines.length} ${lines.length === 1 ? 'commande' : 'commandes'}`}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}

// Edit Order Form using the base
export function EditOrderFormBackend({
                                         orderId,
                                         initialData,
                                         onSuccess,
                                         initialSelectedUser,
                                         initialSelectedBook,
                                         initialSelectedStaff,
                                         initialBill,
                                     }: {
    orderId: string;
    initialData: OrderFormData;
    onSuccess?: (orderId: number, isDeleted?: boolean) => void;
    initialSelectedUser?: User | null;
    initialSelectedBook?: Book | null;
    initialSelectedStaff?: User | null;
    initialBill?: { id: number; state: string } | null;
}) {
    const { toast } = useToast();

    // Fetch the linked affectation (if any) so the form can show reader/status
    // context and a deep-link. Self-contained here, so callers (EditOrderModal)
    // need no changes.
    const [assignment, setAssignment] = useState<OrderAssignment | null>(null);
    useEffect(() => {
        fetch(`/api/orders/${orderId}/assignment`)
            .then((r) => (r.ok ? r.json() : null))
            .then(setAssignment)
            .catch(() => {});
    }, [orderId]);

    type Notice = { billId: number; billState: string; kind: 'COST' | 'VISIBLE'; newTotal?: string | null };
    const [notice, setNotice] = useState<Notice | null>(null);
    const resolveRef = useRef<((id: number) => void) | null>(null);

    const acknowledgeNotice = () => {
        const resolve = resolveRef.current;
        resolveRef.current = null;
        setNotice(null);
        resolve?.(parseInt(orderId));
    };

    const handleDelete = async (): Promise<void> => {
        try {
            const response = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.message || 'Échec de la suppression de la demande');
            }
            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">La demande a été supprimée avec succès</span>,
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
            });
            if (onSuccess) onSuccess(parseInt(orderId), true);
        } catch (error) {
            console.error('Delete error:', error);
            throw error;
        }
    };

    const handleSubmit = async (formData: OrderFormData): Promise<number> => {
        const response = await fetch(`/api/orders/${orderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            const errorMessage = errorData?.message || 'Échec de la mise à jour de la demande';
            toast({
                variant: "destructive",
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Erreur</span>,
                description: <span className="text-xl mt-2">{errorMessage}</span>,
                className: "bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6"
            });
            return Promise.reject();
        }

        const data = await response.json().catch(() => null);

        toast({
            // @ts-expect-error jsx in toast
            title: <span className="text-2xl font-bold">Succès</span>,
            description: <span className="text-xl mt-2">La demande a été mise à jour avec succès</span>,
            className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
        });

        // Hold the modal open behind the reprint dialogue; resolve on acknowledge.
        if (data?.billNotice) {
            setNotice(data.billNotice as Notice);
            return new Promise<number>((resolve) => { resolveRef.current = resolve; });
        }

        return parseInt(orderId);
    };

    return (
        <>
            <OrderFormBackendBase
                initialData={initialData}
                currentOrderId={parseInt(orderId)}
                onSubmit={handleSubmit}
                onDelete={handleDelete}
                showDelete={true}
                submitButtonText="Mettre à jour la demande"
                loadingText="Mise à jour en cours..."
                title="Modifier la demande"
                onSuccess={onSuccess}
                initialSelectedUser={initialSelectedUser}
                initialSelectedBook={initialSelectedBook}
                initialSelectedStaff={initialSelectedStaff}
                initialBill={initialBill}
                initialAssignment={assignment}
            />

            <Dialog open={!!notice} onOpenChange={(open) => { if (!open) acknowledgeNotice(); }}>
                <DialogContent className="bg-gray-900 border-gray-700 max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-amber-300">
                            {notice?.kind === 'COST' ? 'Coût modifié — facture à régénérer' : 'Éléments visibles modifiés'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="text-gray-200 text-sm space-y-3">
                        {notice?.kind === 'COST' ? (
                            <p>
                                Vous avez modifié le coût de cette demande, ce qui a mis à jour le montant total de la
                                facture #{notice?.billId}{notice?.newTotal ? ` (nouveau total : ${notice.newTotal} €)` : ''}.
                                Veuillez consulter la facture, la réimprimer et relancer le processus de facturation afin de
                                conserver des enregistrements corrects.
                            </p>
                        ) : (
                            <p>
                                Vous avez modifié un élément figurant sur la facture #{notice?.billId} (livre, date ou type).
                                Le montant total n&apos;a pas changé, mais le document déjà émis n&apos;est plus à jour :
                                pensez à le réimprimer.
                            </p>
                        )}
                        {notice && (
                            <Link
                                href={`/admin/bills?bill=${notice.billId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block text-blue-400 hover:text-blue-300 underline underline-offset-2"
                            >
                                Voir la facture #{notice.billId}
                            </Link>
                        )}
                    </div>
                    <div className="flex justify-end mt-4">
                        <Button onClick={acknowledgeNotice} className="bg-amber-600 hover:bg-amber-700 text-white">
                            J&apos;ai compris
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}