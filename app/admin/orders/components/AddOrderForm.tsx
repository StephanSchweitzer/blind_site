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
                const response = await fetch(`/api/catalogue/search?q=${encodeURIComponent(bookSearch)}`);
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

    // Handle user selection
    const handleUserSelect = (user: User) => {
        setSelectedUser(user);
        setFormData({ ...formData, aveugleId: user.id });
        setUserPopoverOpen(false);
        setUserSearch('');
    };

    // Handle book selection
    const handleBookSelect = (book: Book) => {
        setSelectedBook(book);
        setFormData({ ...formData, catalogueId: book.id });
        setBookPopoverOpen(false);
        setBookSearch('');
    };

    // Helper function to find status by name
    const findStatusByName = (name: string): number | null => {
        const status = statuses.find(s => s.name.toLowerCase() === name.toLowerCase());
        return status ? status.id : null;
    };

    // Handle duplication checkbox - mutually exclusive with recording
    const handleDuplicationChange = (checked: boolean) => {
        if (checked) {
            const enCoursStatusId = findStatusByName('en cours');
            setFormData({
                ...formData,
                isDuplication: true,
                lentPhysicalBook: false,
                statusId: enCoursStatusId
            });
        } else {
            setFormData({
                ...formData,
                isDuplication: false,
                statusId: null
            });
        }
    };

    // Handle recording checkbox - mutually exclusive with duplication
    const handleRecordingChange = (checked: boolean) => {
        if (checked) {
            const attenteEnvoiStatusId = findStatusByName("Attente envoi vers lecteur");
            setFormData({
                ...formData,
                lentPhysicalBook: true,
                isDuplication: false,
                statusId: attenteEnvoiStatusId
            });
        } else {
            setFormData({
                ...formData,
                lentPhysicalBook: false,
                statusId: null
            });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setDetailedError(null);

        // Validation
        if (!formData.aveugleId) {
            setError('Veuillez sélectionner un aveugle');
            return;
        }
        if (!formData.catalogueId) {
            setError('Veuillez sélectionner un livre');
            return;
        }
        if (!formData.statusId) {
            setError('Veuillez sélectionner un statut ou cocher un type de demande');
            return;
        }
        if (!formData.mediaFormatId) {
            setError('Veuillez sélectionner un format média');
            return;
        }
        if (!formData.deliveryMethod) {
            setError('Veuillez sélectionner une méthode de livraison');
            return;
        }
        if (!formData.isDuplication && !formData.lentPhysicalBook) {
            setError('Veuillez sélectionner un type de demande (duplication ou enregistrement)');
            return;
        }

        setIsLoading(true);

        try {
            const payload = {
                aveugleId: formData.aveugleId,
                catalogueId: formData.catalogueId,
                requestReceivedDate: formData.requestReceivedDate.toISOString(),
                statusId: formData.statusId,
                isDuplication: formData.isDuplication,
                mediaFormatId: formData.mediaFormatId,
                deliveryMethod: formData.deliveryMethod,
                createdDate: formData.createdDate?.toISOString() || new Date().toISOString(),
                closureDate: formData.closureDate?.toISOString() || null,
                cost: parseFloat(formData.cost),
                billingStatus: formData.billingStatus,
                lentPhysicalBook: formData.lentPhysicalBook,
                notes: formData.notes,
            };

            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Échec de la création de la demande');
                if (data.details) {
                    setDetailedError(JSON.stringify(data.details, null, 2));
                }
                return;
            }

            toast({
                title: "Succès",
                description: "La demande a été créée avec succès",
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

            if (onSuccess) {
                onSuccess();
            }
        } catch (err) {
            console.error('Error creating order:', err);
            setError('Une erreur est survenue lors de la création de la demande');
            setDetailedError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-4xl mx-auto bg-gray-900 border-gray-800 text-gray-100">
            <CardHeader className="border-b border-gray-800">
                <CardTitle className="text-2xl text-gray-100">Créer une nouvelle demande</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
                {error && (
                    <Alert variant="destructive" className="mb-4 bg-red-900/20 border-red-900/50">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                            {error}
                            {detailedError && (
                                <pre className="mt-2 text-xs overflow-auto">{detailedError}</pre>
                            )}
                        </AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* User (Aveugle) Selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Utilisateur <span className="text-red-500">*</span>
                        </label>
                        <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-full justify-start bg-gray-800 border-gray-700 text-gray-200"
                                >
                                    {selectedUser ? (
                                        <span>{selectedUser.name || selectedUser.email}</span>
                                    ) : (
                                        <span className="text-gray-400">Rechercher un utilisateur...</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0 bg-gray-800 border-gray-700" align="start">
                                <div className="p-2">
                                    <Input
                                        placeholder="Rechercher par nom ou email..."
                                        value={userSearch}
                                        onChange={(e) => setUserSearch(e.target.value)}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                        autoFocus
                                    />
                                </div>
                                <div className="max-h-[200px] overflow-y-auto">
                                    {isSearchingUsers && (
                                        <div className="p-4 text-center text-gray-400">Recherche...</div>
                                    )}
                                    {!isSearchingUsers && users.length === 0 && userSearch.length >= 2 && (
                                        <div className="p-4 text-center text-gray-400">Aucun utilisateur trouvé</div>
                                    )}
                                    {!isSearchingUsers && userSearch.length < 2 && (
                                        <div className="p-4 text-center text-gray-400">Saisir au moins 2 caractères</div>
                                    )}
                                    {users.map((user) => (
                                        <div
                                            key={user.id}
                                            onClick={() => handleUserSelect(user)}
                                            className="p-3 hover:bg-gray-700 cursor-pointer text-gray-200 border-b border-gray-700 last:border-b-0"
                                        >
                                            <div className="font-medium">{user.name || 'Sans nom'}</div>
                                            <div className="text-sm text-gray-400">{user.email}</div>
                                        </div>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Book Selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Livre <span className="text-red-500">*</span>
                        </label>
                        <Popover open={bookPopoverOpen} onOpenChange={setBookPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-full justify-start bg-gray-800 border-gray-700 text-gray-200"
                                >
                                    {selectedBook ? (
                                        <span>{selectedBook.title} - {selectedBook.author}</span>
                                    ) : (
                                        <span className="text-gray-400">Rechercher un livre...</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0 bg-gray-800 border-gray-700" align="start">
                                <div className="p-2">
                                    <Input
                                        placeholder="Rechercher par titre ou auteur..."
                                        value={bookSearch}
                                        onChange={(e) => setBookSearch(e.target.value)}
                                        className="bg-gray-900 border-gray-700 text-gray-200"
                                        autoFocus
                                    />
                                </div>
                                <div className="max-h-[200px] overflow-y-auto">
                                    {isSearchingBooks && (
                                        <div className="p-4 text-center text-gray-400">Recherche...</div>
                                    )}
                                    {!isSearchingBooks && books.length === 0 && bookSearch.length >= 2 && (
                                        <div className="p-4 text-center text-gray-400">Aucun livre trouvé</div>
                                    )}
                                    {!isSearchingBooks && bookSearch.length < 2 && (
                                        <div className="p-4 text-center text-gray-400">Saisir au moins 2 caractères</div>
                                    )}
                                    {books.map((book) => (
                                        <div
                                            key={book.id}
                                            onClick={() => handleBookSelect(book)}
                                            className="p-3 hover:bg-gray-700 cursor-pointer text-gray-200 border-b border-gray-700 last:border-b-0"
                                        >
                                            <div className="font-medium">{book.title}</div>
                                            <div className="text-sm text-gray-400">{book.author}</div>
                                        </div>
                                    ))}
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

                    {/* Type de demande - Mutually Exclusive Checkboxes */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Type de demande <span className="text-red-500">*</span>
                        </label>

                        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-800/80 rounded-lg border border-gray-600 shadow-md">
                            <div
                                className={`flex items-center space-x-3 p-3 rounded-md transition-all border ${
                                    formData.isDuplication
                                        ? 'bg-green-900/30 border-green-600 shadow-lg shadow-green-900/20'
                                        : 'bg-gray-900/50 border-gray-700/50 hover:bg-gray-900/70'
                                }`}
                            >
                                <Checkbox
                                    id="isDuplication"
                                    checked={formData.isDuplication}
                                    onCheckedChange={handleDuplicationChange}
                                    className="border-2 border-gray-500 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 w-6 h-6"
                                />
                                <label htmlFor="isDuplication" className="text-base font-bold text-gray-100 cursor-pointer leading-tight flex-1">
                                    Est une duplication
                                </label>
                            </div>

                            <div
                                className={`flex items-center space-x-3 p-3 rounded-md transition-all border ${
                                    formData.lentPhysicalBook
                                        ? 'bg-blue-900/30 border-blue-600 shadow-lg shadow-blue-900/20'
                                        : 'bg-gray-900/50 border-gray-700/50 hover:bg-gray-900/70'
                                }`}
                            >
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
                        </div>
                    </div>

                    {/* Status - Auto-filled based on checkbox selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Statut <span className="text-red-500">*</span>
                        </label>
                        <Select
                            value={formData.statusId?.toString() || ''}
                            onValueChange={(value) => setFormData({ ...formData, statusId: parseInt(value) })}
                        >
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750 transition-colors">
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
                        <Select value={formData.mediaFormatId?.toString() || ''} onValueChange={(value) => setFormData({ ...formData, mediaFormatId: parseInt(value) })}>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750 transition-colors">
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
                        <Select value={formData.deliveryMethod || ''} onValueChange={(value) => setFormData({ ...formData, deliveryMethod: value as 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE'})}>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750 transition-colors">
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

                    {/* Billing Status - Fixed as UNBILLED for new orders */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">État de facturation</label>
                        <Select value={formData.billingStatus} onValueChange={(value) => setFormData({ ...formData, billingStatus: value as 'UNBILLED' | 'BILLED' | 'PAID' })} disabled>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-200 opacity-60 cursor-not-allowed">
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
                                        value="BILLED"
                                        className="text-gray-200 hover:bg-gray-700 focus:bg-gray-700 cursor-pointer pl-8 pr-3 py-2.5 border-b border-gray-700/50 transition-colors"
                                    >
                                        <span className="font-medium">Facturé</span>
                                    </SelectItem>
                                    <SelectItem
                                        value="PAID"
                                        className="text-gray-200 hover:bg-gray-700 focus:bg-gray-700 cursor-pointer pl-8 pr-3 py-2.5 transition-colors"
                                    >
                                        <span className="font-medium">Payé</span>
                                    </SelectItem>
                                </div>
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
                        {isLoading ? 'Création en cours...' : 'Créer la demande'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}