import FrontendNavbar from "@/components/Frontend-Navbar";
import { getInitialNews } from './data';
import { DernieresInfosClient } from './DernieresInfosClient';
import { PageHeader } from "@/components/PageHeader";

export const metadata = {
    title: 'Dernières Informations',
    description: 'Actualités, événements et informations récentes des ECA - Enregistrements à la Carte pour les Aveugles.',
    alternates: { canonical: '/dernieres-infos' },
};

// Statique, comme le catalogue : la page part du cache et les liens du menu la
// préchargent en entier, sans écran « Chargement… ». Recherche, filtre et page
// sont lus dans le navigateur (hooks/useListUrl.ts) — un `searchParams` lu ici
// la ferait rendre à chaque visite. Le tag `news` la régénère après chaque
// modification ; ce délai n'est qu'un filet.
export const revalidate = 3600;

export default async function DernieresInfoPage() {
    const initialData = await getInitialNews();

    return (
        <div className="flex min-h-screen flex-col">
            <FrontendNavbar />
        <main id="contenu-principal" className="relative flex-1">

            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-8">
                <PageHeader title="Dernières Informations">
                    <p>Restez informé des actualités et des événements</p>
                </PageHeader>

                <DernieresInfosClient initialData={initialData} />
            </div>
        </main>
        </div>
    );
}
