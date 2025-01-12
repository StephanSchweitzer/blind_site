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

interface Book {
    id: number;
    title: string;
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
                                         isOpen = false  // Add this
                                     }: BookSelectorProps) {    const [bookDetailsMap, setBookDetailsMap] = useState<Map<number, Book>>(new Map());
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<Book[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [debouncedSearchTerm] = useDebounce(searchTerm, 300);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [initialLoadDone, setInitialLoadDone] = useState(false);


    // Original fetch logic remains the same
    useEffect(() => {
        const fetchInitialBooks = async () => {
            if (initialLoadDone) return;

            try {
                let url = '/api/books?';
                const params = new URLSearchParams();

                if (mode === 'edit' && selectedBooks.length > 0) {
                    params.append('ids', selectedBooks.join(','));
                } else if (mode === 'create') {
                    params.append('recent', 'true');
                }

                if (params.toString()) {
                    const response = await fetch(`${url}${params.toString()}`);
                    if (response.ok) {
                        const data = await response.json();
                        const newBookMap = new Map<number, Book>(data.books.map((book: Book) => [book.id, book]));
                        setBookDetailsMap(newBookMap);

                        if (mode === 'create') {
                            const bookIds = data.books.map((book: Book) => book.id);
                            onSelectedBooksChange(bookIds);
                        }
                    }
                }
                setInitialLoadDone(true);
            } catch (error) {
                console.error('Erreur lors du chargement des livres:', error);
                setInitialLoadDone(true);
            }
        };

        fetchInitialBooks();
    }, [mode, coupDeCoeurId]);

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

                    const newBookMap = new Map<number, Book>(bookDetailsMap);
                    data.books.forEach((book: Book) => {
                        newBookMap.set(book.id, book);
                    });
                    setBookDetailsMap(newBookMap);
                }
            } catch (error) {
                console.error('Erreur lors de la recherche:', error);
            } finally {
                setIsSearching(false);
            }
        };

        searchBooks();
    }, [debouncedSearchTerm, mode]);

    const toggleBookSelection = (bookId: number) => {
        if (selectedBooks.includes(bookId)) {
            onSelectedBooksChange(selectedBooks.filter(id => id !== bookId));
        } else {
            onSelectedBooksChange([...selectedBooks, bookId]);
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

    const selectedBookDetails = Array.from(bookDetailsMap.values())
        .filter(book => selectedBooks.includes(book.id));

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
                    <TableHead className="text-gray-200 font-medium">Date d'ajout</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {books.map((book) => {
                    const isSelected = selectedBooks.includes(book.id);
                    return (
                        <TableRow
                            key={book.id}
                            className={`border-b border-gray-700 hover:bg-gray-750 ${isSelected && isSearchResults ? "opacity-50" : ""}`}
                        >
                            <TableCell className="text-gray-200">
                                <Switch
                                    id={`book-${book.id}`}
                                    checked={isSelected}
                                    onChange={() => toggleBookSelection(book.id)}
                                    className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-600"
                                />
                            </TableCell>
                            <TableCell className="text-gray-200">
                                <div className="flex flex-col">
                                    <span>{book.title}</span>
                                    {isSelected && isSearchResults && (
                                        <span className="text-sm text-gray-400">
                                            Ce livre appartient déjà à la liste
                                        </span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell className="text-gray-200">{book.author}</TableCell>
                            <TableCell className="text-gray-200">{book.isbn || 'N/A'}</TableCell>
                            <TableCell className="text-gray-200">{new Date(book.createdAt).toLocaleDateString()}</TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-100">
                    {mode === 'edit' ? 'Livres sélectionnés' : 'Livres récents'}
                </h3>
                <Dialog
                    open={isOpen}
                    onOpenChange={onDialogOpenChange}
                >
                    <DialogTrigger asChild>
                        <Button className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600">
                            Ajouter un livre existant
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-gray-900 border-gray-700">
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

            <div className="border border-gray-700 rounded-lg bg-gray-800">
                <BookTable books={selectedBookDetails} />
            </div>

            <div className="mt-4">
                <p className="text-sm text-gray-400">
                    {selectedBooks.length} livres sélectionnés
                </p>
            </div>
        </div>
    );
}