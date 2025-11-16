"use client";

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
    mediaFormat?: {
        name: string;
    };
}

interface Status {
    id: number;
    name: string;
}

interface AssignmentFormData {
    readerId: number | null;
    catalogueId: number | null;
    orderId: number | null;
    receptionDate: Date | null;
    sentToReaderDate: Date | null;
    returnedToECADate: Date | null;
    statusId: number | null;
    notes: string;
}

interface AddAssignmentFormProps {
    onSuccess?: () => void;
}

export function AddAssignmentForm({ onSuccess }: AddAssignmentFormProps) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [detailedError, setDetailedError] = useState<string | null>(null);

    const [formData, setFormData] = useState<AssignmentFormData>({
        readerId: null,
        catalogueId: null,
        orderId: null,
        receptionDate: null,
        sentToReaderDate: null,
        returnedToECADate: null,
        statusId: null,
        notes: '',
    });

    const [users, setUsers] = useState<User[]>([]);
    const [books, setBooks] = useState<Book[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [statuses, setStatuses] = useState<Status[]>([]);

    const [userSearch, setUserSearch] = useState('');
    const [bookSearch, setBookSearch] = useState('');
    const [orderSearch, setOrderSearch] = useState('');
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [isSearchingBooks, setIsSearchingBooks] = useState(false);
    const [isSearchingOrders, setIsSearchingOrders] = useState(false);

    const [userPopoverOpen, setUserPopoverOpen] = useState(false);
    const [bookPopoverOpen, setBookPopoverOpen] = useState(false);

    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [selectedBook, setSelectedBook] = useState<Book | null>(null);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [statusesRes, ordersRes] = await Promise.all([
                    fetch('/api/statuses'),
                    fetch('/api/orders?page=1')
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

    useEffect(() => {
        const searchOrders = async () => {
            if (orderSearch.length === 0) {
                // Fetch recent orders when search is cleared
                try {
                    const response = await fetch('/api/orders?page=1');
                    if (response.ok) {
                        const data = await response.json();
                        setOrders(data.orders || []);
                    }
                } catch (err) {
                    console.error('Error fetching recent orders:', err);
                }
                return;
            }

            setIsSearchingOrders(true);
            try {
                const searchParam = !isNaN(Number(orderSearch))
                    ? `search=${orderSearch}`
                    : `search=${encodeURIComponent(orderSearch)}`;

                const response = await fetch(`/api/orders?${searchParam}&page=1`);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setDetailedError(null);

        if (!formData.readerId || !formData.catalogueId || !formData.statusId) {
            setError('Veuillez remplir tous les champs requis');
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch('/api/assignments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...formData,
                    receptionDate: formData.receptionDate?.toISOString(),
                    sentToReaderDate: formData.sentToReaderDate?.toISOString(),
                    returnedToECADate: formData.returnedToECADate?.toISOString(),
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Échec de la création de l\'affectation');
                setDetailedError(data.details || null);
                toast({
                    title: "Erreur",
                    description: data.error || 'Échec de la création de l\'affectation',
                    variant: "destructive",
                });
                return;
            }

            toast({
                title: "Succès",
                description: "Affectation créée avec succès",
            });

            setFormData({
                readerId: null,
                catalogueId: null,
                orderId: null,
                receptionDate: null,
                sentToReaderDate: null,
                returnedToECADate: null,
                statusId: null,
                notes: '',
            });

            setSelectedUser(null);
            setSelectedBook(null);
            setSelectedOrder(null);
            setUserSearch('');
            setBookSearch('');
            setOrderSearch('');

            if (onSuccess) {
                onSuccess();
            }
        } catch (err) {
            console.error('Error creating assignment:', err);
            setError('Erreur lors de la création de l\'affectation');
            toast({
                title: "Erreur",
                description: "Erreur lors de la création de l'affectation",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleOrderSelect = (order: Order) => {
        setSelectedOrder(order);
        setFormData({ ...formData, orderId: order.id });
    };

    return (
        <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
                <CardTitle className="text-xl font-semibold text-gray-100">
                    Nouvelle affectation
                </CardTitle>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive" className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                            {error}
                            {detailedError && (
                                <div className="mt-2 text-sm">
                                    Détails : {detailedError}
                                </div>
                            )}
                        </AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Lecteur <span className="text-red-500">*</span>
                        </label>
                        <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start text-left bg-gray-800 border-gray-700 text-gray-200"
                                >
                                    {selectedUser ? (
                                        <span>{selectedUser.name || selectedUser.email}</span>
                                    ) : (
                                        <span className="text-gray-400">Rechercher un lecteur...</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="p-0 bg-gray-800 border-gray-700 w-[var(--radix-popover-trigger-width)] max-w-[95vw]"
                                align="start"
                            >
                                <div className="p-2">
                                    <Input
                                        placeholder="Rechercher par nom ou email..."
                                        value={userSearch}
                                        onChange={(e) => setUserSearch(e.target.value)}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                                <div
                                    className="max-h-60 overflow-auto p-2"
                                    onWheel={(e) => e.stopPropagation()}
                                >
                                    {isSearchingUsers ? (
                                        <div className="text-center py-2 text-gray-400">Recherche...</div>
                                    ) : users.length === 0 ? (
                                        <div className="text-center py-2 text-gray-400">
                                            {userSearch.length < 2 ? 'Tapez au moins 2 caractères' : 'Aucun lecteur trouvé'}
                                        </div>
                                    ) : (
                                        users.map((user) => (
                                            <Button
                                                key={user.id}
                                                variant="ghost"
                                                className="w-full justify-start text-gray-200 hover:bg-gray-700"
                                                onClick={() => {
                                                    setSelectedUser(user);
                                                    setFormData({ ...formData, readerId: user.id });
                                                    setUserPopoverOpen(false);
                                                }}
                                            >
                                                <div className="text-left">
                                                    <div>{user.name || 'Sans nom'}</div>
                                                    <div className="text-xs text-gray-400">{user.email}</div>
                                                </div>
                                            </Button>
                                        ))
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Livre <span className="text-red-500">*</span>
                        </label>
                        <Popover open={bookPopoverOpen} onOpenChange={setBookPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start text-left bg-gray-800 border-gray-700 text-gray-200"
                                >
                                    {selectedBook ? (
                                        <span>{selectedBook.title} - {selectedBook.author}</span>
                                    ) : (
                                        <span className="text-gray-400">Rechercher un livre...</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="p-0 bg-gray-800 border-gray-700 w-[var(--radix-popover-trigger-width)] max-w-[95vw]"
                                align="start"
                            >
                                <div className="p-2">
                                    <Input
                                        placeholder="Rechercher par titre ou auteur..."
                                        value={bookSearch}
                                        onChange={(e) => setBookSearch(e.target.value)}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                    />
                                </div>
                                <div
                                    className="max-h-60 overflow-auto p-2"
                                    onWheel={(e) => e.stopPropagation()}
                                >
                                    {isSearchingBooks ? (
                                        <div className="text-center py-2 text-gray-400">Recherche...</div>
                                    ) : books.length === 0 ? (
                                        <div className="text-center py-2 text-gray-400">
                                            {bookSearch.length < 2 ? 'Tapez au moins 2 caractères' : 'Aucun livre trouvé'}
                                        </div>
                                    ) : (
                                        books.map((book) => (
                                            <Button
                                                key={book.id}
                                                variant="ghost"
                                                className="w-full justify-start text-gray-200 hover:bg-gray-700"
                                                onClick={() => {
                                                    setSelectedBook(book);
                                                    setFormData({ ...formData, catalogueId: book.id });
                                                    setBookPopoverOpen(false);
                                                }}
                                            >
                                                <div className="text-left">
                                                    <div>{book.title}</div>
                                                    <div className="text-xs text-gray-400">{book.author}</div>
                                                </div>
                                            </Button>
                                        ))
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Embedded Orders Section */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Commande associée
                        </label>

                        <div className="border border-gray-700 rounded-lg bg-gray-800 overflow-hidden">
                            {/* Search Bar */}
                            <div className="p-3 border-b border-gray-700 bg-gray-850">
                                <div className="relative">
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                    <Input
                                        placeholder="Rechercher par ID, utilisateur, ou livre..."
                                        value={orderSearch}
                                        onChange={(e) => setOrderSearch(e.target.value)}
                                        className="bg-gray-900 border-gray-700 text-gray-200 pl-9"
                                    />
                                </div>
                            </div>

                            {/* Orders List */}
                            <div className="max-h-96 overflow-auto">
                                {orderSearch.length === 0 && (
                                    <div className="px-3 py-2 text-xs font-medium text-gray-400 bg-gray-900/50 border-b border-gray-700">
                                        Commandes récentes
                                    </div>
                                )}

                                {isSearchingOrders ? (
                                    <div className="text-center py-8 text-gray-400">
                                        Chargement...
                                    </div>
                                ) : orders.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400">
                                        {orderSearch.length > 0 ? 'Aucune commande trouvée' : 'Aucune commande récente'}
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-700">
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
                            </div>
                        </div>

                        {selectedOrder && (
                            <div className="text-sm text-green-400 flex items-center gap-2">
                                <span>✓</span>
                                <span>Commande #{selectedOrder.id} sélectionnée</span>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Date de réception
                        </label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
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

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Date d&apos;envoi au lecteur
                        </label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
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

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Date de retour aux ECA
                        </label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
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

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Statut <span className="text-red-500">*</span>
                        </label>
                        <Select value={formData.statusId?.toString() || ''} onValueChange={(value) => setFormData({ ...formData, statusId: parseInt(value) })}>
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

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">Notes</label>
                        <Textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            className="bg-gray-800 border-gray-700 text-gray-200 min-h-[100px]"
                            placeholder="Ajouter des notes supplémentaires..."
                        />
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {isLoading ? 'Création en cours...' : 'Créer l\'affectation'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}