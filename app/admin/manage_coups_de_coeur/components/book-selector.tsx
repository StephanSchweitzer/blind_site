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
}

export default function BookSelector({ selectedBooks = [], onSelectedBooksChange, mode, coupDeCoeurId }: BookSelectorProps) {
    const [bookDetailsMap, setBookDetailsMap] = useState<Map<number, Book>>(new Map());
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<Book[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [debouncedSearchTerm] = useDebounce(searchTerm, 300);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [initialLoadDone, setInitialLoadDone] = useState(false);

    // Single useEffect for initial load
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

                        // Store books in the map
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
                console.error('Error fetching books:', error);
                setInitialLoadDone(true);
            }
        };

        fetchInitialBooks();
    }, [mode, coupDeCoeurId]);

    // Search books effect
    useEffect(() => {
        const searchBooks = async () => {
            if (!debouncedSearchTerm) {
                setSearchResults([]);
                return;
            }

            setIsSearching(true);
            try {
                // When searching, we want to search all books regardless of mode
                const params = new URLSearchParams({
                    search: debouncedSearchTerm
                });

                const response = await fetch(`/api/books?${params.toString()}`);
                if (response.ok) {
                    const data = await response.json();
                    setSearchResults(data.books);

                    // Add new books to the map
                    const newBookMap = new Map<number, Book>(bookDetailsMap);
                    data.books.forEach((book: Book) => {
                        newBookMap.set(book.id, book);
                    });
                    setBookDetailsMap(newBookMap);
                }
            } catch (error) {
                console.error('Error searching books:', error);
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

    // Get selected book details from the map
    const selectedBookDetails = Array.from(bookDetailsMap.values())
        .filter(book => selectedBooks.includes(book.id));

    const BookTable = ({ books, isSearchResults = false }: { books: Book[], isSearchResults?: boolean }) => (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>
                        <div className="flex items-center gap-2">
                            <Switch
                                id={`select-all-${isSearchResults ? 'search' : 'main'}`}
                                checked={areAllSelected(books)}
                                onChange={(checked) => handleSelectAll(checked, books)}
                            />
                            <label htmlFor={`select-all-${isSearchResults ? 'search' : 'main'}`} className="text-sm font-medium">
                                Select All
                            </label>
                        </div>
                    </TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>ISBN</TableHead>
                    <TableHead>Added Date</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {books.map((book) => {
                    const isSelected = selectedBooks.includes(book.id);
                    return (
                        <TableRow
                            key={book.id}
                            className={isSelected && isSearchResults ? "opacity-50" : ""}
                        >
                            <TableCell>
                                <Switch
                                    id={`book-${book.id}`}
                                    checked={isSelected}
                                    onChange={() => toggleBookSelection(book.id)}
                                />
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col">
                                    <span>{book.title}</span>
                                    {isSelected && isSearchResults && (
                                        <span className="text-sm text-muted-foreground">
                                            Ce livre appartient déjà à la liste
                                        </span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>{book.author}</TableCell>
                            <TableCell>{book.isbn || 'N/A'}</TableCell>
                            <TableCell>{new Date(book.createdAt).toLocaleDateString()}</TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">
                    {mode === 'edit' ? 'Selected Books' : 'Recent Books'}
                </h3>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline">Search All Books</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Search Books</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <Input
                                type="search"
                                placeholder="Search books by title, author, or ISBN..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            {isSearching ? (
                                <p className="text-center py-4">Loading...</p>
                            ) : (
                                <>
                                    {searchResults.length > 0 ? (
                                        <BookTable books={searchResults} isSearchResults={true} />
                                    ) : (
                                        debouncedSearchTerm && (
                                            <p className="text-center text-muted-foreground py-4">
                                                No books found matching your search.
                                            </p>
                                        )
                                    )}
                                </>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-lg">
                <BookTable books={selectedBookDetails} />
            </div>

            <div className="mt-4">
                <p className="text-sm text-muted-foreground">
                    {selectedBooks.length} books selected
                </p>
            </div>
        </div>
    );
}