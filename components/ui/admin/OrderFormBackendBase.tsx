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
import { AlertCircle, Calendar, Search, X } from 'lucide-react';
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

export interface OrderFormData {
    aveugleId: number | null;
    catalogueId: number | null;
    requestReceivedDate: Date;
    statusId: number | null;
    isDuplication: boolean;
    mediaFormatId: number | null;
    deliveryMethod: 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE' | null;
    processedByStaffId: number | null;
    createdDate: Date | null;
    closureDate: Date | null;
    cost: string;
    billingStatus: 'UNBILLED' | 'BILLED' | 'PAID';
    lentPhysicalBook: boolean;
    notes: string;
}

interface OrderFormBackendBaseProps {
    initialData?: OrderFormData;
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
}

export function OrderFormBackendBase({
                                         initialData,
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
                                     }: OrderFormBackendBaseProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form data state
    const [formData, setFormData] = useState<OrderFormData>(initialData || {
        aveugleId: null,
        catalogueId: null,
        requestReceivedDate: new Date(),
        statusId: null,
        isDuplication: false,
        mediaFormatId: null,
        deliveryMethod: null,
        processedByStaffId: null,
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
    const [staffUsers, setStaffUsers] = useState<User[]>([]);

    // Search states
    const [userSearch, setUserSearch] = useState('');
    const [bookSearch, setBookSearch] = useState('');
    const [staffSearch, setStaffSearch] = useState('');
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [isSearchingBooks, setIsSearchingBooks] = useState(false);
    const [isSearchingStaff, setIsSearchingStaff] = useState(false);

    // Popover open states
    const [userPopoverOpen, setUserPopoverOpen] = useState(false);
    const [bookPopoverOpen, setBookPopoverOpen] = useState(false);
    const [staffPopoverOpen, setStaffPopoverOpen] = useState(false);

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
                const response = await fetch(`/api/books/search?q=${encodeURIComponent(bookSearch)}`);
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

    // Search staff users
    useEffect(() => {
        const searchStaff = async () => {
            if (staffSearch.length < 2) {
                setStaffUsers([]);
                return;
            }

            setIsSearchingStaff(true);
            try {
                const response = await fetch(`/api/user/search?q=${encodeURIComponent(staffSearch)}`);
                if (response.ok) {
                    const data = await response.json();
                    setStaffUsers(data);
                }
            } catch (err) {
                console.error('Error searching staff:', err);
            } finally {
                setIsSearchingStaff(false);
            }
        };

        const debounce = setTimeout(searchStaff, 300);
        return () => clearTimeout(debounce);
    }, [staffSearch]);

    const handleUserSelect = (user: User) => {
        setSelectedUser(user);
        setFormData({ ...formData, aveugleId: user.id });
        setUserPopoverOpen(false);
        setUserSearch('');
    };

    const handleBookSelect = (book: Book) => {
        setSelectedBook(book);
        setFormData({ ...formData, catalogueId: book.id });
        setBookPopoverOpen(false);
        setBookSearch('');
    };

    const handleStaffSelect = (user: User) => {
        setSelectedStaff(user);
        setFormData({ ...formData, processedByStaffId: user.id });
        setStaffPopoverOpen(false);
        setStaffSearch('');
    };

    const clearStaffSelection = () => {
        setSelectedStaff(null);
        setFormData({ ...formData, processedByStaffId: null });
    };

    const handleRecordingChange = (checked: boolean) => {
        setFormData(prev => ({
            ...prev,
            lentPhysicalBook: checked,
            // Auto-select appropriate status based on recording requirement
            statusId: checked
                ? statuses.find(s => s.name.toLowerCase().includes('enregistrement'))?.id || prev.statusId
                : statuses.find(s => s.name.toLowerCase().includes('duplication'))?.id || prev.statusId
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        // Validation
        if (!formData.aveugleId) {
            setError('Veuillez sélectionner un utilisateur aveugle');
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
            const newOrderId = await onSubmit(formData);
            if (onSuccess) {
                onSuccess(newOrderId);
            }
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('Échec du traitement de la demande');
            }
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
                            Utilisateur aveugle <span className="text-red-500">*</span>
                        </label>
                        <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750 transition-colors"
                                >
                                    {selectedUser ? (
                                        <span className="truncate">
                                            {selectedUser.name || selectedUser.email}
                                        </span>
                                    ) : (
                                        <span className="text-gray-400">Rechercher un utilisateur...</span>
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
                                <div className="max-h-[200px] overflow-y-auto">
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
                                            <div className="font-medium">{user.name || 'Sans nom'}</div>
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
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750 transition-colors"
                                >
                                    {selectedBook ? (
                                        <span className="truncate">
                                            {selectedBook.title} - {selectedBook.author}
                                        </span>
                                    ) : (
                                        <span className="text-gray-400">Rechercher un livre...</span>
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
                                <div className="max-h-[200px] overflow-y-auto">
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

                    {/* Created Date */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">Date de création</label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-full justify-start text-left bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750"
                                >
                                    <Calendar className="mr-2 h-4 w-4" />
                                    {formData.createdDate ? (
                                        format(formData.createdDate, 'PPP', { locale: fr })
                                    ) : (
                                        <span>Sélectionner une date</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-gray-800 border-gray-700">
                                <CalendarComponent
                                    mode="single"
                                    selected={formData.createdDate || undefined}
                                    onSelect={(date) => setFormData({ ...formData, createdDate: date || null })}
                                    initialFocus
                                    className="bg-gray-800 text-gray-200"
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Closure Date */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">Date de clôture</label>
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

                    {/* Duplication and Recording Checkboxes */}
                    <div className="space-y-4">
                        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                            <div className="flex items-center space-x-3">
                                <Checkbox
                                    id="isDuplication"
                                    checked={formData.isDuplication}
                                    onCheckedChange={(checked) => setFormData({ ...formData, isDuplication: checked as boolean })}
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
                        <Select
                            value={formData.mediaFormatId?.toString() || ''}
                            onValueChange={(value) => setFormData({ ...formData, mediaFormatId: parseInt(value) })}
                        >
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
                        <Select
                            value={formData.deliveryMethod || ''}
                            onValueChange={(value) => setFormData({ ...formData, deliveryMethod: value as 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE'})}
                        >
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

                    {/* Processed By Staff (Optional) */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">
                            Traité par (Personnel)
                        </label>
                        {selectedStaff ? (
                            <div className="flex items-center gap-2">
                                <div className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-200">
                                    {selectedStaff.name || selectedStaff.email}
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={clearStaffSelection}
                                    className="bg-gray-800 border-gray-700 hover:bg-gray-700"
                                >
                                    <X className="h-4 w-4 text-gray-400" />
                                </Button>
                            </div>
                        ) : (
                            <Popover open={staffPopoverOpen} onOpenChange={setStaffPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        className="w-full justify-between bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750 transition-colors"
                                    >
                                        <span className="text-gray-400">Rechercher un membre du personnel...</span>
                                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[400px] p-0 bg-gray-800 border-gray-700" align="start">
                                    <div className="p-2">
                                        <Input
                                            placeholder="Rechercher par nom ou email..."
                                            value={staffSearch}
                                            onChange={(e) => setStaffSearch(e.target.value)}
                                            className="bg-gray-900 border-gray-700 text-gray-200"
                                        />
                                    </div>
                                    <div className="max-h-[200px] overflow-y-auto">
                                        {isSearchingStaff && (
                                            <div className="p-4 text-center text-gray-400">Recherche...</div>
                                        )}
                                        {!isSearchingStaff && staffUsers.length === 0 && staffSearch.length >= 2 && (
                                            <div className="p-4 text-center text-gray-400">Aucun personnel trouvé</div>
                                        )}
                                        {staffUsers.map((user) => (
                                            <button
                                                key={user.id}
                                                onClick={() => handleStaffSelect(user)}
                                                className="w-full text-left px-4 py-2 hover:bg-gray-700 text-gray-200 transition-colors"
                                            >
                                                <div className="font-medium">{user.name || 'Sans nom'}</div>
                                                <div className="text-sm text-gray-400">{user.email}</div>
                                            </button>
                                        ))}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>

                    {/* Billing Status */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-200">État de facturation</label>
                        <Select
                            value={formData.billingStatus}
                            onValueChange={(value) => setFormData({ ...formData, billingStatus: value as 'UNBILLED' | 'BILLED' | 'PAID' })}
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

// Add Order Form using the base
export function AddOrderFormBackend({ onSuccess }: { onSuccess?: (orderId: number) => void }) {
    const { toast } = useToast();

    const handleSubmit = async (formData: OrderFormData): Promise<number> => {
        try {
            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (!response.ok) {
                const errorMessage = data?.message || 'Échec de la création de la demande';

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
                description: <span className="text-xl mt-2">La demande a été créée avec succès</span>,
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
            });

            return data.order.id;
        } catch (error) {
            console.error('Submit error:', error);
            return Promise.reject();
        }
    };

    return (
        <OrderFormBackendBase
            onSubmit={handleSubmit}
            submitButtonText="Créer la demande"
            loadingText="Création en cours..."
            title="Créer une nouvelle demande"
            onSuccess={onSuccess}
        />
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
                                     }: {
    orderId: string;
    initialData: OrderFormData;
    onSuccess?: (orderId: number, isDeleted?: boolean) => void;
    initialSelectedUser?: User | null;
    initialSelectedBook?: Book | null;
    initialSelectedStaff?: User | null;
}) {
    const { toast } = useToast();

    const handleDelete = async (): Promise<void> => {
        try {
            const response = await fetch(`/api/orders/${orderId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error('Échec de la suppression de la demande');
            }

            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">La demande a été supprimée avec succès</span>,
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
            });

            if (onSuccess) {
                onSuccess(parseInt(orderId), true);
            }
        } catch (error) {
            console.error('Delete error:', error);
            throw error;
        }
    };

    const handleSubmit = async (formData: OrderFormData): Promise<number> => {
        try {
            const response = await fetch(`/api/orders/${orderId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
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

            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">La demande a été mise à jour avec succès</span>,
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
            });

            return parseInt(orderId);
        } catch (error) {
            console.error('Submit error:', error);
            return Promise.reject();
        }
    };

    return (
        <OrderFormBackendBase
            initialData={initialData}
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
        />
    );
}