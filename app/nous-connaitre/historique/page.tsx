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
            description: "Les enregistrements figurant dans le catalogue «\u00A0Lu Pour Vous\u00A0!\u00A0» entrent dans la Banque de Données de l'Edition Adaptée (BDEA) de l'Institut National des Jeunes Aveugles.",
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
            description: "Création des «\u00A0Coups de Cœur\u00A0», palmarès mensuel des enregistrements recommandés par les lecteurs et les permanentes de l'association.",
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
                        <h1 className="text-3xl font-bold mb-4 text-white">Notre Histoire</h1>
                        <div className="w-24 h-1 bg-blue-500 mx-auto mb-6"></div>
                        <p className="text-lg text-gray-100 max-w-2xl mx-auto">
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
                                <div className="hidden md:flex md:absolute md:top-5 md:items-center md:justify-center md:w-10 md:h-10 md:rounded-full md:bg-blue-600 md:border-4 md:border-gray-800 md:shadow-lg md:z-10 md:text-white"
                                     style={{ [index % 2 === 0 ? 'right' : 'left']: '-20px' }}>
                                    {event.icon}
                                </div>

                                <div className={`bg-gray-700 rounded-lg overflow-hidden transition-all hover:shadow-lg hover:shadow-blue-500/20 ${index % 2 === 0 ? 'md:rounded-r-none' : 'md:rounded-l-none'}`}>
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
                                        <p className="text-gray-100">{event.description}</p>
                                    </div>
                                </div>

                                {/* Arrow for desktop */}
                                <div className={`hidden md:block absolute top-5 w-0 h-0 border-t-8 border-b-8 border-transparent ${
                                    index % 2 === 0
                                        ? 'border-l-[16px] border-l-gray-700 -right-4'
                                        : 'border-r-[16px] border-r-gray-700 -left-4'
                                }`}></div>
                            </div>
                        ))}
                    </div>

                    <section className="bg-gradient-to-r from-blue-900 to-indigo-800 rounded-lg p-8 text-center">
                        <h2 className="text-2xl font-bold text-white mb-4">L&apos;histoire continue...</h2>
                        <p className="text-gray-100 mb-6 max-w-lg mx-auto">
                            Aujourd&apos;hui, ECA poursuit sa mission avec le même engagement et enthousiasme qu&apos;à ses débuts.
                            Nous continuons à évoluer et à nous adapter pour rendre la culture et l&apos;information
                            toujours plus accessibles.
                        </p>
                        <div className="flex flex-col sm:flex-row justify-center gap-4">
                            <a href="/nous-rejoindre" className="bg-white text-blue-800 hover:bg-gray-100 font-medium py-2 px-6 rounded-md transition-colors">
                                Rejoignez notre histoire
                            </a>
                            <a href="/contact" className="bg-transparent border-2 border-white text-white hover:bg-white/10 font-medium py-2 px-6 rounded-md transition-colors">
                                Contactez-nous
                            </a>
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}