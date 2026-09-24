import { Suspense } from 'react';
import { BooksClient } from './BooksClient';
import FrontendNavbar from "@/components/Frontend-Navbar";
import { getCatalogueData } from './data';
import { PageHeader } from '@/components/PageHeader';

async function getInitialData() {
    try {
        return await getCatalogueData();
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
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-muted"></div>
                <div className="absolute inset-0 animate-spin rounded-full h-16 w-16 border-4 border-transparent border-t-primary"></div>
            </div>
            <p className="mt-6 text-muted-foreground font-medium">Chargement des livres...</p>
        </div>
    );
}

// Pin this segment to static/ISR rendering so the whole page HTML is served from
// cache — not re-rendered on every visit — matching the cached data layer in
// ./data.ts. On-demand `catalogue`-tag invalidation still refreshes it after any
// book/genre write; this revalidate is only a long fallback.
export const revalidate = 3600;

export default async function BooksPage() {
    const { initialBooks, genres, totalBooks, totalPages } = await getInitialData();

    return (
        <div className="flex min-h-screen flex-col">
            <FrontendNavbar />
        <main id="contenu-principal" className="relative flex-1">

            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-8">
                {/* L'en-tête tient en trois lignes : la recherche doit être visible
                    sans défiler, téléphone compris. */}
                <PageHeader title="Catalogue des livres">
                    <p className="text-xl font-semibold text-foreground">
                        {new Intl.NumberFormat('fr-FR').format(totalBooks)} titres au catalogue !
                    </p>
                    <p>
                        Consultez-nous si vous avez une recherche particulière,
                        et faites votre demande au{' '}
                        {/* Both numbers in full and as tel: links: « ou 48 », read aloud
                            or tapped, leads nowhere. */}
                        <a href="tel:+33188323147" className="font-semibold whitespace-nowrap text-primary dark:text-blue-300 underline underline-offset-2">01 88 32 31 47</a>{' '}
                        ou{' '}
                        <a href="tel:+33188323148" className="font-semibold whitespace-nowrap text-primary dark:text-blue-300 underline underline-offset-2">01 88 32 31 48</a>{' '}
                        ou par courriel à{' '}
                        <a href="mailto:ecapermanence@gmail.com" className="font-semibold whitespace-nowrap text-primary dark:text-blue-300 underline underline-offset-2">ecapermanence@gmail.com</a>
                    </p>
                </PageHeader>

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
        </div>
    );
}

export const metadata = {
    title: 'Catalogue des livres',
    description: 'Consultez le catalogue des livres audio disponibles aux ECA pour les auditeurs aveugles et malvoyants.',
    alternates: { canonical: '/catalogue' },
};