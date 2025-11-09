import React from 'react';
import { AudioPlayer } from '@/coups-de-coeur/AudioPlayer';
import { BookList } from '@/coups-de-coeur/BookList';
import type { Book, CoupDeCoeur } from '@/types/coups-de-coeur';

interface CoupDeCoeurListProps {
    content: CoupDeCoeur[];
    onBookClick: (book: Book) => void;
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
            className={`
                bg-white/90 dark:bg-gray-800/95 
                backdrop-blur-xl backdrop-saturate-150
                rounded-2xl 
                shadow-[0_20px_70px_rgb(0,0,0,0.15)] dark:shadow-[0_25px_80px_rgb(0,0,0,0.6)]
                border-2 border-gray-200/50 dark:border-gray-600/60
                overflow-hidden 
                transform transition-all duration-500 ease-out
                hover:shadow-[0_25px_80px_rgb(59,130,246,0.2)] dark:hover:shadow-[0_30px_90px_rgb(147,51,234,0.4)]
                hover:scale-[1.01]
                hover:border-blue-300/50 dark:hover:border-purple-400/70
                relative
                ${isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
            `}
        >
            {/* Decorative gradient orbs */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-400/10 dark:bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-400/10 dark:bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="p-8 relative z-10">
                <div className="mb-6">
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 tracking-tight">
                        {content[0].title}
                    </h2>
                    <div className="w-20 h-1 bg-gradient-to-r from-blue-500 to-purple-600 dark:from-blue-400 dark:to-purple-400 rounded-full"></div>
                </div>

                <div className="mb-8 p-4 rounded-xl bg-gray-100 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30 shadow-sm">
                    <AudioPlayer
                        key={`audio-${content[0].audioPath}`}
                        src={content[0].audioPath}
                        title={content[0].title}
                    />
                </div>

                <div className="mb-8 p-5 rounded-xl bg-gray-100 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30 shadow-sm">
                    <p className="text-gray-800 dark:text-gray-200 leading-relaxed text-base">
                        {content[0].description}
                    </p>
                </div>

                <BookList
                    books={content[0].books}
                    onBookClick={onBookClick}
                />
            </div>
        </div>
    );
};