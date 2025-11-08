import FrontendNavbar from "@/components/Frontend-Navbar";
import { Construction, Home } from "lucide-react";
import Link from "next/link";

export default function UnderDevelopmentPage() {
    return (
        <main className="min-h-screen relative">
            <FrontendNavbar />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 min-h-[80vh] flex flex-col items-center justify-center">
                <div className="glass-card-lg p-12 text-center space-y-8 max-w-2xl">
                    <div className="flex justify-center">
                        <div className="w-24 h-24 bg-amber-500/20 rounded-full flex items-center justify-center">
                            <Construction size={48} className="text-amber-600 dark:text-amber-400 animate-pulse" />
                        </div>
                    </div>

                    <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Page en cours de développement</h1>

                    <div className="w-24 h-1 bg-amber-500 mx-auto"></div>

                    <p className="text-xl text-gray-700 dark:text-gray-100">
                        Nous travaillons actuellement sur cette section du site.
                        Revenez bientôt pour découvrir son contenu !
                    </p>

                    <div className="relative pt-8">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                        </div>
                        <div className="relative flex justify-center">
                            <span className="bg-white dark:bg-gray-800 px-4 text-sm text-gray-500 dark:text-gray-400">
                                ECA / Délégation des Auxiliaires des Aveugles
                            </span>
                        </div>
                    </div>

                    <div className="pt-4">
                        <Link href="/" className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium py-3 px-8 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105">
                            <Home size={18} />
                            Retour à l&apos;accueil
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    );
}