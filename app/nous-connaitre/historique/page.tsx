import FrontendNavbar from "@/components/Frontend-Navbar";
import { Calendar, Bookmark, Award, BookOpen, Archive, FileText, Heart, Users } from "lucide-react";

interface HistoryEvent {
    year: string;
    title: string;
    description: string;
    icon: React.ReactNode;
}

export default async function HistoriquePage() {
    const historyEvents: HistoryEvent[] = [
        {
            year: "1985",
            title: "Création d'ECA",
            description: "ECA a été créée par Mesdames Marguerite de Praslin et Odile Testa avec, comme objectif, l'enregistrement de tous documents utiles à la profession ou aux loisirs des aveugles et malvoyants. À la création, ECA signifie « Enregistrements sur Cassettes pour les Aveugles ».",
            icon: <Calendar className="h-6 w-6" />
        },
        {
            year: "1987",
            title: "Premier bulletin d'informations",
            description: "Parution du premier numéro du bulletin d'informations « le coup d'œil d'ECA »",
            icon: <FileText className="h-6 w-6" />
        },
        {
            year: "1992",
            title: "Reconnaissance d'utilité publique",
            description: "L'association est reconnue d'utilité publique (décret du 30 octobre 1992, paru au Journal Officiel le 5 novembre 1992).",
            icon: <Award className="h-6 w-6" />
        },
        {
            year: "2005",
            title: "Changement de nom",
            description: "L'association devient « Enregistrements à la Carte pour les Aveugles ».",
            icon: <Bookmark className="h-6 w-6" />
        },
        {
            year: "2008",
            title: "Catalogue « Lu Pour Vous ! »",
            description: "Création du catalogue « Lu Pour Vous ! », une sélection des enregistrements les plus demandés par les auditeurs.",
            icon: <BookOpen className="h-6 w-6" />
        },
        {
            year: "2009",
            title: "Intégration à la BDEA",
            description: "Les enregistrements figurant dans le catalogue « Lu Pour Vous ! » entrent dans la Banque de Données de l'Edition Adaptée (BDEA) de l'Institut National des Jeunes Aveugles.",
            icon: <Archive className="h-6 w-6" />
        },
        {
            year: "2012",
            title: "Stockage informatique",
            description: "ECA garde en mémoire les ouvrages enregistrés, grâce à une importante unité de stockage informatique.",
            icon: <Archive className="h-6 w-6" />
        },
        {
            year: "2014",
            title: "Création des «Coups de Cœur»",
            description: "Création des « Coups de Cœur », palmarès mensuel des enregistrements recommandés par les lecteurs et les permanentes de l'association.",
            icon: <Heart className="h-6 w-6" />
        },
        {
            year: "2018",
            title: "Délégation des Auxiliaires des Aveugles",
            description: "Aux termes du décret du 5 septembre 2018 paru au J.O. du 7 septembre 2018, ECA devient une délégation des Auxiliaires des Aveugles, association-loi de 1901, reconnue d'utilité publique et prend le nom de « ECA / Délégation des Auxiliaires des Aveugles ».",
            icon: <Users className="h-6 w-6" />
        },
        {
            year: "2023",
            title: "Évolution des coups de cœur",
            description: "Les coups de cœurs deviennent \"Listes de livres\" et paraissent tous les deux mois.",
            icon: <Bookmark className="h-6 w-6" />
        }
    ];

    return (
        <main className="min-h-screen relative">
            <FrontendNavbar />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-12">
                <section className="text-center glass-card-lg p-12">
                    <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">Notre Histoire</h1>
                    <div className="w-24 h-1 bg-gradient-to-r from-blue-500 to-purple-500 mx-auto mb-6"></div>
                    <p className="text-lg text-gray-700 dark:text-gray-100 max-w-2xl mx-auto">
                        Depuis 40 ans, ECA s&apos;engage pour rendre la lecture accessible
                        aux personnes déficientes visuelles. Découvrez les moments clés de son parcours.
                    </p>
                </section>

                <div className="relative">
                    {/* Timeline center line */}
                    <div className="absolute left-1/2 transform -translate-x-1/2 h-full w-1 bg-blue-500 hidden md:block"></div>

                    {historyEvents.map((event, index) => (
                        <div key={index} className={`mb-12 md:mb-16 relative ${index % 2 === 0 ? 'md:pr-8 md:text-right md:ml-auto md:mr-1/2' : 'md:pl-8 md:ml-1/2'} md:w-1/2`}>
                            {/* Timeline dot */}
                            <div className="hidden md:flex md:absolute md:top-5 md:items-center md:justify-center md:w-10 md:h-10 md:rounded-full md:bg-blue-600 md:border-4 md:border-white dark:md:border-gray-800 md:shadow-lg md:z-10 md:text-white"
                                 style={{ [index % 2 === 0 ? 'right' : 'left']: '-20px' }}>
                                {event.icon}
                            </div>

                            <div className={`glass-card overflow-hidden hover:scale-[1.02] transition-transform duration-300 ${index % 2 === 0 ? 'md:rounded-r-none' : 'md:rounded-l-none'}`}>
                                <div className="bg-gradient-to-r from-blue-700 to-blue-600 p-3">
                                    <div className="flex md:hidden items-center justify-center w-8 h-8 rounded-full bg-white mr-3 text-blue-700 float-left">
                                        {event.icon}
                                    </div>
                                    <h2 className="text-xl font-semibold text-white flex flex-wrap md:flex-nowrap items-center">
                                        <span className="inline-block bg-blue-800 text-white py-1 px-4 rounded-full mr-3 min-w-[90px] text-center whitespace-nowrap text-lg">
                                            {event.year}
                                        </span>
                                        <span>{event.title}</span>
                                    </h2>
                                </div>
                                <div className="p-4">
                                    <p className="text-gray-700 dark:text-gray-100">{event.description}</p>
                                </div>
                            </div>

                            {/* Arrow for desktop */}
                            <div className={`hidden md:block absolute top-5 w-0 h-0 border-t-8 border-b-8 border-transparent ${
                                index % 2 === 0
                                    ? 'border-l-[16px] border-l-white dark:border-l-gray-800 -right-4'
                                    : 'border-r-[16px] border-r-white dark:border-r-gray-800 -left-4'
                            }`}></div>
                        </div>
                    ))}
                </div>

                <section className="glass-card-lg p-8 text-center bg-gradient-to-r from-blue-500/10 to-indigo-500/10">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">L&apos;histoire continue...</h2>
                    <p className="text-gray-700 dark:text-gray-100 mb-6 max-w-lg mx-auto">
                        Aujourd&apos;hui, ECA poursuit sa mission avec le même engagement et enthousiasme qu&apos;à ses débuts.
                        Nous continuons à évoluer et à nous adapter pour rendre la culture et l&apos;information
                        toujours plus accessibles.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <a href="/nous-rejoindre" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium py-3 px-8 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105">
                            Rejoignez notre histoire
                        </a>
                        <a href="/contact" className="bg-transparent border-2 border-blue-600 dark:border-white text-blue-600 dark:text-white hover:bg-blue-600 dark:hover:bg-white hover:text-white dark:hover:text-gray-900 font-medium py-3 px-8 rounded-lg transition-all duration-300">
                            Contactez-nous
                        </a>
                    </div>
                </section>
            </div>
        </main>
    );
}