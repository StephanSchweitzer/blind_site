"use client";

import { useCallback, useRef, useState } from "react";

export interface RecordingCheckResult {
    activeRecordingCount: number;
    orders: {
        id: number;
        aveugle: { name: string | null } | null;
        status: { name: string } | null;
    }[];
}

/**
 * Looks up whether a book already has ACTIVE "enregistrement nécessaire" demande(s)
 * (`GET /api/orders/recording-check`). Results are cached per book so re-checks
 * during a form session are free.
 */
export function useRecordingCheck() {
    const cache = useRef<Map<string, RecordingCheckResult>>(new Map());
    const [byBook, setByBook] = useState<Record<number, RecordingCheckResult>>({});

    const check = useCallback(
        async (bookId: number, excludeOrderId?: number): Promise<RecordingCheckResult | null> => {
            if (!bookId) return null;
            const key = `${bookId}:${excludeOrderId ?? ""}`;
            const cached = cache.current.get(key);
            if (cached) {
                setByBook((prev) => ({ ...prev, [bookId]: cached }));
                return cached;
            }
            try {
                const qs = new URLSearchParams({ bookId: String(bookId) });
                if (excludeOrderId) qs.set("excludeOrderId", String(excludeOrderId));
                const res = await fetch(`/api/orders/recording-check?${qs.toString()}`);
                if (!res.ok) return null;
                const data: RecordingCheckResult = await res.json();
                cache.current.set(key, data);
                setByBook((prev) => ({ ...prev, [bookId]: data }));
                return data;
            } catch {
                return null;
            }
        },
        []
    );

    /** Latest known result for a book (or null if not yet checked). */
    const getFor = useCallback(
        (bookId: number | null | undefined): RecordingCheckResult | null =>
            bookId ? byBook[bookId] ?? null : null,
        [byBook]
    );

    return { check, getFor };
}
