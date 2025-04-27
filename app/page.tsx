import FrontendNavbar from "@/components/Frontend-Navbar";

export default async function Home() {
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
                        <h1 className="text-3xl font-bold mb-4 text-white">Bienvenue sur le site ECA !</h1>
                        <h2 className="text-2xl font-semibold mb-2 text-gray-100">ECA : Enregistrements à la Carte pour les Aveugles</h2>
                    </section>

                    <section className="space-y-6">
                        <p className="text-lg text-gray-100">
                            ECA (Enregistrement à la Carte pour les Aveugles) propose à ses auditeurs un service personnalisé d&apos;enregistrement des livres et documents de leurs choix.
                        </p>
                    </section>

                    <section className="space-y-6">
                        <p className="text-lg text-gray-100">
                            ECA met en contact des lecteurs bénévoles formés par l&apos;association et des auditeurs déficients visuels qui accèdent ainsi au plaisir de l&apos;écoute des textes qu&apos;ils ont choisis. ECA met aussi à leur disposition les titres de son catalogue. Ainsi se met en place une passerelle humaine et chaleureuse entre voyants et malvoyants.
                        </p>
                    </section>

                    <section className="space-y-6">
                        <p className="text-lg text-gray-100">
                            C&apos;est donc un service à la carte qui est proposé. Les auditeurs peuvent faire parvenir à ECA tous livres ou documents dont ils souhaitent l&apos;enregistrement vocal que ce soit pour leur divertissement, leurs besoins professionnels ou de formation.
                        </p>
                    </section>
                </div>
            </div>
        </main>
    );
}