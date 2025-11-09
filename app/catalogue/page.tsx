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
            <div className="relative">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 dark:border-purple-900"></div>
                <div className="absolute inset-0 animate-spin rounded-full h-16 w-16 border-4 border-transparent border-t-blue-600 dark:border-t-purple-400"></div>
            </div>
            <p className="mt-6 text-gray-700 dark:text-gray-300 font-medium animate-pulse">Chargement des livres...</p>
        </div>
    );
}

export default async function BooksPage() {
    const { initialBooks, genres, totalBooks, totalPages } = await getInitialData();

    return (
        <main className="min-h-screen relative">
            <FrontendNavbar />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-8">
                <section className="text-center glass-card-lg p-12 animate-fade-in relative overflow-hidden group">
                    {/* Decorative gradient orbs */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-400/20 dark:bg-purple-500/20 rounded-full blur-3xl animate-blob"></div>
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-400/20 dark:bg-blue-500/20 rounded-full blur-3xl animate-blob animation-delay-2000"></div>

                    <div className="relative z-10">
                        <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4 tracking-tight">
                            Catalogue des livres
                        </h1>
                        <div className="w-24 h-1.5 bg-gradient-to-r from-blue-500 to-purple-600 dark:from-blue-400 dark:to-purple-400 rounded-full mx-auto mb-6"></div>
                        <p className="text-lg text-gray-700 dark:text-gray-100 leading-relaxed max-w-2xl mx-auto">
                            <span className="font-semibold text-xl text-blue-600 dark:text-purple-400">
                                {totalBooks} titres au catalogue !
                            </span>
                            <br />
                            <span className="text-base mt-2 block">
                                Consultez-nous si vous avez une recherche particulière,
                                et commandez au <span className="font-semibold whitespace-nowrap">01 88 32 31 47</span> ou 48
                            </span>
                            <br />
                            <span className="text-base">
                                ou par courriel à {' '}
                                <a
                                    href="mailto:ecapermanence@gmail.com"
                                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline font-medium
                                        hover:scale-105 inline-block transition-all duration-300"
                                >
                                    ecapermanence@gmail.com
                                </a>
                            </span>
                        </p>
                    </div>
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