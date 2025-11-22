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
import { AlertCircle, Calendar, Search, History, User as UserIcon } from 'lucide-react';
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
    const [showHistory, setShowHistory] = useState(false);

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
            }
        };

        fetchInitialData();
    }, []);

    const fetchReaderHistory = useCallback(async () => {
        if (!assignmentId) return;

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
        }
    }, [assignmentId]); // Dependencies of the function itself

    useEffect(() => {
        fetchReaderHistory();
    }, [fetchReaderHistory]); // Now safe to include

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
                    `/api/books/search?q=${encodeURIComponent(bookSearch)}`
                );
                if (response.ok) {
                    const data = await response.json();
                    setBooks(data);
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

    const handleOrderSelect = (order: OrderSummary) => {
        setSelectedOrder(order);
        setFormData({ ...formData, orderId: order.id });
        setOrderPopoverOpen(false);
        setOrderSearch('');
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

                        {/* Edit mode: Show current reader + reassignment */}
                        {assignmentId ? (
                            <div className="space-y-3">
                                {/* Current reader display */}
                                {currentReader && (
                                    <div className="p-3 bg-blue-900/20 border border-blue-800 rounded-md">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="font-medium text-gray-200">
                                                    Lecteur actuel
                                                </div>
                                                <div className="text-lg text-blue-200">
                                                    {getReaderDisplayName(currentReader)}
                                                </div>
                                                {currentReader.email && (
                                                    <div className="text-sm text-gray-400">{currentReader.email}</div>
                                                )}
                                            </div>
                                            {readerHistory.length > 0 && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setShowHistory(!showHistory)}
                                                    className="bg-gray-700 hover:bg-gray-600 text-gray-100 border-gray-600"
                                                >
                                                    <History className="mr-2 h-4 w-4" />
                                                    Historique ({readerHistory.length})
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Reader history display */}
                                {showHistory && readerHistory.length > 0 && (
                                    <div className="p-4 bg-gray-800 border border-gray-700 rounded-md">
                                        <h4 className="font-medium text-gray-200 mb-3">Historique des lecteurs</h4>
                                        <div className="space-y-2">
                                            {readerHistory.map((history, index) => (
                                                <div
                                                    key={history.id}
                                                    className={`p-3 rounded ${
                                                        index === 0
                                                            ? 'bg-blue-900/20 border border-blue-800'
                                                            : 'bg-gray-900'
                                                    }`}
                                                >
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <div className="font-medium text-gray-200">
                                                                {getReaderDisplayName(history.reader)}
                                                                {index === 0 && (
                                                                    <span className="ml-2 text-xs bg-blue-700 text-blue-100 px-2 py-1 rounded">
                                                                        Actuel
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {history.reader.email && (
                                                                <div className="text-sm text-gray-400">{history.reader.email}</div>
                                                            )}
                                                            {history.notes && (
                                                                <div className="text-sm text-gray-400 mt-1 italic">
                                                                    {history.notes}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="text-sm text-gray-400">
                                                            {format(new Date(history.assignedDate), 'PPP', { locale: fr })}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Reassignment section */}
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
                                                <div className="max-h-[300px] overflow-y-auto">
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
                                    <div className="max-h-[300px] overflow-y-auto">
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

                    {/* Book Selection */}
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
                                <div className="max-h-[300px] overflow-y-auto">
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

                    {/* Order Selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">Commande (optionnel)</label>
                        <Popover open={orderPopoverOpen} onOpenChange={setOrderPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-between bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                                >
                                    {selectedOrder ? (
                                        <span>Commande #{selectedOrder.id}</span>
                                    ) : (
                                        <span className="text-gray-400">Sélectionner une commande...</span>
                                    )}
                                    <Search className="ml-2 h-4 w-4 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[400px] p-0 bg-gray-800 border-gray-700">
                                <div className="p-2">
                                    <Input
                                        placeholder="Rechercher une commande..."
                                        value={orderSearch}
                                        onChange={(e) => setOrderSearch(e.target.value)}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                                <div className="max-h-[300px] overflow-y-auto">
                                    {isSearchingOrders ? (
                                        <div className="p-4 text-center text-gray-400">Recherche...</div>
                                    ) : orders.length > 0 ? (
                                        orders.map((order) => (
                                            <div
                                                key={order.id}
                                                className="px-4 py-2 hover:bg-gray-700 cursor-pointer text-gray-200"
                                                onClick={() => handleOrderSelect(order)}
                                            >
                                                <div className="font-medium">Commande #{order.id}</div>
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
        </Card>
    );
}

// Add Assignment Form using the base
export function AddAssignmentFormBackend({ onSuccess }: { onSuccess?: (assignmentId: number) => void }) {
    const { toast } = useToast();

    const handleSubmit = async (formData: AssignmentFormData, readerId?: number | null): Promise<number> => {
        try {
            const response = await fetch('/api/assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    readerId, // Include readerId for create
                }),
            });

            const data = await response.json();

            if (!response.ok) {
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
                                          }: {
    assignmentId: string;
    initialData: AssignmentFormData;
    onSuccess?: (assignmentId: number, isDeleted?: boolean) => void;
    initialSelectedReader?: ReaderSummary | null;
    initialSelectedBook?: BookSummary | null;
    initialSelectedOrder?: OrderSummary | null;
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
        />
    );
}