import FrontendNavbar from "@/components/Frontend-Navbar";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: 'ECA - Enregistrements à la Carte pour les Aveugles',
    description: "Les ECA proposent aux personnes aveugles et malvoyantes un service gratuit d'enregistrement à la carte de livres et documents, lus par des bénévoles.",
    alternates: { canonical: '/' },
};

const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NGO',
    name: 'ECA - Enregistrements à la Carte pour les Aveugles',
    alternateName: 'Délégation des Auxiliaires des Aveugles',
    url: 'https://eca-aveugles.fr',
    logo: 'https://eca-aveugles.fr/eca_logo.png',
    description: "Service gratuit d'enregistrement à la carte de livres et documents pour les personnes aveugles et malvoyantes, réalisé par des lecteurs bénévoles.",
    areaServed: 'FR',
    availableLanguage: 'fr',
};

export default async function Home() {
    return (
        <div className="flex min-h-screen flex-col">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
            />
            <FrontendNavbar />
        <main id="contenu-principal" className="relative flex-1">

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-8">
                {/* Hero Section - First card with welcome text */}
                <section className="text-center glass-card-lg p-8 sm:p-12 border-t-4 border-blue-500 dark:border-purple-400">
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
                        Les ECA (Enregistrements à la Carte pour les Aveugles) proposent à leurs auditeurs un service personnalisé d&apos;enregistrement des livres et documents de leurs choix.
                    </p>
                </section>

                <section className="glass-card p-8 group hover:scale-[1.02] transition-transform duration-300">
                    <p className="text-lg text-gray-700 dark:text-gray-100 leading-relaxed">
                        Les ECA mettent en contact des lecteurs bénévoles formés par l&apos;association et des auditeurs déficients visuels qui accèdent ainsi au plaisir de l&apos;écoute des textes qu&apos;ils ont choisis. Les ECA mettent aussi à leur disposition les titres du catalogue. Ainsi se met en place une passerelle humaine et chaleureuse entre voyants et malvoyants.
                    </p>
                </section>

                <section className="glass-card p-8 group hover:scale-[1.02] transition-transform duration-300">
                    <p className="text-lg text-gray-700 dark:text-gray-100 leading-relaxed">
                        C&apos;est donc un service à la carte qui est proposé. Les auditeurs peuvent faire parvenir aux ECA tous livres ou documents dont ils souhaitent l&apos;enregistrement vocal que ce soit pour leur divertissement, leurs besoins professionnels ou de formation.
                    </p>
                </section>
            </div>
        </main>
        </div>
    );
}