import React, { useState, useRef, useEffect  } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Loader2 } from "lucide-react";

interface BookSearchProps {
    onBookSelect: (bookData: {
        title: string;
        author: string;
        description: string;
        isbn: string;
        publishedMonth: string;
        publishedYear: string;
    }) => void;
}

interface IndustryIdentifier {
    type: string;
    identifier: string;
}

interface VolumeInfo {
    title: string;
    authors?: string[];
    description?: string;
    publishedDate?: string;
    industryIdentifiers?: IndustryIdentifier[];
}

interface BookItem {
    volumeInfo: VolumeInfo;
}

interface GoogleBooksResponse {
    items?: BookItem[];
}

interface BookResult {
    title: string;
    author: string;
    description: string;
    isbn: string;
    publishedDate: Date | null;
}

const BookSearch: React.FC<BookSearchProps> = ({ onBookSelect }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState<BookResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open && inputRef.current) {
            inputRef.current.focus();
        }
    }, [open]);


    const searchBooks = async () => {
        if (!searchQuery.trim()) return;
        setHasSearched(true);

        setIsLoading(true);
        setSearchError(null);
        setResults([]);

        try {
            const url = `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(searchQuery)}&maxResults=5&langRestrict=fr&country=FR`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            const data: GoogleBooksResponse = await response.json();

            if (data.items) {
                const formattedResults: BookResult[] = data.items.map(item => {
                    const volumeInfo = item.volumeInfo;
                    return {
                        title: volumeInfo.title || 'Unknown Title',
                        author: volumeInfo.authors ? volumeInfo.authors[0] : 'Unknown Author',
                        description: volumeInfo.description || '',
                        isbn: volumeInfo.industryIdentifiers ?
                            volumeInfo.industryIdentifiers.find(id => id.type === 'ISBN_13')?.identifier ||
                            volumeInfo.industryIdentifiers[0]?.identifier || '' : '',
                        publishedDate: volumeInfo.publishedDate ? new Date(volumeInfo.publishedDate) : null
                    };
                });
                setResults(formattedResults);
                if (formattedResults.length === 0) {
                    setSearchError('No books found');
                }
            } else {
                setSearchError('No results found');
                setResults([]);
            }
        } catch (error) {
            console.error('Error searching books:', error);
            setSearchError(error instanceof Error ? error.message : 'Failed to search books');
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchBooks();
        }
    };

    const handleSelect = (book: BookResult) => {
        const month = book.publishedDate ?
            (book.publishedDate.getMonth() + 1).toString().padStart(2, '0') : '';
        const year = book.publishedDate ?
            book.publishedDate.getFullYear().toString() : '';

        onBookSelect({
            title: book.title,
            author: book.author,
            description: book.description,
            isbn: book.isbn,
            publishedMonth: month,
            publishedYear: year
        });

        setOpen(false);
        setSearchQuery('');
        setResults([]);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className="w-full justify-start bg-gray-800 border-gray-100 text-gray-200 hover:bg-gray-700 hover:text-gray-100"
                >
                    <Search className="w-4 h-4 mr-2" />
                    Rechercher sur Google Books
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[500px] p-4 bg-gray-800 border-gray-700"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="space-y-2 mb-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="Rechercher un livre..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="bg-gray-700 border-gray-400 text-gray-100"
                        />
                        <Button
                            onClick={(e) => {
                                e.stopPropagation();
                                searchBooks();
                            }}
                            disabled={isLoading}
                            className="bg-gray-700 hover:bg-gray-600 text-gray-100 whitespace-nowrap"
                        >
                            {isLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <Search className="w-4 h-4 mr-2" />
                            )}
                            Rechercher
                        </Button>
                    </div>
                    <p className="text-sm text-gray-400 italic">
                        Appuyez sur Entrée pour lancer la recherche
                    </p>
                </div>

                <ScrollArea
                    className="h-[300px]"
                    onWheel={(e) => {
                        e.stopPropagation();
                    }}
                >
                    <div className="space-y-2">
                        {searchError && (
                            <p className="text-red-400 text-center mb-2">{searchError}</p>
                        )}
                        {results.map((book, index) => (
                            <Card
                                key={index}
                                className="p-3 cursor-pointer bg-gray-700 hover:bg-gray-600 border-gray-600"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelect(book);
                                }}
                            >
                                <h3 className="font-semibold text-gray-100">{book.title}</h3>
                                {book.author && (
                                    <p className="text-sm text-gray-300">par {book.author}</p>
                                )}
                                {book.publishedDate && (
                                    <p className="text-sm text-gray-400">
                                        Publié le {book.publishedDate.toLocaleDateString('fr-FR')}
                                    </p>
                                )}
                                {book.description && (
                                    <p className="text-sm text-gray-300 line-clamp-2 mt-1">
                                        {book.description}
                                    </p>
                                )}
                            </Card>
                        ))}
                        {results.length === 0 && !isLoading && !searchError && hasSearched && (
                            <p className="text-gray-400 text-center">Aucun résultat trouvé</p>
                        )}
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
};

export default BookSearch;