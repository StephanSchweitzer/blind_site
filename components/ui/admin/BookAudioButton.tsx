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
import { useDelayedFlag } from '@/components/ui/inline-loading';

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
    /** Grey out and refuse to open — a soft-deleted book's fiche is read-only until restored. */
    disabled?: boolean;
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
    disabled = false,
}: BookAudioButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [state, setState] = useState<AudioState | null>(
        audioLinkStatus ? { status: audioLinkStatus, trackCount: audioTrackCount ?? null } : null,
    );

    const [failed, setFailed] = useState(false);

    const loadState = useCallback(async () => {
        try {
            const res = await fetch(`/api/books/${bookId}/audio/state`);
            if (!res.ok) throw new Error(String(res.status));
            const d = await res.json();
            setState({ status: d.status as AudioLinkStatus, trackCount: d.trackCount ?? null });
        } catch {
            // A badge that failed to load simply stays neutral; the button works.
            setFailed(true);
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

    // A state the caller supplies after mount (it may load it alongside ours) wins.
    const known = audioLinkStatus ? { status: audioLinkStatus, trackCount: audioTrackCount ?? null } : state;
    // The badge keeps its place while the state loads, so the button doesn't
    // grow under the pointer when it arrives.
    const checking = !known && !failed;
    const showChecking = useDelayedFlag(checking);
    const status = known?.status ?? AudioLinkStatus.UNVERIFIED;
    const missing = known != null && audioLinkStatusIsMissing(status);
    const label = getAudioLinkStatusLabel(status);

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size={size}
                disabled={disabled}
                onClick={() => setIsOpen(true)}
                aria-label={
                    bookTitle
                        ? `Ouvrir l’éditeur audio de « ${bookTitle} » — ${label}`
                        : `Ouvrir l’éditeur audio — ${label}`
                }
                title={missing ? `${label} — ${getAudioLinkStatusHint(status)}` : label}
                // Peut passer sur deux lignes : sur un téléphone, une colonne de
                // formulaire fait ~220 px et « Ouvrir l'éditeur audio » + « Pas
                // d'audio associé » n'y tiennent pas — le bouton, insécable par
                // défaut, débordait du modal. La hauteur minimale reste celle du
                // bouton d'origine, donc rien ne change là où tout tient.
                className={`h-auto max-w-full whitespace-normal py-1.5 ${size === 'sm' ? 'min-h-9' : 'min-h-10'} ${
                    known ? getAudioLinkStatusButtonColor(status) : 'bg-field border-border text-foreground hover:bg-muted'
                } ${className ?? ''}`}
            >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {missing ? <FileX2 className="h-4 w-4" /> : <FileAudio className="h-4 w-4" />}
                    Ouvrir l’éditeur audio
                    {/* Spelled out, not just colour-coded: the absence of a
                        recording is the thing people come here to find out. */}
                    {known && (
                        <span className="whitespace-nowrap rounded bg-black/5 px-1.5 py-0.5 text-xs font-medium dark:bg-white/10">
                            {missing
                                ? label
                                : `${known.trackCount ?? 0} piste${(known.trackCount ?? 0) > 1 ? 's' : ''}`}
                        </span>
                    )}
                    {checking && (
                        <span
                            className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${
                                showChecking ? 'bg-black/5 text-muted-foreground dark:bg-white/10' : 'invisible'
                            }`}
                        >
                            Vérification…
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
