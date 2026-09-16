"use client";

import { useEffect, useRef, useState } from 'react';
import { normalizeSearchQuery } from '@/lib/search-query';
import {
    verifyInStages,
    type SearchSuggestion,
    type VocabularyDomain,
} from '@/lib/search-suggestion-types';

/** Candidates a picker verifies, at most — one fetch each. */
const MAX_VERIFIED = 6;

/**
 * Wait this long after the empty result settles before asking. Some pickers
 * only flag « searching » once their own debounce fires, so a query can look
 * empty-and-settled for a moment between keystrokes; this keeps that moment
 * from costing a request.
 */
const SETTLE_MS = 400;

interface Options<T> {
    query: string;
    /** True only once the picker's own search has settled on zero results. */
    active: boolean;
    domains: readonly VocabularyDomain[] | undefined;
    fetcher: (query: string, signal: AbortSignal) => Promise<T[]>;
    /** The fetcher's row cap, so a capped count reads « au moins N ». */
    resultLimit?: number;
}

/**
 * « Vouliez-vous dire … ? » for a picker — the client half of
 * lib/search-suggest.ts.
 *
 * Candidates come from /api/search/suggestions; each is then run through the
 * picker's OWN fetcher, so whatever the picker filters on (attribuable
 * lecteurs, one client's factures) is respected, and only candidates that
 * find something are shown. Nothing runs until the picker has already found
 * nothing.
 *
 * The result is keyed on the query: a stale answer for an older query is
 * never returned, without having to clear state inside the effect.
 */
export function useVerifiedSuggestions<T>({
    query,
    active,
    domains,
    fetcher,
    resultLimit,
}: Options<T>): SearchSuggestion[] {
    const normalized = normalizeSearchQuery(query);
    const key = active && domains && domains.length > 0 && normalized ? `${domains.join(',')}|${normalized}` : '';
    const [state, setState] = useState<{ key: string; suggestions: SearchSuggestion[] }>({
        key: '',
        suggestions: [],
    });

    const fetcherRef = useRef(fetcher);
    useEffect(() => {
        fetcherRef.current = fetcher;
    });

    useEffect(() => {
        if (!key) return;
        const controller = new AbortController();
        const { signal } = controller;

        const timer = setTimeout(() => void (async () => {
            const params = new URLSearchParams({ q: normalized, domains: domains!.join(',') });
            const res = await fetch(`/api/search/suggestions?${params.toString()}`, { signal });
            if (!res.ok) return;
            const candidates: SearchSuggestion[] = await res.json();
            const suggestions = await verifyInStages(candidates.slice(0, MAX_VERIFIED), async (query) => {
                try {
                    const rows = await fetcherRef.current(query, signal);
                    return { count: rows.length, atLeast: resultLimit !== undefined && rows.length >= resultLimit };
                } catch {
                    return { count: 0 };
                }
            });
            if (!signal.aborted) setState({ key, suggestions });
        })().catch(() => {
            // Aborted or offline: no suggestion is the right outcome.
        }), SETTLE_MS);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
        // `normalized` and `domains` are folded into `key`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, resultLimit]);

    return state.key === key ? state.suggestions : [];
}
