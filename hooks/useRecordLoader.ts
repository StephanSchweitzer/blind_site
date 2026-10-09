'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface RecordState<T> {
    /** The record the modal is open on, or null when closed. */
    id: string | null;
    /** Its loaded data; null while the request is in flight. */
    data: T | null;
    error: string | null;
}

const CLOSED = { id: null, data: null, error: null };

/** Thrown by a loader to show its own message in the modal (a 404 is not « réessayez »). */
export class RecordLoadError extends Error {}

/**
 * Open-a-record state for the edit modals: the modal opens on `open(id)` at
 * once, shows its skeleton while `data` is null, and mounts the form only
 * when the record and everything it needs arrived in one go — so no late
 * answer can overwrite what the admin already typed.
 *
 * Each open gets its own AbortController, aborted when the modal closes or
 * another record opens. A response is applied only if its request is still
 * the live one, so clicking row A then row B can never show A's data in B's
 * modal.
 */
export function useRecordLoader<T>(load: (id: string, signal: AbortSignal) => Promise<T>) {
    const [state, setState] = useState<RecordState<T>>(CLOSED);
    const controllerRef = useRef<AbortController | null>(null);
    // Latest loader without making open() change identity on every render.
    const loadRef = useRef(load);
    useEffect(() => {
        loadRef.current = load;
    }, [load]);

    const open = useCallback((id: string) => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setState({ id, data: null, error: null });

        loadRef.current(id, controller.signal)
            .then((data) => {
                if (controllerRef.current !== controller) return;
                setState({ id, data, error: null });
            })
            .catch((err: unknown) => {
                if (controllerRef.current !== controller) return;
                console.error(`Error loading record ${id}:`, err);
                const error = err instanceof RecordLoadError
                    ? err.message
                    : 'Impossible de charger cette fiche. Fermez et réessayez.';
                setState({ id, data: null, error });
            });
    }, []);

    const close = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setState(CLOSED);
    }, []);

    useEffect(() => () => controllerRef.current?.abort(), []);

    return { openId: state.id, data: state.data, error: state.error, open, close };
}
