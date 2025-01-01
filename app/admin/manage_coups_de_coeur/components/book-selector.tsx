'use client';

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
    selectedBooks: number[];
    onSelectedBooksChange: (bookIds: number[]) => void;
}

export default function BookSelector({ selectedBooks, onSelectedBooksChange }: BookSelectorProps) {
    const [selectedBookDetails, setSelectedBookDetails] = useState<Book[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<Book[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [debouncedSearchTerm] = useDebounce(searchTerm, 300);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // Fetch details of selected books
    useEffect(() => {
        const fetchSelectedBookDetails = async () => {
            if (selectedBooks.length > 0) {
                try {
                    const response = await fetch(`/api/books?ids=${selectedBooks.join(',')}`);
                    if (response.ok) {
                        const data = await response.json();
                        setSelectedBookDetails(data.books);
                    }
                } catch (error) {
                    console.error('Error fetching selected books:', error);
                }
            } else {
                setSelectedBookDetails([]);
            }
        };

        fetchSelectedBookDetails();
    }, [selectedBooks]);

    // Handle search
    useEffect(() => {
        const searchBooks = async () => {
            if (!debouncedSearchTerm) {
                setSearchResults([]);
                return;
            }

            setIsSearching(true);
            try {
                const response = await fetch(`/api/books?search=${encodeURIComponent(debouncedSearchTerm)}`);
                if (response.ok) {
                    const data = await response.json();
                    // Filter out already selected books from search results
                    const selectedBookIds = new Set(selectedBooks);
                    setSearchResults(data.books.filter((book: Book) => !selectedBookIds.has(book.id)));
                }
            } catch (error) {
                console.error('Error searching books:', error);
            } finally {
                setIsSearching(false);
            }
        };

        searchBooks();
    }, [debouncedSearchTerm, selectedBooks]);

    const toggleBookSelection = (bookId: number, book?: Book) => {
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
                {books.map((book) => (
                    <TableRow key={book.id}>
                        <TableCell>
                            <Switch
                                id={`book-${book.id}`}
                                checked={selectedBooks.includes(book.id)}
                                onChange={() => toggleBookSelection(book.id, isSearchResults ? book : undefined)}
                            />
                        </TableCell>
                        <TableCell>{book.title}</TableCell>
                        <TableCell>{book.author}</TableCell>
                        <TableCell>{book.isbn || 'N/A'}</TableCell>
                        <TableCell>{new Date(book.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Selected Books</h3>
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

            {/* Main Books Table */}
            <div className="border rounded-lg">
                <BookTable books={selectedBookDetails} />
            </div>

            {/* Selected Books Summary */}
            <div className="mt-4">
                <p className="text-sm text-muted-foreground">
                    {selectedBooks.length} books selected
                </p>
            </div>
        </div>
    );
}