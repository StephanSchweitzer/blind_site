import FrontendNavbar from "@/components/Frontend-Navbar";
import Image from "next/image";

export default async function Home() {
    return (
        <main className="min-h-screen relative">
            <FrontendNavbar />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-8">
                {/* Hero Section - First card with welcome text */}
                <section className="text-center glass-card-lg p-12 border-t-4 border-blue-500 dark:border-purple-400">
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-white dark:to-gray-300">
                        Bienvenue sur le site ECA !
                    </h1>
                    <h2 className="text-2xl md:text-3xl font-semibold text-gray-800 dark:text-gray-100">
                        ECA : Enregistrements à la Carte pour les Aveugles
                    </h2>
                </section>

                {/* Full-size banner image - Right after hero section - CENTERED */}
                <section className="relative w-full">
                    <div className="relative w-full overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-200 dark:border-purple-500/30 mx-auto">
                        <Image
                            src="/eca_logo.png"
                            alt="ECA - Enregistrements à la Carte pour les Aveugles"
                            className="w-full h-auto mx-auto hover:scale-105 transition-transform duration-500"
                            width={1024}
                            height={250}
                            priority
                        />
                    </div>
                </section>

                {/* Content Sections */}
                <section className="glass-card p-8 group hover:scale-[1.02] transition-transform duration-300">
                    <p className="text-lg text-gray-700 dark:text-gray-100 leading-relaxed">
                        ECA (Enregistrement à la Carte pour les Aveugles) propose à ses auditeurs un service personnalisé d&apos;enregistrement des livres et documents de leurs choix.
                    </p>
                </section>

                <section className="glass-card p-8 group hover:scale-[1.02] transition-transform duration-300">
                    <p className="text-lg text-gray-700 dark:text-gray-100 leading-relaxed">
                        ECA met en contact des lecteurs bénévoles formés par l&apos;association et des auditeurs déficients visuels qui accèdent ainsi au plaisir de l&apos;écoute des textes qu&apos;ils ont choisis. ECA met aussi à leur disposition les titres de son catalogue. Ainsi se met en place une passerelle humaine et chaleureuse entre voyants et malvoyants.
                    </p>
                </section>

                <section className="glass-card p-8 group hover:scale-[1.02] transition-transform duration-300">
                    <p className="text-lg text-gray-700 dark:text-gray-100 leading-relaxed">
                        C&apos;est donc un service à la carte qui est proposé. Les auditeurs peuvent faire parvenir à ECA tous livres ou documents dont ils souhaitent l&apos;enregistrement vocal que ce soit pour leur divertissement, leurs besoins professionnels ou de formation.
                    </p>
                </section>
            </div>
        </main>
    );
}