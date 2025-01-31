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
            className={`bg-gray-900 rounded-lg shadow-lg overflow-hidden transform transition-all duration-300 ease-in-out
                ${isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
                hover:shadow-xl hover:scale-[1.02]`}
        >
            <div className="p-6">
                <h2 className="text-2xl font-bold mb-4 text-white transition-colors duration-300 hover:text-blue-400">
                    {content[0].title}
                </h2>

                <div className="mb-6 transition-transform duration-300 hover:translate-y-1">
                    <AudioPlayer
                        key={`audio-${content[0].audioPath}`}
                        src={content[0].audioPath}
                        title={content[0].title}
                    />
                </div>

                <p className="mb-6 text-white leading-relaxed transition-colors duration-300 hover:text-gray-100">
                    {content[0].description}
                </p>

                <BookList
                    books={content[0].books}
                    onBookClick={onBookClick}
                />
            </div>
        </div>
    );
};