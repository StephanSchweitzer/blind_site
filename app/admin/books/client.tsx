'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Book } from '@prisma/client';

type BookWithRelations = {
    id: string;
    title: string;
    author: string;
    addedBy: {
        name: string | null;
        email: string;
    };
    genres: {
        genre: {
            name: string;
        };
    }[];
    // Add other fields as needed
};

export default function BooksClient() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [books, setBooks] = useState<BookWithRelations[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);

    const currentPage = parseInt(searchParams.get('page') || '1');
    const searchTerm = searchParams.get('search') || '';

    const createQueryString = useCallback(
        (name: string, value: string) => {
            const params = new URLSearchParams(searchParams);
            params.set(name, value);
            return params.toString();
        },
        [searchParams]
    );

    const fetchBooks = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch(
                `/api/books?page=${currentPage}&search=${searchTerm}`,
                {
                    headers: {
                        'Cache-Control': 'no-store',
                    },
                }
            );
            const data = await response.json();
            setBooks(data.books);
            setTotalPages(data.totalPages);
        } catch (error) {
            console.error('Error fetching books:', error);
        }
        setIsLoading(false);
    }, [currentPage, searchTerm]);

    useEffect(() => {
        fetchBooks();
    }, [fetchBooks]);

    const handleSearch = (term: string) => {
        // Update URL without adding to history
        router.replace(`?${createQueryString('search', term)}`);
    };

    const handlePageChange = (page: number) => {
        // Update URL without adding to history
        router.replace(`?${createQueryString('page', page.toString())}`);
    };

    if (isLoading) {
        return <div>Loading...</div>;
    }

    return (
        <div>
            {/* Your existing UI components here */}
            <input
                type="search"
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search books..."
                className="..."
            />

            {/* Books list */}
            {books.map((book) => (
                <div key={book.id}>
                    {/* Your book card/list item UI */}
                </div>
            ))}

            {/* Pagination */}
            <div className="pagination">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        className={page === currentPage ? 'active' : ''}
                    >
                        {page}
                    </button>
                ))}
            </div>
        </div>
    );
}