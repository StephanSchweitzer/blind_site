import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/custom-switch";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useDebounce } from 'use-debounce';
import { AddBookButtonBackend } from "@/admin/BookModalBackend";
import { EditBookModal } from '@/admin/EditBookModal';
import { BookFormData } from "@/admin/BookFormBackendBase";
import { toast } from "@/hooks/use-toast";

interface Book {
    id: number;
    title: string;
    subtitle: string;
    author: string;
    isbn: string | null;
    createdAt: Date;
}

interface BookSelectorProps {
    selectedBooks?: number[];
    onSelectedBooksChange: (bookIds: number[]) => void;
    mode: 'edit' | 'create';
    coupDeCoeurId?: number;
    onDialogOpenChange?: (open: boolean) => void;
    isOpen?: boolean;
}

export default function BookSelector({
                                         selectedBooks = [],
                                         onSelectedBooksChange,
                                         mode,
                                         coupDeCoeurId,
                                         onDialogOpenChange,
                                         isOpen = false
                                     }: BookSelectorProps) {
    const [bookDetailsMap, setBookDetailsMap] = useState<Map<number, Book>>(new Map());
    const [displayedBookIds, setDisplayedBookIds] = useState<number[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm] = useDebounce(searchTerm, 700);
    const [searchResults, setSearchResults] = useState<Book[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [initialLoadDone, setInitialLoadDone] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [selectedBookForEdit, setSelectedBookForEdit] = useState<(Book & { formData: BookFormData }) | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const fetchInitialBooks = async () => {
            if (initialLoadDone) return;

            try {
                const url = '/api/books?';
                const params = new URLSearchParams();

                if (mode === 'edit') {
                    if (selectedBooks.length > 0) {
                        params.append('ids', selectedBooks.join(','));
                    }
                } else if (mode === 'create') {
                    params.append('recent', 'true');
                    params.append('limit', '1000');
                }

                if (params.toString()) {
                    const response = await fetch(`${url}${params.toString()}`);
                    if (response.ok) {
                        const data = await response.json();
                        const newBookMap = new Map<number, Book>(
                            data.books.map((book: Book) => [book.id, book])
                        );
                        setBookDetailsMap(newBookMap);

                        const bookIds = data.books.map((book: Book) => book.id);
                        setDisplayedBookIds(bookIds);

                        if (mode === 'create') {
                            onSelectedBooksChange(bookIds);
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading books:', error);
            } finally {
                setInitialLoadDone(true);
            }
        };

        fetchInitialBooks();
    }, [mode, coupDeCoeurId, initialLoadDone, onSelectedBooksChange, selectedBooks]);

    useEffect(() => {
        const searchBooks = async () => {
            if (!debouncedSearchTerm) {
                setSearchResults([]);
                return;
            }

            setIsSearching(true);
            try {
                const params = new URLSearchParams({
                    search: debouncedSearchTerm
                });

                const response = await fetch(`/api/books?${params.toString()}`);
                if (response.ok) {
                    const data = await response.json();
                    setSearchResults(data.books);
                    setBookDetailsMap(prev => {
                        const newMap = new Map(prev);
                        data.books.forEach((book: Book) => {
                            newMap.set(book.id, book);
                        });
                        return newMap;
                    });
                }
            } catch (error) {
                console.error('Erreur lors de la recherche:', error);
            } finally {
                setIsSearching(false);
            }
        };

        searchBooks();
    }, [debouncedSearchTerm]);


    const handleBookAdded = async (newBookId: number) => {
        try {
            const response = await fetch(`/api/books?ids=${newBookId}`);

            if (!response.ok) throw new Error('Failed to fetch new book');

            const data = await response.json();

            setBookDetailsMap(prev => {
                const newMap = new Map(prev);
                if (data.books?.[0]) {
                    newMap.set(newBookId, data.books[0]);
                }
                return newMap;
            });

            // Place the new book at the top of the list
            setDisplayedBookIds(prev => [newBookId, ...prev.filter(id => id !== newBookId)]);

            toggleBookSelection(newBookId, true);

        } catch (error) {
            console.error('Error refreshing book data after addition:', error);
            toast({
                title: "Erreur",
                description: "Échec de l'ajout du livre",
                variant: "destructive"
            });
        }
    };

    const handleBookEdited = async () => {
        if (displayedBookIds.length > 0) {
            try {
                const response = await fetch(`/api/books?ids=${displayedBookIds.join(',')}`);
                if (response.ok) {
                    const data = await response.json();
                    setBookDetailsMap(new Map(
                        data.books.map((book: Book) => [book.id, book])
                    ));
                }
            } catch (error) {
                console.error('Error refreshing book data:', error);
            }
        }
    };

    const handleBookDeleted = async (deletedBookId: number) => {
        if (displayedBookIds.length > 0) {
            const updatedBookIds = displayedBookIds.filter(id => id !== deletedBookId);
            setDisplayedBookIds(updatedBookIds);

            if (selectedBooks?.includes(deletedBookId)) {
                const updatedSelectedBooks = selectedBooks.filter(id => id !== deletedBookId);
                onSelectedBooksChange(updatedSelectedBooks);
            }

            try {
                if (updatedBookIds.length > 0) {
                    const response = await fetch(`/api/books?ids=${updatedBookIds.join(',')}`);
                    if (response.ok) {
                        const data = await response.json();
                        setBookDetailsMap(new Map(
                            data.books.map((book: Book) => [book.id, book])
                        ));
                    }
                } else {
                    setBookDetailsMap(new Map());
                }
            } catch (error) {
                console.error('Error refreshing book data after deletion:', error);
            }
        }
    };


    const toggleBookSelection = (bookId: number, forceAdd: boolean = false) => {
        const isRemoving = selectedBooks.includes(bookId) && !forceAdd;

        // Optimistically update UI first
        if (isRemoving) {
            onSelectedBooksChange(selectedBooks.filter(id => id !== bookId));
        } else {
            onSelectedBooksChange([...selectedBooks, bookId]);
            if (!displayedBookIds.includes(bookId)) {
                // Place the newly added book at the top of the displayed list
                setDisplayedBookIds(prev => [bookId, ...prev]);
            } else if (forceAdd) {
                // If the book already exists but we want to highlight it, move it to the top
                setDisplayedBookIds(prev => [bookId, ...prev.filter(id => id !== bookId)]);
            }
        }
    };

    const handleRowClick = async (book: Book) => {
        setIsLoading(true);
        document.body.style.cursor = 'wait';

        try {
            const response = await fetch(`/api/books/${book.id}`);
            if (!response.ok) {
                throw new Error('Failed to fetch book details');
            }
            const bookDetails = await response.json();

            const genreIds = bookDetails.genres.map((g: { genre: { id: string } }) => g.genre.id);

            const formData: BookFormData = {
                title: bookDetails.title || '',
                subtitle: bookDetails.subtitle || '',
                author: bookDetails.author || '',
                publisher: bookDetails.publisher || '',
                publishedYear: bookDetails.publishedDate ?
                    new Date(bookDetails.publishedDate).getFullYear().toString() :
                    '',
                genres: genreIds,
                isbn: bookDetails.isbn || '',
                description: bookDetails.description || '',
                available: Boolean(bookDetails.available),
                readingDurationMinutes: bookDetails.readingDurationMinutes?.toString() || '',
                pageCount: bookDetails.pageCount
            };

            setSelectedBookForEdit({
                ...book,
                formData
            });
            setEditModalOpen(true);
        } catch (error) {
            console.error('Error fetching book details:', error);
            toast({
                title: "Erreur",
                description: "Échec du chargement des détails du livre. Veuillez réessayer.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
            document.body.style.cursor = 'default';
        }
    };

    const handleSelectAll = (checked: boolean, books: Book[]) => {
        if (checked) {
            const newSelections = [...new Set([...selectedBooks, ...books.map(book => book.id)])];
            onSelectedBooksChange(newSelections);
        } else {
            const bookIdsToRemove = new Set(books.map(book => book.id));
            onSelectedBooksChange(selectedBooks.filter(id => !bookIdsToRemove.has(id)));
        }
    };

    const areAllSelected = (books: Book[]) => {
        return books.length > 0 && books.every(book => selectedBooks.includes(book.id));
    };

    const displayedBookDetails = displayedBookIds
        .map(id => bookDetailsMap.get(id))
        .filter(book => book !== undefined) as Book[];

    const BookTable = ({ books, isSearchResults = false }: { books: Book[], isSearchResults?: boolean }) => (
        <Table>
            <TableHeader>
                <TableRow className="border-b border-gray-700 bg-gray-800">
                    <TableHead className="text-gray-200 font-medium">
                        <div className="flex items-center gap-2">
                            <Switch
                                id={`select-all-${isSearchResults ? 'search' : 'main'}`}
                                checked={areAllSelected(books)}
                                onChange={(checked) => handleSelectAll(checked, books)}
                                className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-600"
                            />
                            <label htmlFor={`select-all-${isSearchResults ? 'search' : 'main'}`} className="text-sm font-medium text-gray-200">
                                Tout sélectionner
                            </label>
                        </div>
                    </TableHead>
                    <TableHead className="text-gray-200 font-medium">Titre</TableHead>
                    <TableHead className="text-gray-200 font-medium">Auteur</TableHead>
                    <TableHead className="text-gray-200 font-medium">ISBN</TableHead>
                    <TableHead className="text-gray-200 font-medium">Date d&apos;ajout</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {books.map((book) => (
                    <TableRow
                        key={book.id}
                        className={`
                            border-b border-gray-700 
                            hover:bg-gray-750 
                            ${isLoading ? '[&]:hover:cursor-wait' : 'cursor-pointer'}
                            ${isSearchResults && displayedBookIds.includes(book.id) ? "opacity-50" : ""}
                        `}
                        onClick={() => {
                            if (isSearchResults) {
                                toggleBookSelection(book.id, true);
                            } else {
                                handleRowClick(book);
                            }
                        }}
                    >
                        <TableCell
                            className="text-gray-200"
                            onClick={(e) => {
                                e.stopPropagation();
                            }}
                        >
                            <Switch
                                id={`book-${book.id}`}
                                checked={selectedBooks.includes(book.id)}
                                onChange={() => toggleBookSelection(book.id)}
                                className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-600"
                            />
                        </TableCell>
                        <TableCell className="text-gray-200">
                            <div className="flex flex-col">
                                <span>{book.title}</span>
                                {isSearchResults && displayedBookIds.includes(book.id) && (
                                    <span className="text-sm text-gray-400">
                                        Ce livre appartient déjà à la liste
                                    </span>
                                )}
                            </div>
                        </TableCell>
                        <TableCell className="text-gray-200">{book.author}</TableCell>
                        <TableCell className="text-gray-200">{book.isbn || 'N/A'}</TableCell>
                        <TableCell className="text-gray-200">
                            {new Date(book.createdAt).toLocaleDateString()}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-100">
                    {mode === 'edit' ? 'Livres sélectionnés' : 'Livres récents'}
                </h3>
                <div className="flex gap-2">
                    <AddBookButtonBackend onBookAdded={handleBookAdded} />

                    <Dialog
                        open={isOpen}
                        onOpenChange={onDialogOpenChange}
                    >
                        <DialogTrigger asChild>
                            <Button className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600">
                                Ajouter un livre existant
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-gray-900 border-gray-700 [&>button>svg]:text-white">
                            <DialogHeader>
                                <DialogTitle className="text-gray-100">Recherche de livres</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                                <Input
                                    type="search"
                                    placeholder="Rechercher par titre, auteur ou ISBN..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-white text-gray-900 placeholder:text-gray-500"
                                />
                                {isSearching ? (
                                    <p className="text-center py-4 text-gray-200">Chargement...</p>
                                ) : (
                                    <>
                                        {searchResults.length > 0 ? (
                                            <BookTable books={searchResults} isSearchResults={true} />
                                        ) : (
                                            debouncedSearchTerm && (
                                                <p className="text-center text-gray-400 py-4">
                                                    Aucun livre trouvé correspondant à votre recherche.
                                                </p>
                                            )
                                        )}
                                    </>
                                )}
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="border border-gray-700 rounded-lg bg-gray-800">
                <BookTable books={displayedBookDetails} />
            </div>

            <div className="mt-4">
                <p className="text-sm text-gray-400">
                    {selectedBooks.length} livres sélectionnés sur {displayedBookIds.length} livres dans la liste
                </p>
            </div>

            {selectedBookForEdit && (
                <EditBookModal
                    isOpen={editModalOpen}
                    onOpenChange={setEditModalOpen}
                    bookId={selectedBookForEdit.id.toString()}
                    initialData={selectedBookForEdit.formData}
                    onBookEdited={handleBookEdited}
                    onBookDeleted={handleBookDeleted}
                />
            )}
        </div>
    );
    }