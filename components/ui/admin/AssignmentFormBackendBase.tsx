import React, { useState, useEffect } from 'react';
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
import { AlertCircle, Calendar, Search } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface User {
    id: number;
    name: string | null;
    email: string;
}

interface Book {
    id: number;
    title: string;
    author: string;
}

interface Order {
    id: number;
    requestReceivedDate?: string;
    aveugle?: {
        name: string | null;
        email: string;
    };
    catalogue?: {
        title: string;
        author: string;
    };
    status?: {
        name: string;
    };
}

interface Status {
    id: number;
    name: string;
}

export interface AssignmentFormData {
    readerId: number | null;
    catalogueId: number | null;
    orderId: number | null;
    receptionDate: Date | null;
    sentToReaderDate: Date | null;
    returnedToECADate: Date | null;
    statusId: number | null;
    notes: string;
}

interface AssignmentFormBackendBaseProps {
    initialData?: AssignmentFormData;
    onSubmit: (formData: AssignmentFormData) => Promise<number>;
    submitButtonText: string;
    loadingText: string;
    title: string;
    onSuccess?: (assignmentId: number, isDeleted?: boolean) => void;
    onDelete?: () => Promise<void>;
    showDelete?: boolean;
    // Pre-fetched selections to avoid additional API calls
    initialSelectedReader?: User | null;
    initialSelectedBook?: Book | null;
    initialSelectedOrder?: Order | null;
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
                                              initialSelectedReader,
                                              initialSelectedBook,
                                              initialSelectedOrder,
                                          }: AssignmentFormBackendBaseProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form data state
    const [formData, setFormData] = useState<AssignmentFormData>(initialData || {
        readerId: null,
        catalogueId: null,
        orderId: null,
        receptionDate: null,
        sentToReaderDate: null,
        returnedToECADate: null,
        statusId: null,
        notes: '',
    });

    // Options data
    const [users, setUsers] = useState<User[]>([]);
    const [books, setBooks] = useState<Book[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [statuses, setStatuses] = useState<Status[]>([]);

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
    const [selectedReader, setSelectedReader] = useState<User | null>(initialSelectedReader || null);
    const [selectedBook, setSelectedBook] = useState<Book | null>(initialSelectedBook || null);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(initialSelectedOrder || null);

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

    // Load initial selections if editing (only if not pre-fetched)
    useEffect(() => {
        if (initialData) {
            // Fetch selected reader info only if not pre-fetched
            if (initialData.readerId && !initialSelectedReader) {
                fetch(`/api/user/${initialData.readerId}`)
                    .then(res => res.json())
                    .then(user => setSelectedReader(user))
                    .catch(err => console.error('Error fetching reader:', err));
            }
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
    }, [initialData, initialSelectedReader, initialSelectedBook, initialSelectedOrder]);

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
                    `/api/books?search=${encodeURIComponent(bookSearch)}&limit=20&page=1`
                );
                if (response.ok) {
                    const data = await response.json();
                    setBooks(data.books || []);
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
            if (orderSearch.length < 1) {
                return;
            }

            setIsSearchingOrders(true);
            try {
                const response = await fetch(
                    `/api/orders?search=${encodeURIComponent(orderSearch)}&limit=20&page=1`
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

    const handleReaderSelect = (user: User) => {
        setSelectedReader(user);
        setFormData({ ...formData, readerId: user.id });
        setUserPopoverOpen(false);
        setUserSearch('');
        setUsers([]);
    };

    const handleBookSelect = (book: Book) => {
        setSelectedBook(book);
        setFormData({ ...formData, catalogueId: book.id });
        setBookPopoverOpen(false);
        setBookSearch('');
        setBooks([]);
    };

    const handleOrderSelect = (order: Order) => {
        setSelectedOrder(order);
        setFormData({ ...formData, orderId: order.id });
        setOrderPopoverOpen(false);
        setOrderSearch('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const assignmentId = await onSubmit(formData);
            if (onSuccess) {
                onSuccess(assignmentId);
            }
        } catch (err) {
            console.error('Submit error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteClick = async () => {
        if (!onDelete) return;

        const confirmDelete = window.confirm(
            "Êtes-vous sûr de vouloir supprimer cette affectation ? Cette action est irréversible."
        );

        if (!confirmDelete) return;

        setIsLoading(true);
        setError(null);

        try {
            await onDelete();
        } catch (err) {
            console.error('Delete error:', err);
            toast({
                variant: "destructive",
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Erreur</span>,
                description: <span className="text-xl mt-2">Échec de la suppression de l&apos;affectation</span>,
                className: "bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6"
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="bg-gray-900 border-gray-700">
            <CardHeader>
                <CardTitle className="text-gray-100">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive" className="mb-4 bg-red-950 border-red-800">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-red-200">{error}</AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Reader Selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Lecteur <span className="text-red-500">*</span>
                        </label>
                        <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start bg-gray-800 border-gray-700 text-gray-200"
                                >
                                    <Search className="mr-2 h-4 w-4" />
                                    {selectedReader ? (
                                        <span>{selectedReader.name || selectedReader.email}</span>
                                    ) : (
                                        <span className="text-gray-400">Rechercher un lecteur...</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[400px] p-0 bg-gray-800 border-gray-700" align="start">
                                <div className="p-2">
                                    <Input
                                        placeholder="Rechercher par nom ou email..."
                                        value={userSearch}
                                        onChange={(e) => setUserSearch(e.target.value)}
                                        className="bg-gray-700 border-gray-600 text-gray-200"
                                        autoFocus
                                    />
                                </div>
                                {isSearchingUsers && (
                                    <div className="p-4 text-center text-gray-400">
                                        Recherche en cours...
                                    </div>
                                )}
                                {!isSearchingUsers && userSearch.length >= 2 && users.length === 0 && (
                                    <div className="p-4 text-center text-gray-400">
                                        Aucun utilisateur trouvé
                                    </div>
                                )}
                                {users.length > 0 && (
                                    <div className="max-h-[300px] overflow-y-auto">
                                        {users.map((user) => (
                                            <button
                                                key={user.id}
                                                type="button"
                                                onClick={() => handleReaderSelect(user)}
                                                className={`w-full p-3 text-left transition-colors hover:bg-gray-750 ${
                                                    selectedReader?.id === user.id
                                                        ? 'bg-blue-900/30 border-l-4 border-blue-500'
                                                        : ''
                                                }`}
                                            >
                                                <div className="font-medium text-gray-200">
                                                    {user.name || 'Sans nom'}
                                                </div>
                                                <div className="text-sm text-gray-400">{user.email}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </PopoverContent>
                        </Popover>

                        {selectedReader && (
                            <div className="text-sm text-green-400 flex items-center gap-2">
                                <span>✓</span>
                                <span>{selectedReader.name || selectedReader.email} sélectionné</span>
                            </div>
                        )}
                    </div>

                    {/* Book Selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Livre <span className="text-red-500">*</span>
                        </label>
                        <Popover open={bookPopoverOpen} onOpenChange={setBookPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start bg-gray-800 border-gray-700 text-gray-200"
                                >
                                    <Search className="mr-2 h-4 w-4" />
                                    {selectedBook ? (
                                        <span>{selectedBook.title}</span>
                                    ) : (
                                        <span className="text-gray-400">Rechercher un livre...</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[400px] p-0 bg-gray-800 border-gray-700" align="start">
                                <div className="p-2">
                                    <Input
                                        placeholder="Rechercher par titre ou auteur..."
                                        value={bookSearch}
                                        onChange={(e) => setBookSearch(e.target.value)}
                                        className="bg-gray-700 border-gray-600 text-gray-200"
                                        autoFocus
                                    />
                                </div>
                                {isSearchingBooks && (
                                    <div className="p-4 text-center text-gray-400">
                                        Recherche en cours...
                                    </div>
                                )}
                                {!isSearchingBooks && bookSearch.length >= 2 && books.length === 0 && (
                                    <div className="p-4 text-center text-gray-400">
                                        Aucun livre trouvé
                                    </div>
                                )}
                                {books.length > 0 && (
                                    <div className="max-h-[300px] overflow-y-auto">
                                        {books.map((book) => (
                                            <button
                                                key={book.id}
                                                type="button"
                                                onClick={() => handleBookSelect(book)}
                                                className={`w-full p-3 text-left transition-colors hover:bg-gray-750 ${
                                                    selectedBook?.id === book.id
                                                        ? 'bg-blue-900/30 border-l-4 border-blue-500'
                                                        : ''
                                                }`}
                                            >
                                                <div className="font-medium text-gray-200">{book.title}</div>
                                                <div className="text-sm text-gray-400">{book.author}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </PopoverContent>
                        </Popover>

                        {selectedBook && (
                            <div className="text-sm text-green-400 flex items-center gap-2">
                                <span>✓</span>
                                <span>{selectedBook.title} sélectionné</span>
                            </div>
                        )}
                    </div>

                    {/* Order Selection (Optional) */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Commande associée (optionnel)
                        </label>
                        <Popover open={orderPopoverOpen} onOpenChange={setOrderPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start bg-gray-800 border-gray-700 text-gray-200"
                                >
                                    <Search className="mr-2 h-4 w-4" />
                                    {selectedOrder ? (
                                        <span>Commande #{selectedOrder.id}</span>
                                    ) : (
                                        <span className="text-gray-400">Rechercher une commande...</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[400px] p-0 bg-gray-800 border-gray-700" align="start">
                                <div className="p-2">
                                    <Input
                                        placeholder="Rechercher par ID ou utilisateur..."
                                        value={orderSearch}
                                        onChange={(e) => setOrderSearch(e.target.value)}
                                        className="bg-gray-700 border-gray-600 text-gray-200"
                                        autoFocus
                                    />
                                </div>
                                {isSearchingOrders && (
                                    <div className="p-4 text-center text-gray-400">
                                        Recherche en cours...
                                    </div>
                                )}
                                {orders.length > 0 && (
                                    <div className="max-h-[300px] overflow-y-auto">
                                        {orders.map((order) => (
                                            <button
                                                key={order.id}
                                                type="button"
                                                onClick={() => handleOrderSelect(order)}
                                                className={`w-full p-3 text-left transition-colors hover:bg-gray-750 ${
                                                    selectedOrder?.id === order.id
                                                        ? 'bg-blue-900/30 border-l-4 border-blue-500'
                                                        : ''
                                                }`}
                                            >
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-medium text-gray-200">
                                                            Commande #{order.id}
                                                        </span>
                                                        {order.status && (
                                                            <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                                                                {order.status.name}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {order.aveugle && (
                                                        <div className="text-sm text-gray-400 flex items-center gap-1">
                                                            <span>👤</span>
                                                            <span>{order.aveugle.name || order.aveugle.email}</span>
                                                        </div>
                                                    )}

                                                    {order.catalogue && (
                                                        <div className="text-sm text-gray-400 flex items-center gap-1">
                                                            <span>📚</span>
                                                            <span>{order.catalogue.title}</span>
                                                        </div>
                                                    )}

                                                    {order.requestReceivedDate && (
                                                        <div className="text-xs text-gray-500">
                                                            {format(new Date(order.requestReceivedDate), 'PPP', { locale: fr })}
                                                        </div>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </PopoverContent>
                        </Popover>

                        {selectedOrder && (
                            <div className="text-sm text-green-400 flex items-center gap-2">
                                <span>✓</span>
                                <span>Commande #{selectedOrder.id} sélectionnée</span>
                            </div>
                        )}
                    </div>

                    {/* Reception Date */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Date de réception
                        </label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start text-left bg-gray-800 border-gray-700 text-gray-200"
                                >
                                    <Calendar className="mr-2 h-4 w-4" />
                                    {formData.receptionDate ? format(formData.receptionDate, 'PPP', { locale: fr }) : <span>Sélectionner une date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-gray-800 border-gray-700" align="start">
                                <CalendarComponent
                                    mode="single"
                                    selected={formData.receptionDate || undefined}
                                    onSelect={(date) => setFormData({ ...formData, receptionDate: date || null })}
                                    initialFocus
                                    className="bg-gray-800 text-gray-200"
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Sent to Reader Date */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Date d&apos;envoi au lecteur
                        </label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start text-left bg-gray-800 border-gray-700 text-gray-200"
                                >
                                    <Calendar className="mr-2 h-4 w-4" />
                                    {formData.sentToReaderDate ? format(formData.sentToReaderDate, 'PPP', { locale: fr }) : <span>Sélectionner une date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-gray-800 border-gray-700" align="start">
                                <CalendarComponent
                                    mode="single"
                                    selected={formData.sentToReaderDate || undefined}
                                    onSelect={(date) => setFormData({ ...formData, sentToReaderDate: date || null })}
                                    initialFocus
                                    className="bg-gray-800 text-gray-200"
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Returned to ECA Date */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Date de retour aux ECA
                        </label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start text-left bg-gray-800 border-gray-700 text-gray-200"
                                >
                                    <Calendar className="mr-2 h-4 w-4" />
                                    {formData.returnedToECADate ? format(formData.returnedToECADate, 'PPP', { locale: fr }) : <span>Sélectionner une date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-gray-800 border-gray-700" align="start">
                                <CalendarComponent
                                    mode="single"
                                    selected={formData.returnedToECADate || undefined}
                                    onSelect={(date) => setFormData({ ...formData, returnedToECADate: date || null })}
                                    initialFocus
                                    className="bg-gray-800 text-gray-200"
                                />
                            </PopoverContent>
                        </Popover>
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

    const handleSubmit = async (formData: AssignmentFormData): Promise<number> => {
        try {
            const response = await fetch('/api/assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (!response.ok) {
                const errorMessage = data?.message || 'Échec de la création de l\'affectation';

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
    initialSelectedReader?: User | null;
    initialSelectedBook?: Book | null;
    initialSelectedOrder?: Order | null;
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
            const response = await fetch(`/api/assignments/${assignmentId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
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