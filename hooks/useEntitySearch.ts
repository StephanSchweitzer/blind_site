"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseEntitySearchOptions {
    /** Minimum trimmed query length before a search fires. */
    minLength?: number;
    /** Debounce delay between the last keystroke and the request. */
    delayMs?: number;
}

interface UseEntitySearchResult<T> {
    query: string;
    setQuery: (q: string) => void;
    results: T[];
    isSearching: boolean;
    reset: () => void;
}

/**
 * Debounced entity search with request cancellation.
 *
 * UX guarantees the ad-hoc setTimeout implementations didn't have:
 * - an in-flight request is aborted when the query changes, so a slow older
 *   response can never overwrite a newer one;
 * - previous results stay visible while the next search runs (no flicker to
 *   an empty list between keystrokes) — `isSearching` drives a subtle
 *   indicator instead of replacing the list.
 *
 * The whole pipeline is driven from the setQuery handler (not an effect), so
 * state updates only happen in event handlers and async callbacks.
 */
export function useEntitySearch<T>(
    fetcher: (query: string, signal: AbortSignal) => Promise<T[]>,
    { minLength = 2, delayMs = 300 }: UseEntitySearchOptions = {}
): UseEntitySearchResult<T> {
    const [query, setQueryState] = useState('');
    const [results, setResults] = useState<T[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const controllerRef = useRef<AbortController | null>(null);

    // Latest-ref so an inline fetcher (recreated each render) still works and
    // the timer callback always calls the current one.
    const fetcherRef = useRef(fetcher);
    useEffect(() => {
        fetcherRef.current = fetcher;
    });

    const cancelPending = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        controllerRef.current?.abort();
        controllerRef.current = null;
    }, []);

    // Abort whatever is pending on unmount.
    useEffect(() => cancelPending, [cancelPending]);

    const setQuery = useCallback((q: string) => {
        setQueryState(q);
        cancelPending();

        const trimmed = q.trim();
        if (trimmed.length < minLength) {
            setResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        timerRef.current = setTimeout(async () => {
            const controller = new AbortController();
            controllerRef.current = controller;
            try {
                const items = await fetcherRef.current(trimmed, controller.signal);
                if (!controller.signal.aborted) {
                    setResults(items);
                    setIsSearching(false);
                }
            } catch (err) {
                if ((err as Error)?.name !== 'AbortError') {
                    console.error('Entity search error:', err);
                    if (!controller.signal.aborted) setIsSearching(false);
                }
            }
        }, delayMs);
    }, [cancelPending, minLength, delayMs]);

    const reset = useCallback(() => {
        cancelPending();
        setQueryState('');
        setResults([]);
        setIsSearching(false);
    }, [cancelPending]);

    return { query, setQuery, results, isSearching, reset };
}
