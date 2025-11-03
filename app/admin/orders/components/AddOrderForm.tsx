"use client";

import React, { useState, useEffect } from 'react';
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
import { AlertCircle, Calendar } from 'lucide-react';
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

interface Status {
    id: number;
    name: string;
}

interface MediaFormat {
    id: number;
    name: string;
}

interface OrderFormData {
    aveugleId: number | null;
    catalogueId: number | null;
    requestReceivedDate: Date;
    statusId: number | null;
    isDuplication: boolean;
    mediaFormatId: number | null;
    deliveryMethod: 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE' | null;
    createdDate: Date | null;
    closureDate: Date | null;
    cost: string;
    billingStatus: 'UNBILLED' | 'BILLED' | 'PAID';
    lentPhysicalBook: boolean;
    notes: string;
}


interface AddOrderFormProps {
    onSuccess?: () => void;
}

export function AddOrderForm({ onSuccess }: AddOrderFormProps) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [detailedError, setDetailedError] = useState<string | null>(null);

    // Form data state
    const [formData, setFormData] = useState<OrderFormData>({
        aveugleId: null,
        catalogueId: null,
        requestReceivedDate: new Date(),
        statusId: null,
        isDuplication: false,
        mediaFormatId: null,
        deliveryMethod: null,
        createdDate: new Date(),
        closureDate: null,
        cost: '3.00',
        billingStatus: 'UNBILLED',
        lentPhysicalBook: false,
        notes: '',
    });

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

    // Popover open states for clean UX
    const [userPopoverOpen, setUserPopoverOpen] = useState(false);
    const [bookPopoverOpen, setBookPopoverOpen] = useState(false);

    // Selected display values
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [selectedBook, setSelectedBook] = useState<Book | null>(null);

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
                // Use existing books API with search parameter
                const response = await fetch(
                    `/api/books?search=${encodeURIComponent(bookSearch)}&limit=20&page=1`
                );
                if (response.ok) {
                    const data = await response.json();
                    // Extract books array from the response
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setDetailedError(null);

        // Validation
        if (!formData.aveugleId) {
            setError('Veuillez sélectionner un client');
            setIsLoading(false);
            return;
        }
        if (!formData.catalogueId) {
            setError('Veuillez sélectionner un livre');
            setIsLoading(false);
            return;
        }
        if (!formData.statusId) {
            setError('Veuillez sélectionner un statut');
            setIsLoading(false);
            return;
        }
        if (!formData.mediaFormatId) {
            setError('Veuillez sélectionner un format média');
            setIsLoading(false);
            return;
        }
        if (!formData.deliveryMethod) {
            setError('Veuillez sélectionner une méthode de livraison');
            setIsLoading(false);
            return;
        }

        try {
            // Prepare the data with proper formatting
            const submitData = {
                aveugleId: formData.aveugleId,
                catalogueId: formData.catalogueId,
                requestReceivedDate: formData.requestReceivedDate.toISOString(),
                statusId: formData.statusId,
                isDuplication: formData.isDuplication,
                mediaFormatId: formData.mediaFormatId,
                deliveryMethod: formData.deliveryMethod,
                createdDate: formData.createdDate ? formData.createdDate.toISOString() : new Date().toISOString(),
                closureDate: formData.closureDate ? formData.closureDate.toISOString() : null,
                cost: formData.cost && formData.cost !== '' ? parseFloat(formData.cost) : null,
                billingStatus: formData.billingStatus,
                lentPhysicalBook: formData.lentPhysicalBook,
                notes: formData.notes || null,
            };

            console.log('Submitting order data:', submitData);

            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(submitData),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('API Error Response:', data);

                // Build a detailed error message
                let errorMessage = data.message || 'Échec de la création de la commande';

                if (data.field) {
                    errorMessage += ` (Champ: ${data.field})`;
                }

                if (data.details) {
                    setDetailedError(typeof data.details === 'string'
                        ? data.details
                        : JSON.stringify(data.details, null, 2)
                    );
                }

                if (data.code) {
                    errorMessage += ` [Code: ${data.code}]`;
                }

                throw new Error(errorMessage);
            }

            toast({
                // @ts-expect-error jsx in title
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">La commande a été créée avec succès</span>,
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
            });

            // Reset form
            setFormData({
                aveugleId: null,
                catalogueId: null,
                requestReceivedDate: new Date(),
                statusId: null,
                isDuplication: false,
                mediaFormatId: null,
                deliveryMethod: null,
                createdDate: new Date(),
                closureDate: null,
                cost: '3.00',
                billingStatus: 'UNBILLED',
                lentPhysicalBook: false,
                notes: '',
            });
            setSelectedUser(null);
            setSelectedBook(null);
            setUserSearch('');
            setBookSearch('');

            if (onSuccess) {
                onSuccess();
            }
        } catch (err) {
            console.error('Error creating order:', err);
            setError(err instanceof Error ? err.message : 'Une erreur est survenue lors de la création de la commande');

            toast({
                // @ts-expect-error jsx in title
                title: <span className="text-2xl font-bold">Erreur</span>,
                description: <span className="text-xl mt-2">{err instanceof Error ? err.message : 'Une erreur est survenue'}</span>,
                className: "bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
                <CardTitle className="text-2xl text-gray-100">Créer une nouvelle commande</CardTitle>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive" className="mb-6 bg-red-900/50 border-red-500 text-red-100">
                        <AlertCircle className="h-5 w-5" />
                        <AlertDescription className="text-base">
                            <div className="font-semibold mb-1">{error}</div>
                            {detailedError && (
                                <details className="mt-2 text-sm">
                                    <summary className="cursor-pointer hover:underline">Détails techniques</summary>
                                    <pre className="mt-2 p-2 bg-black/30 rounded overflow-x-auto text-xs">
                                        {detailedError}
                                    </pre>
                                </details>
                            )}
                        </AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Client (Aveugle) Search */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Client <span className="text-red-500">*</span>
                        </label>
                        <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                                >
                                    {selectedUser ? (
                                        <div className="flex flex-col items-start overflow-hidden">
                                            <span className="font-medium truncate max-w-full">{selectedUser.name || selectedUser.email}</span>
                                            {selectedUser.name && (
                                                <span className="text-xs text-gray-400 truncate max-w-full">{selectedUser.email}</span>
                                            )}
                                        </div>
                                    ) : (
                                        "Rechercher un client..."
                                    )}
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
                                <div className="max-h-[300px] overflow-y-auto">
                                    {isSearchingUsers ? (
                                        <div className="p-4 text-center text-gray-400">Recherche en cours...</div>
                                    ) : userSearch.length < 2 ? (
                                        <div className="p-4 text-center text-gray-400">Tapez au moins 2 caractères</div>
                                    ) : users.length === 0 ? (
                                        <div className="p-4 text-center text-gray-400">Aucun client trouvé</div>
                                    ) : (
                                        users.map((user) => (
                                            <Button
                                                key={user.id}
                                                onClick={() => {
                                                    setFormData({ ...formData, aveugleId: user.id });
                                                    setSelectedUser(user);
                                                    setUserPopoverOpen(false);
                                                    setUserSearch('');
                                                }}
                                                variant="ghost"
                                                className="w-full justify-start text-left hover:bg-gray-700 p-3"
                                            >
                                                <div className="flex flex-col overflow-hidden w-full">
                                                    <div className="font-medium text-gray-200 truncate">{user.name || 'Sans nom'}</div>
                                                    <div className="text-sm text-gray-400 truncate">{user.email}</div>
                                                </div>
                                            </Button>
                                        ))
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Book (Catalogue) Search */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Livre <span className="text-red-500">*</span>
                        </label>
                        <Popover open={bookPopoverOpen} onOpenChange={setBookPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                                >
                                    {selectedBook ? (
                                        <div className="flex flex-col items-start overflow-hidden">
                                            <span className="font-medium truncate max-w-full">{selectedBook.title}</span>
                                            <span className="text-xs text-gray-400 truncate max-w-full">{selectedBook.author}</span>
                                        </div>
                                    ) : (
                                        "Rechercher un livre..."
                                    )}
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
                                <div className="max-h-[300px] overflow-y-auto">
                                    {isSearchingBooks ? (
                                        <div className="p-4 text-center text-gray-400">Recherche en cours...</div>
                                    ) : bookSearch.length < 2 ? (
                                        <div className="p-4 text-center text-gray-400">Tapez au moins 2 caractères</div>
                                    ) : books.length === 0 ? (
                                        <div className="p-4 text-center text-gray-400">Aucun livre trouvé</div>
                                    ) : (
                                        books.map((book) => (
                                            <Button
                                                key={book.id}
                                                onClick={() => {
                                                    setFormData({ ...formData, catalogueId: book.id });
                                                    setSelectedBook(book);
                                                    setBookPopoverOpen(false);
                                                    setBookSearch('');
                                                }}
                                                variant="ghost"
                                                className="w-full justify-start text-left hover:bg-gray-700 p-3"
                                            >
                                                <div className="flex flex-col overflow-hidden w-full">
                                                    <div className="font-medium text-gray-200 truncate">{book.title}</div>
                                                    <div className="text-sm text-gray-400 truncate">{book.author}</div>
                                                </div>
                                            </Button>
                                        ))
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Request Received Date */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Date de réception de la demande <span className="text-red-500">*</span>
                        </label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-full justify-start text-left bg-gray-800 border-gray-700 text-gray-200"
                                >
                                    <Calendar className="mr-2 h-4 w-4" />
                                    {formData.requestReceivedDate ? format(formData.requestReceivedDate, 'PPP', { locale: fr }) : <span>Sélectionner une date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-gray-800 border-gray-700" align="start">
                                <CalendarComponent
                                    mode="single"
                                    selected={formData.requestReceivedDate}
                                    onSelect={(date) => setFormData({ ...formData, requestReceivedDate: date || new Date() })}
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

                    {/* Media Format */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Format média <span className="text-red-500">*</span>
                        </label>
                        <Select value={formData.mediaFormatId?.toString() || ''} onValueChange={(value) => setFormData({ ...formData, mediaFormatId: parseInt(value) })}>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                                <SelectValue placeholder="Sélectionner un format" />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-700">
                                {mediaFormats.map((format) => (
                                    <SelectItem key={format.id} value={format.id.toString()} className="text-gray-200">
                                        {format.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Delivery Method */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Méthode de livraison <span className="text-red-500">*</span>
                        </label>
                        <Select value={formData.deliveryMethod || ''} onValueChange={(value) => setFormData({ ...formData, deliveryMethod: value as 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE'})}>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200">
                                <SelectValue placeholder="Sélectionner une méthode" />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-700">
                                <SelectItem value="RETRAIT" className="text-gray-200">Retrait</SelectItem>
                                <SelectItem value="ENVOI" className="text-gray-200">Envoie</SelectItem>
                                <SelectItem value="NON_APPLICABLE" className="text-gray-200">Non applicable</SelectItem>
                            </SelectContent>
                        </Select>

                    </div>

                    {/* Billing Status - Fixed as UNBILLED for new orders */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">État de facturation</label>
                        <Select value={formData.billingStatus} onValueChange={(value) => setFormData({ ...formData, billingStatus: value as 'UNBILLED' | 'BILLED' | 'PAID' })} disabled>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200 opacity-60 cursor-not-allowed">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-700">
                                <SelectItem value="UNBILLED" className="text-gray-200">Non facturé</SelectItem>
                                <SelectItem value="BILLED" className="text-gray-200">Facturé</SelectItem>
                                <SelectItem value="PAID" className="text-gray-200">Payé</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Cost */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">Coût (€)</label>
                        <Input
                            type="number"
                            step="0.01"
                            value={formData.cost}
                            onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                            className="bg-gray-800 border-gray-700 text-gray-200"
                            placeholder="0.00"
                        />
                    </div>

                    {/* Critical Selection Fields */}
                    <div className="grid grid-cols-2 gap-4 p-4 bg-gray-800/80 rounded-lg border border-gray-600 shadow-md">
                        <div className="flex items-center space-x-3 p-3 bg-gray-900/50 rounded-md hover:bg-gray-900/70 transition-colors border border-gray-700/50">
                            <Checkbox
                                id="isDuplication"
                                checked={formData.isDuplication}
                                onCheckedChange={(checked) => setFormData({ ...formData, isDuplication: !!checked })}
                                className="border-2 border-gray-500 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 w-6 h-6"
                            />
                            <label htmlFor="isDuplication" className="text-base font-bold text-gray-100 cursor-pointer leading-tight">
                                Est une duplication <span className="text-red-400">*</span>
                            </label>
                        </div>

                        <div className="flex items-center space-x-3 p-3 bg-gray-900/50 rounded-md hover:bg-gray-900/70 transition-colors border border-gray-700/50">
                            <Checkbox
                                id="lentPhysicalBook"
                                checked={formData.lentPhysicalBook}
                                onCheckedChange={(checked) => setFormData({ ...formData, lentPhysicalBook: !!checked })}
                                className="border-2 border-gray-500 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 w-6 h-6"
                            />
                            <label htmlFor="lentPhysicalBook" className="text-base font-bold text-gray-100 cursor-pointer leading-tight">
                                Livre physique prêté <span className="text-red-400">*</span>
                            </label>
                        </div>
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
                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {isLoading ? 'Création en cours...' : 'Créer la commande'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}