'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileAudio } from 'lucide-react';
import { BookAudioModal } from '@/admin/BookAudioModal';

interface BookAudioButtonProps {
    bookId: number;
    /** Only for the accessible name — the dialogue fetches its own title. */
    bookTitle?: string | null;
    /** Fires after any change, so a parent list can refresh its cached counters. */
    onChanged?: () => void;
    size?: 'sm' | 'default';
    className?: string;
}

/**
 * The one way into the audio editor.
 *
 * Lives next to a book wherever a book appears — its own form, the demande it
 * belongs to, the attribution that carries it — so an admin never has to go
 * back to the catalogue to reach the recordings. It carries its own dialogue
 * state: callers drop it in and pass a book id, nothing else.
 *
 * Radix stacks the dialogue above whichever modal hosts the button, and Escape
 * closes only the top one, so opening it from inside a demande does not lose
 * the form underneath.
 */
export function BookAudioButton({
    bookId,
    bookTitle,
    onChanged,
    size = 'default',
    className,
}: BookAudioButtonProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size={size}
                onClick={() => setIsOpen(true)}
                aria-label={
                    bookTitle
                        ? `Ouvrir l’éditeur audio de « ${bookTitle} »`
                        : 'Ouvrir l’éditeur audio'
                }
                className={`bg-field border-border text-foreground hover:bg-muted ${className ?? ''}`}
            >
                <span className="flex items-center gap-2">
                    <FileAudio className="h-4 w-4" />
                    Ouvrir l’éditeur audio
                </span>
            </Button>

            {/* Mounted only while open: the dialogue fetches on mount. */}
            {isOpen && (
                <BookAudioModal
                    isOpen={isOpen}
                    onOpenChange={setIsOpen}
                    bookId={bookId}
                    onChanged={onChanged}
                />
            )}
        </>
    );
}
