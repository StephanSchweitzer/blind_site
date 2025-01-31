// PDFContent.tsx
import React, { forwardRef } from 'react';
import type { Book, CoupDeCoeur } from '@/types/coups-de-coeur';
import { groupBy } from 'lodash';

interface PDFContentProps {
    content: CoupDeCoeur[];
}

export const PDFContent = forwardRef<HTMLDivElement, PDFContentProps>(({ content }, ref) => {
    const groupBooksByGenre = (books: { book: Book }[]) => {
        const booksWithGenres = books.map(({ book }) => {
            const genreNames = book.genres?.length
                ? book.genres.map(g => g.genre?.name).filter(Boolean).sort()
                : ['Sans genre'];
            return { ...book, genreNames };
        });
        return Object.entries(groupBy(booksWithGenres, book => book.genreNames[0] || 'Sans genre'))
            .sort(([a], [b]) => a.localeCompare(b));
    };

    if (!content.length) return null;

    return (
        <div
            ref={ref}
            className="bg-white text-black p-8 max-w-4xl mx-auto"
            style={{ position: 'fixed', left: '-9999px', top: 0, width: '800px' }}
        >
            <div className="text-center mb-8">
                <h1 className="text-2xl font-bold mb-2">ECA: Enregistrements à la Carte pour les Aveugles</h1>
                <h2 className="text-xl font-semibold">Coup de coeur : {content[0].title}</h2>
            </div>
            <div className="text-lg mb-8">
                {content[0].description}
            </div>
            <div className="space-y-6">
                {groupBooksByGenre(content[0].books).map(([genre, books]) => (
                    <div key={genre} className="border-t border-gray-300 pt-4">
                        <h3 className="text-xl font-semibold mb-4">{genre}</h3>
                        <div className="space-y-4">
                            {books.map((book) => (
                                <div key={book.id} className="pl-4">
                                    <div className="font-bold">{book.title}</div>
                                    <div className="italic">{book.author}</div>
                                    {book.description && (
                                        <p className="mt-2">{book.description}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-8 text-center text-sm text-gray-600">
                À commander au 01 88 32 31 47 ou 48
                <br />
                ou par courriel à ecapermanence@gmail.com
            </div>
        </div>
    );
});

PDFContent.displayName = 'PDFContent';