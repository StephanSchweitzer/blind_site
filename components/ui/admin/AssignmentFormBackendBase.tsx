import React, {useState, useEffect, useCallback} from 'react';
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
import { AlertCircle, Calendar, Search, History, User as UserIcon, ChevronRight, Package } from 'lucide-react';
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

export interface AssignmentFormBackendBaseProps {
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
    const [selectedReaderId, setSelectedReaderId] = useState<number | null>(null);
    const [selectedReader, setSelectedReader] = useState<ReaderSummary | null>(initialSelectedReader || null);
    const [currentReader, setCurrentReader] = useState<ReaderSummary | null>(null);

    // Options data
    const [users, setUsers] = useState<ReaderSummary[]>([]);
    const [books, setBooks] = useState<BookSummary[]>([]);
    const [orders, setOrders] = useState<OrderSummary[]>([]);
    const [statuses, setStatuses] = useState<Status[]>([]);

    // Reader history
    const [readerHistory, setReaderHistory] = useState<AssignmentReaderHistory[]>([]);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    // Search states
    const [userSearch, setUserSearch] = useState('');
    const [bookSearch, setBookSearch] = useState('');
    const [orderSearch, setOrderSearch] = useState('');
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [isSearchingBooks, setIsSearchingBooks] = useState(false);
    const [isSearchingOrders, setIsSearchingOrders] = useState(false);

    // Popover open states
    const [userPopoverOpen, setUserPopoverOpen] = useState(false);
    const [bookPopoverOpen, setBookPopoverOpen] = useState(false);
    const [orderPopoverOpen, setOrderPopoverOpen] = useState(false);

    // Selected display values
    const [selectedBook, setSelectedBook] = useState<BookSummary | null>(initialSelectedBook || null);
    const [selectedOrder, setSelectedOrder] = useState<OrderSummary | null>(initialSelectedOrder || null);

    // Reader reassignment
    const [isReassigningReader, setIsReassigningReader] = useState(false);
    const [reassignNotes, setReassignNotes] = useState('');
    const [showReassignSection, setShowReassignSection] = useState(false);

    const { toast } = useToast();

    // Fetch initial data
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [statusesRes, ordersRes] = await Promise.all([
                    fetch('/api/statuses'),
                    fetch('/api/orders?page=1&limit=100'),
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
        fetchReaderHistory();
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
                const response = await fetch(
                    `/api/books?search=${encodeURIComponent(bookSearch)}&limit=50`
                );

                if (!response.ok) {
                    console.error('Book search failed:', response.status, response.statusText);
                    const errorData = await response.json().catch(() => null);
                    console.error('Error data:', errorData);
                    setBooks([]);
                    return;
                }

                const data = await response.json();
                console.log('Book search results:', data);
                setBooks(data.books || []);
            } catch (err) {
                console.error('Error searching books:', err);
                setBooks([]);
            } finally {
                setIsSearchingBooks(false);
            }
        };

        const debounce = setTimeout(searchBooks, 300);
        return () => clearTimeout(debounce);
    }, [bookSearch]);

    // Search orders
    useEffect(() => {
        const searchOrders = async () => {
            if (orderSearch.length < 2) {
                return;
            }

            setIsSearchingOrders(true);
            try {
                const response = await fetch(
                    `/api/orders?page=1&limit=50&search=${encodeURIComponent(orderSearch)}`
                );
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

        const debounce = setTimeout(searchOrders, 300);
        return () => clearTimeout(debounce);
    }, [orderSearch]);

    const handleReaderSelect = (user: ReaderSummary) => {
        setSelectedReader(user);
        setSelectedReaderId(user.id);
        setUserPopoverOpen(false);
        setUserSearch('');
    };

    const handleBookSelect = (book: BookSummary) => {
        setSelectedBook(book);
        setFormData({ ...formData, catalogueId: book.id });
        setBookPopoverOpen(false);
        setBookSearch('');
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

        // Update reception date from order's request received date (convert to ISO string)
        if (order.requestReceivedDate) {
            const dateString = new Date(order.requestReceivedDate).toISOString();
            setFormData(prev => ({ ...prev, receptionDate: dateString }));
        }
    };

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
                description: "Ce lecteur est déjà assigné à cette affectation",
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
                    notes: reassignNotes || 'Réaffectation',
                }),
            });

            if (!response.ok) {
                throw new Error('Échec de la réaffectation');
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
                description: "Échec de la réaffectation du lecteur",
            });
        } finally {
            setIsReassigningReader(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validate required fields
        if (!formData.catalogueId) {
            setError('Veuillez sélectionner un livre du catalogue');
            return;
        }

        if (!formData.statusId) {
            setError('Veuillez sélectionner un statut');
            return;
        }

        setIsLoading(true);

        try {
            // Pass readerId separately for create, not in formData
            const assignmentId = await onSubmit(formData, selectedReaderId);
            if (onSuccess) {
                onSuccess(assignmentId);
            }
        } catch (err) {
            console.error('Submit error:', err);
            setError('Une erreur est survenue lors de la soumission du formulaire');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteClick = async () => {
        if (!onDelete) return;

        const confirmed = window.confirm(
            'Êtes-vous sûr de vouloir supprimer cette affectation ? Cette action est irréversible.'
        );

        if (!confirmed) return;

        setIsLoading(true);
        setError(null);

        try {
            await onDelete();
        } catch (err) {
            console.error('Delete error:', err);
            setError('Échec de la suppression de l\'affectation');
            setIsLoading(false);
        }
    };

    const DatePicker = ({
                            value,
                            onChange,
                            label,
                            placeholder
                        }: {
        value: string | null;
        onChange: (date: string | null) => void;
        label: string;
        placeholder: string;
    }) => {
        const [open, setOpen] = useState(false);
        const date = value ? new Date(value) : undefined;

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
                                onChange(newDate ? newDate.toISOString() : null);
                                setOpen(false);
                            }}
                            initialFocus
                            locale={fr}
                        />
                    </PopoverContent>
                </Popover>
            </div>
        );
    };

    const getReaderDisplayName = (
        reader: ReaderSummary| null
    ) => {
        if (!reader) return null;
        return reader.name || `${reader.firstName || ''} ${reader.lastName || ''}`.trim() || reader.email;
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
                                                {isReassigningReader ? 'Affectation...' : 'Affecter ce lecteur'}
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
                                                {isReassigningReader ? 'Réaffectation...' : 'Réaffecter'}
                                            </Button>
                                        </div>

                                        <Input
                                            placeholder="Raison de la réaffectation (optionnel)"
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
                                            <Package className="h-4 w-4" />
                                            <span>Commande #{selectedOrder.id}</span>
                                        </div>
                                    ) : (
                                        <span className="text-gray-400">Sélectionner une commande...</span>
                                    )}
                                    <Search className="ml-2 h-4 w-4 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[600px] p-0 bg-gray-800 border-gray-700">
                                <div className="p-2">
                                    <Input
                                        placeholder="Rechercher une commande..."
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
                                    ) : orders.length > 0 ? (
                                        orders.map((order) => (
                                            <div
                                                key={order.id}
                                                className="px-4 py-3 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-b-0"
                                                onClick={() => handleOrderSelect(order)}
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <Package className="h-4 w-4 text-blue-400" />
                                                            <span className="font-semibold text-gray-200">
                                                                Commande #{order.id}
                                                            </span>
                                                        </div>
                                                        {order.aveugle && (
                                                            <div className="text-sm text-gray-300 mb-1">
                                                                <span className="text-gray-400">Auditeur:</span> {order.aveugle.name || `${order.aveugle.firstName} ${order.aveugle.lastName}`}
                                                            </div>
                                                        )}
                                                        {order.catalogue && (
                                                            <div className="text-sm text-gray-300 mb-1">
                                                                <span className="text-gray-400">Livre:</span> {order.catalogue.title}
                                                                {order.catalogue.author && <span className="text-gray-500"> - {order.catalogue.author}</span>}
                                                            </div>
                                                        )}
                                                        {(order.requestReceivedDate || order.createdDate) && (
                                                            <div className="text-xs text-gray-400">
                                                                Commandé le {format(new Date(order.requestReceivedDate || order.createdDate!), 'dd/MM/yyyy', { locale: fr })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-4 text-center text-gray-400">
                                            Aucune commande trouvée
                                        </div>
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Book Selection - NOW THIRD */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Livre <span className="text-red-400">*</span>
                        </label>
                        <Popover open={bookPopoverOpen} onOpenChange={setBookPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-between bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                                >
                                    {selectedBook ? (
                                        <span>{selectedBook.title} - {selectedBook.author}</span>
                                    ) : (
                                        <span className="text-gray-400">Sélectionner un livre...</span>
                                    )}
                                    <Search className="ml-2 h-4 w-4 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[500px] p-0 bg-gray-800 border-gray-700">
                                <div className="p-2">
                                    <Input
                                        placeholder="Rechercher un livre..."
                                        value={bookSearch}
                                        onChange={(e) => setBookSearch(e.target.value)}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                                <div
                                    className="max-h-[300px] overflow-y-auto"
                                    onWheel={(e) => e.stopPropagation()}
                                >
                                    {isSearchingBooks ? (
                                        <div className="p-4 text-center text-gray-400">Recherche...</div>
                                    ) : books.length > 0 ? (
                                        books.map((book) => (
                                            <div
                                                key={book.id}
                                                className="px-4 py-2 hover:bg-gray-700 cursor-pointer text-gray-200"
                                                onClick={() => handleBookSelect(book)}
                                            >
                                                <div className="font-medium">{book.title}</div>
                                                <div className="text-sm text-gray-400">{book.author}</div>
                                            </div>
                                        ))
                                    ) : bookSearch.length >= 2 ? (
                                        <div className="p-4 text-center text-gray-400">
                                            Aucun livre trouvé
                                        </div>
                                    ) : (
                                        <div className="p-4 text-center text-gray-400">
                                            Tapez au moins 2 caractères pour rechercher
                                        </div>
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
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
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                                <SelectValue placeholder="Sélectionner un statut" />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-700">
                                {statuses.map((status) => (
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
                                Supprimer l&apos;affectation
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
                                         }: {
    onSuccess?: (assignmentId: number) => void;
    onOrdersLoaded?: () => void;
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
                const errorMessage = data?.message || data?.error || 'Échec de la création de l\'affectation';

                toast({
                    variant: "destructive",
                    // @ts-expect-error jsx in toast
                    title: <span className="text-2xl font-bold">Erreur</span>,
                    description: <span className="text-xl mt-2">{errorMessage}</span>,
                    className: "bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6"
                });

                return Promise.reject();
            }

            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">L&apos;affectation a été créée avec succès</span>,
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
            submitButtonText="Créer l'affectation"
            loadingText="Création en cours..."
            title="Créer une nouvelle affectation"
            onSuccess={onSuccess}
            onOrdersLoaded={onOrdersLoaded}
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
                throw new Error('Échec de la suppression de l\'affectation');
            }

            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">L&apos;affectation a été supprimée avec succès</span>,
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
                const errorMessage = errorData?.message || 'Échec de la mise à jour de l\'affectation';

                toast({
                    variant: "destructive",
                    // @ts-expect-error jsx in toast
                    title: <span className="text-2xl font-bold">Erreur</span>,
                    description: <span className="text-xl mt-2">{errorMessage}</span>,
                    className: "bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6"
                });

                return Promise.reject();
            }

            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">L&apos;affectation a été mise à jour avec succès</span>,
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
            submitButtonText="Mettre à jour l'affectation"
            loadingText="Mise à jour en cours..."
            title="Modifier l'affectation"
            onSuccess={onSuccess}
            initialSelectedReader={initialSelectedReader}
            initialSelectedBook={initialSelectedBook}
            initialSelectedOrder={initialSelectedOrder}
            onReadersLoaded={onReadersLoaded}
            onOrdersLoaded={onOrdersLoaded}
        />
    );
}