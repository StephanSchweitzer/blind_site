"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { meetsSearchMinLength, normalizeSearchQuery } from '@/lib/search-query';

interface UseEntitySearchOptions {
    /**
     * Minimum normalized query length before a search fires. A query that is
     * just an id (« 7 », « #7 ») is exempt — see `meetsSearchMinLength`.
     */
    minLength?: number;
    /** Debounce delay between the last keystroke and the request. */
    delayMs?: number;
    /**
     * Fetch with an empty query instead of showing the "type N characters"
     * hint, so the picker opens on a useful default list (the attribution
     * form's recent attributable demandes). The fetcher decides what an empty
     * query means; it just gets `''`.
     */
    searchOnEmpty?: boolean;
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
    { minLength = 2, delayMs = 300, searchOnEmpty = false }: UseEntitySearchOptions = {}
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

        // The fetcher receives the NORMALIZED query, never the raw one: staff
        // paste « #1234 » straight out of a modal title, and every route that
        // resolves an id does so with Number(), which NaNs on the « # ».
        const normalized = normalizeSearchQuery(q);
        const isDefaultList = searchOnEmpty && normalized.length === 0;
        if (!isDefaultList && !meetsSearchMinLength(q, minLength)) {
            setResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        // The default list isn't a keystroke, it's an open — debouncing it just
        // makes the popover sit empty for 300ms before showing what it already
        // knows to fetch.
        timerRef.current = setTimeout(async () => {
            const controller = new AbortController();
            controllerRef.current = controller;
            try {
                const items = await fetcherRef.current(normalized, controller.signal);
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
        }, isDefaultList ? 0 : delayMs);
    }, [cancelPending, minLength, delayMs, searchOnEmpty]);

    // Latest-ref for the same reason as `fetcher`: reset() is called from the
    // combobox's open handler, and must not change identity every render.
    const setQueryRef = useRef(setQuery);
    useEffect(() => {
        setQueryRef.current = setQuery;
    });

    const reset = useCallback(() => {
        cancelPending();
        // In default-list mode "reset" means "back to the default list", not
        // "empty" — clearing to nothing would blank the popover on every open.
        if (searchOnEmpty) {
            setQueryRef.current('');
            return;
        }
        setQueryState('');
        setResults([]);
        setIsSearching(false);
    }, [cancelPending, searchOnEmpty]);

    return { query, setQuery, results, isSearching, reset };
}
