import FrontendNavbar from "@/components/Frontend-Navbar";
import { Construction, Home } from "lucide-react";
import Link from "next/link";

export default function UnderDevelopmentPage() {
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

                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-12 bg-gray-800 min-h-[80vh] flex flex-col items-center justify-center">
                    <div className="text-center space-y-8">
                        <div className="flex justify-center">
                            <div className="w-24 h-24 bg-amber-500/20 rounded-full flex items-center justify-center">
                                <Construction size={48} className="text-amber-400 animate-pulse" />
                            </div>
                        </div>

                        <h1 className="text-3xl font-bold text-white">Page en cours de développement</h1>

                        <div className="w-24 h-1 bg-amber-500 mx-auto"></div>

                        <p className="text-xl text-gray-100 max-w-md mx-auto">
                            Nous travaillons actuellement sur cette section du site.
                            Revenez bientôt pour découvrir son contenu !
                        </p>

                        <div className="relative pt-8">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="w-full border-t border-gray-600"></div>
                            </div>
                            <div className="relative flex justify-center">
                <span className="bg-gray-800 px-4 text-sm text-gray-400">
                  ECA / Délégation des Auxiliaires des Aveugles
                </span>
                            </div>
                        </div>

                        <div className="pt-4">
                            <Link href="/" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md transition-colors">
                                <Home size={18} />
                                Retour à l&apos;accueil
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}