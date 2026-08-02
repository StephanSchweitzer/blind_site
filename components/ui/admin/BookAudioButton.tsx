'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileAudio, FileX2 } from 'lucide-react';
import { BookAudioModal } from '@/admin/BookAudioModal';
import {
    AudioLinkStatus,
    audioLinkStatusIsMissing,
    getAudioLinkStatusButtonColor,
    getAudioLinkStatusHint,
    getAudioLinkStatusLabel,
} from '@/lib/audio-enums';

interface BookAudioButtonProps {
    bookId: number;
    /** Only for the accessible name — the dialogue fetches its own title. */
    bookTitle?: string | null;
    /** Fires after any change, so a parent list can refresh its cached counters. */
    onChanged?: () => void;
    /**
     * Known audio state, when the caller already has it. Omitted, the button
     * asks for it itself — see the fetch below.
     */
    audioLinkStatus?: AudioLinkStatus | null;
    audioTrackCount?: number | null;
    size?: 'sm' | 'default';
    className?: string;
}

interface AudioState {
    status: AudioLinkStatus;
    trackCount: number | null;
}

/**
 * The one way into the audio editor — and the sign that there is nothing in it.
 *
 * Lives next to a book wherever a book appears — its own form, the demande it
 * belongs to, the attribution that carries it — so an admin never has to go
 * back to the catalogue to reach the recordings. It carries its own dialogue
 * state: callers drop it in and pass a book id, nothing else.
 *
 * That last part is why it fetches its own status rather than taking it as a
 * required prop: "this book has no audio" has to be readable *without* opening
 * the dialogue, and it would otherwise have to be threaded through three
 * unrelated forms. /audio/state reads cached columns only — no bucket call.
 *
 * Radix stacks the dialogue above whichever modal hosts the button, and Escape
 * closes only the top one, so opening it from inside a demande does not lose
 * the form underneath.
 */
export function BookAudioButton({
    bookId,
    bookTitle,
    onChanged,
    audioLinkStatus,
    audioTrackCount,
    size = 'default',
    className,
}: BookAudioButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [state, setState] = useState<AudioState | null>(
        audioLinkStatus ? { status: audioLinkStatus, trackCount: audioTrackCount ?? null } : null,
    );

    const loadState = useCallback(async () => {
        try {
            const res = await fetch(`/api/books/${bookId}/audio/state`);
            if (!res.ok) return;
            const d = await res.json();
            setState({ status: d.status as AudioLinkStatus, trackCount: d.trackCount ?? null });
        } catch {
            // A badge that failed to load simply stays neutral; the button works.
        }
    }, [bookId]);

    // Fetch once per book, and only when the caller didn't supply the state.
    // Tracked in a ref rather than state: it is bookkeeping about whether a
    // fetch was kicked off, not something rendered.
    const fetchedForRef = useRef<number | null>(null);
    useEffect(() => {
        if (audioLinkStatus) return;
        if (fetchedForRef.current === bookId) return;
        fetchedForRef.current = bookId;
        void loadState();
    }, [bookId, audioLinkStatus, loadState]);

    const status = state?.status ?? AudioLinkStatus.UNVERIFIED;
    const missing = state != null && audioLinkStatusIsMissing(status);
    const label = getAudioLinkStatusLabel(status);

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size={size}
                onClick={() => setIsOpen(true)}
                aria-label={
                    bookTitle
                        ? `Ouvrir l’éditeur audio de « ${bookTitle} » — ${label}`
                        : `Ouvrir l’éditeur audio — ${label}`
                }
                title={missing ? `${label} — ${getAudioLinkStatusHint(status)}` : label}
                className={`${
                    state ? getAudioLinkStatusButtonColor(status) : 'bg-field border-border text-foreground hover:bg-muted'
                } ${className ?? ''}`}
            >
                <span className="flex items-center gap-2">
                    {missing ? <FileX2 className="h-4 w-4" /> : <FileAudio className="h-4 w-4" />}
                    Ouvrir l’éditeur audio
                    {/* Spelled out, not just colour-coded: the absence of a
                        recording is the thing people come here to find out. */}
                    {state && (
                        <span className="rounded bg-black/5 px-1.5 py-0.5 text-xs font-medium dark:bg-white/10">
                            {missing
                                ? label
                                : `${state.trackCount ?? 0} piste${(state.trackCount ?? 0) > 1 ? 's' : ''}`}
                        </span>
                    )}
                </span>
            </Button>

            {/* Mounted only while open: the dialogue fetches on mount. */}
            {isOpen && (
                <BookAudioModal
                    isOpen={isOpen}
                    onOpenChange={setIsOpen}
                    bookId={bookId}
                    onChanged={() => {
                        void loadState();
                        onChanged?.();
                    }}
                />
            )}
        </>
    );
}
