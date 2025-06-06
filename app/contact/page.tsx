import FrontendNavbar from "@/components/Frontend-Navbar";

export default async function Contact() {
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

                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-12 bg-gray-800">
                    <section className="text-center">
                        <h1 className="text-3xl font-bold mb-4 text-gray-100">Coordonnées</h1>
                    </section>

                    <section className="space-y-6">
                        <div className="text-gray-100 space-y-4">
                            <p className="font-bold text-xl" style={{color: '#FFF5EE'}}>
                                ECA – Enregistrements à la Carte pour les Aveugles/
                            </p>
                            <p className="font-bold text-xl mb-6" style={{color: '#FFF5EE'}}>
                                Délégation des Auxiliaires des Aveugles.
                            </p>

                            <div className="space-y-2">
                                <p>71, avenue de Breteuil, 75015 Paris</p>

                                <p className="font-bold">
                                    Tel : + 33 1 88 32 31 47 ou + 33 1 88 32 31 48
                                </p>

                                <p>Courriel : <a href="mailto:ecapermanence@gmail.com"
                                                 className="text-blue-400 hover:text-blue-300">
                                    ecapermanence@gmail.com
                                </a></p>
                            </div>

                            <div className="space-y-2 mt-6">
                                <p className="font-bold">Permanences : Mardi de 9 h à 17 h, Jeudi de 9 h à 14 h</p>
                            </div>

                            <div className="space-y-2 mt-6">
                                <p><span className="font-semibold">Métro :</span> Duroc (ligne 10 ou 13), Ségur (ligne
                                    10), Sèvres-Lecourbe (ligne 6)</p>
                                <p><span className="font-semibold">Autobus :</span> 92, 82, 89, 28, 70</p>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}