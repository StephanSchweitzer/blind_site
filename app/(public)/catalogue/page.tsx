import { Suspense } from 'react';
import { BooksClient } from './BooksClient';
import FrontendNavbar from "@/components/Frontend-Navbar";
import { getCatalogueData } from './data';
import { PageHeader } from '@/components/PageHeader';
import { degradeOnReadError } from '@/lib/isr-read-error';
import { publicPageMetadata } from '@/lib/seo';
import { getSiteContact } from '../contact/data';
import { DemandeContact } from '@/components/DemandeContact';

async function getInitialData() {
    try {
        return await getCatalogueData();
    } catch (error) {
        console.error('Error fetching initial data:', error);
        // Un catalogue vide rendu ici serait mis en cache pour un jour : en
        // production on jette, et la dernière bonne version reste servie. Le
        // repli vide ne sert qu'au build (et en dev). Voir lib/isr-read-error.ts.
        if (!degradeOnReadError()) throw error;
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
export const revalidate = 86400;

export default async function BooksPage() {
    const [{ initialBooks, genres, totalBooks, totalPages }, contact] = await Promise.all([
        getInitialData(),
        getSiteContact().catch((error) => {
            console.error('Coordonnées du catalogue indisponibles :', error);
            if (!degradeOnReadError()) throw error;
            return null;
        }),
    ]);

    return (
        <div className="flex min-h-screen flex-col">
            <FrontendNavbar />
        <main id="contenu-principal" className="relative flex-1">

            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-8">
                {/* L'en-tête tient en trois lignes : la recherche doit être visible
                    sans défiler, téléphone compris. */}
                <PageHeader title="Catalogue des livres">
                    <p className="text-xl font-semibold text-foreground">
                        {new Intl.NumberFormat('fr-FR').format(totalBooks)} titres au catalogue&nbsp;!
                    </p>
                    {contact && (
                        <p>
                            Consultez-nous si vous avez une recherche particulière,
                            et faites votre demande au{' '}
                            <DemandeContact phones={contact.phones} email={contact.email} />
                        </p>
                    )}
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

export const metadata = publicPageMetadata({
    title: 'Catalogue des livres',
    description: 'Consultez le catalogue des livres audio disponibles aux ECA pour les auditeurs aveugles et malvoyants.',
    path: '/catalogue',
});