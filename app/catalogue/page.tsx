import { Suspense } from 'react';
import { BooksClient } from './BooksClient';
import FrontendNavbar from "@/components/Frontend-Navbar";
import { prisma } from '@/lib/prisma';

export const revalidate = 300;

async function getInitialData() {
    try {
        const [books, genres, totalBooks] = await Promise.all([
            prisma.book.findMany({
                include: {
                    genres: {
                        include: { genre: true }
                    }
                },
                take: 9,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.genre.findMany({
                orderBy: { name: 'asc' }
            }),
            prisma.book.count()
        ]);

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

function BooksLoading() {
    return (
        <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
            <p className="mt-4 text-gray-700 dark:text-gray-300">Chargement des livres...</p>
        </div>
    );
}

export default async function BooksPage() {
    const { initialBooks, genres, totalBooks, totalPages } = await getInitialData();

    return (
        <main className="min-h-screen relative">
            <FrontendNavbar />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-8">
                <section className="text-center glass-card-lg p-12">
                    <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Catalogue des livres</h1>
                    <p className="text-lg text-gray-700 dark:text-gray-100">
                        <span className="font-semibold">
                            {totalBooks} titres au catalogue !
                        </span>
                        <br />
                        Consultez-nous si vous avez une recherche particulière,
                        et commandez au <span className="whitespace-nowrap">01 88 32 31 47</span> ou 48
                        <br />
                        ou par courriel à {' '}
                        <a href="mailto:ecapermanence@gmail.com" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline">
                            ecapermanence@gmail.com
                        </a>
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
        </main>
    );
}

export const metadata = {
    title: 'Catalogue des livres',
    description: 'Consultez notre catalogue de livres disponibles',
};