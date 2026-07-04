import FrontendNavbar from "@/components/Frontend-Navbar";
import { getInitialNews } from './data';
import { DernieresInfosClient } from './DernieresInfosClient';

export const metadata = {
    title: 'Dernières Informations',
    description: 'Restez informé des actualités et des événements',
};

export default async function DernieresInfoPage() {
    const initialData = await getInitialNews();

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
                            Dernières Informations
                        </h1>
                        <div className="w-24 h-1.5 bg-gradient-to-r from-blue-500 to-purple-600 dark:from-blue-400 dark:to-purple-400 rounded-full mx-auto mb-6"></div>
                        <p className="text-lg text-gray-700 dark:text-gray-100">
                            Restez informé des actualités et des événements
                        </p>
                    </div>
                </section>

                <DernieresInfosClient initialData={initialData} />
            </div>
        </main>
    );
}
