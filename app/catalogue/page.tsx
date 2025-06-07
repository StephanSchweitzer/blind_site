// app/books/page.tsx
import { Suspense } from 'react';
import { BooksClient } from './BooksClient';
import FrontendNavbar from "@/components/Frontend-Navbar";
import { prisma } from '@/lib/prisma';

export const revalidate = 300;

// This runs on the server
async function getInitialData() {
    try {
        const [books, genres, totalBooks] = await Promise.all([
            // Get first page of books
            prisma.book.findMany({
                include: {
                    genres: {
                        include: { genre: true }
                    }
                },
                take: 9,
                orderBy: { createdAt: 'desc' }
            }),
            // Get all genres
            prisma.genre.findMany({
                orderBy: { name: 'asc' }
            }),
            // Get total count
            prisma.book.count()
        ]);

        console.log(prisma.book.count())

        return {
            initialBooks: books,
            genres,
            totalBooks,
            totalPages: Math.ceil(totalBooks / 9)
        };
    } catch (error) {
        console.error('Error fetching initial data:', error);
        return {
            initialBooks: [],
            genres: [],
            totalBooks: 0,
            totalPages: 0
        };
    }
}

// Loading component
function BooksLoading() {
    return (
        <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
            <p className="mt-4 text-gray-300">Chargement des livres...</p>
        </div>
    );
}

// Server Component
export default async function BooksPage() {
    const { initialBooks, genres, totalBooks, totalPages } = await getInitialData();

    return (
        <main className="min-h-screen relative bg-gray-900">
            <div className="hidden lg:block fixed inset-y-0 w-full">
                <div className="h-full max-w-6xl mx-auto">
                    <div className="h-full flex">
                        <div className="w-16 h-full bg-gradient-to-r from-transparent to-gray-800"></div>
                        <div className="flex-1"></div>
                        <div className="w-16 h-full bg-gradient-to-l from-transparent to-gray-800"></div>
                    </div>
                </div>
            </div>

            <div className="relative">
                <FrontendNavbar />

                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-8 bg-gray-800">
                    <section className="text-center space-y-4">
                        <h1 className="text-3xl font-bold text-gray-100">Catalogue des livres</h1>
                        <p className="text-lg text-gray-300">
                            <span className="font-semibold">
                                {totalBooks} titres au catalogue !
                            </span>
                            <br />
                            Consultez-nous si vous avez une recherche particulière,
                            et commandez au <span className="whitespace-nowrap">01 88 32 31 47</span> ou 48
                            <br />
                            ou par courriel à{' '}
                            <a href="mailto:ecapermanence@gmail.com" className="text-blue-400 hover:text-blue-300">
                                ecapermanence@gmail.com
                            </a>{' '}
                        </p>
                    </section>

                    <Suspense fallback={<BooksLoading />}>
                        <BooksClient
                            initialBooks={initialBooks}
                            genres={genres}
                            totalBooks={totalBooks}
                            totalPages={totalPages}
                        />
                    </Suspense>
                </div>
            </div>
        </main>
    );
}

// Optional: Add metadata for SEO
export const metadata = {
    title: 'Catalogue des livres',
    description: 'Consultez notre catalogue de livres disponibles',
};