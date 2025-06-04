// hooks/useBookSearch.ts (Alternative Simple Version)
import { useState, useCallback, useRef } from 'react';
import { SearchResult } from '@/types/book';

interface UseBookSearchReturn {
    data: SearchResult | null;
    loading: boolean;
    error: Error | null;
    searchBooks: (params: {
        searchTerm: string;
        filter: string;
        genres: number[];
        page: number;
    }) => Promise<void>;
}

export function useBookSearch(): UseBookSearchReturn {
    const [data, setData] = useState<SearchResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);

    const searchBooks = useCallback(async ({ searchTerm, filter, genres, page }: {
        searchTerm: string;
        filter: string;
        genres: number[];
        page: number;
    }) => {
        // Cancel any ongoing request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        // Create new AbortController
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                search: searchTerm,
                filter,
                page: page.toString(),
                limit: '9',
            });

            genres.forEach(genreId => {
                params.append('genres', genreId.toString());
            });

            const response = await fetch(`/api/books?${params}`, {
                signal: abortController.signal,
            });

            if (!response.ok) {
                throw new Error('Search failed');
            }

            const result = await response.json();
            setData(result);
        } catch (err) {
            if (err instanceof Error && err.name !== 'AbortError') {
                setError(err);
            }
        } finally {
            if (abortControllerRef.current === abortController) {
                setLoading(false);
            }
        }
    }, []);

    return {
        data,
        loading,
        error,
        searchBooks,
    };
}