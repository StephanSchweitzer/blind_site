import React from 'react';
import { AudioPlayer } from '@/listes-de-livres/AudioPlayer';
import { BookList } from '@/listes-de-livres/BookList';
import type { CoupDeCoeur } from '@/types/coups-de-coeur';
import type { PublicBook } from '@/lib/books/publicBook';
import { Dos } from '@/components/Dos';

interface CoupDeCoeurListProps {
    content: CoupDeCoeur[];
    onBookClick: (book: PublicBook) => void;
    isTransitioning: boolean;
}

export const CoupDeCoeurList: React.FC<CoupDeCoeurListProps> = ({
                                                                    content,
                                                                    onBookClick,
                                                                    isTransitioning
                                                                }) => {
    if (!content.length) return null;

    return (
        <div
            className={`relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}
        >

            {/* p-5 on a phone: at 375 px, p-8 left the audio player's three buttons
                8 px short of one line. */}
            <div className="p-5 sm:p-8 relative z-10">
                <div className="mb-6">
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 tracking-tight">
                        {content[0].title}
                    </h2>
                    <Dos />
                </div>

                {content[0].audioPath && (
                    <div className="mb-8 p-4 rounded-xl bg-gray-100 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30 shadow-sm">
                        <AudioPlayer
                            key={`audio-${content[0].audioPath}`}
                            src={content[0].audioPath}
                            title={content[0].title}
                        />
                    </div>
                )}

                {content[0].description && (
                    <div className="mb-8 p-5 rounded-xl bg-gray-100 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30 shadow-sm">
                        <p className="text-gray-800 dark:text-gray-200 leading-relaxed text-base">
                            {content[0].description}
                        </p>
                    </div>
                )}

                <BookList
                    books={content[0].books}
                    onBookClick={onBookClick}
                />
            </div>
        </div>
    );
};