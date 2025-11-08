import FrontendNavbar from "@/components/Frontend-Navbar";
import { UserIcon } from "lucide-react";

interface TeamMember {
    name: string;
    role: string;
    category?: string;
}

export default async function EquipePage() {
    const leadership: TeamMember[] = [
        { name: "Catherine PORTE", role: "Présidente" },
        { name: "Françoise REY", role: "Trésorière" },
        { name: "Agnès BLANC", role: "Secrétaire générale" },
        { name: "Bernard GEFFRAY", role: "Président d'Honneur" },
    ];

    const boardMembers: TeamMember[] = [
        { name: "Frédéric Labarthe", role: "Membre du conseil d'administration des AA" },
    ];

    const members: TeamMember[] = [
        { name: "Leïla BENOUR", role: "Membre" },
        { name: "Annie CAZEJUST", role: "Membre" },
        { name: "Marie-Noëlle DEMARRE", role: "Membre" },
        { name: "Vincent GRISON", role: "Membre" },
        { name: "Andrée HORDÉ", role: "Membre" },
        { name: "Marie-Line LUSSON", role: "Membre" },
        { name: "Odile MORTIER-WALDSCHMIDT", role: "Membre" },
        { name: "Anne Marie SUDRES", role: "Membre" },
        { name: "Michèle NARJOZ", role: "Membre" },
    ];

    return (
        <main className="min-h-screen relative">
            <FrontendNavbar />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-12">
                <section className="text-center glass-card-lg p-12">
                    <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">Notre Équipe</h1>
                    <div className="w-24 h-1 bg-gradient-to-r from-blue-500 to-purple-500 mx-auto mb-6"></div>
                    <p className="text-lg text-gray-700 dark:text-gray-100 max-w-2xl mx-auto">
                        Découvrez les membres de l&apos;équipe qui animent <br />
                        <span className="whitespace-nowrap">les Enregistrements à la Carte pour les Aveugles</span> <br />
                        et contribuent à la mission de rendre la lecture accessible à tous.
                    </p>
                </section>

                <section className="space-y-8">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white border-l-4 border-blue-500 pl-3">
                        Direction
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {leadership.map((member, index) => (
                            <div key={index} className="glass-card p-6 hover:scale-[1.02] transition-transform duration-300 flex items-center space-x-4">
                                <div className="flex-shrink-0 w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                                    <UserIcon className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">{member.name}</h3>
                                    <p className="text-blue-600 dark:text-blue-300">{member.role}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="space-y-8">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white border-l-4 border-blue-500 pl-3">
                        Conseil d&apos;Administration
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {boardMembers.map((member, index) => (
                            <div key={index} className="glass-card p-6 hover:scale-[1.02] transition-transform duration-300 flex items-center space-x-4">
                                <div className="flex-shrink-0 w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                                    <UserIcon className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">{member.name}</h3>
                                    <p className="text-green-600 dark:text-green-300">{member.role}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="space-y-8">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white border-l-4 border-blue-500 pl-3">
                        Membres
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {members.map((member, index) => (
                            <div key={index} className="glass-card p-4 hover:scale-[1.02] transition-transform duration-300">
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">{member.name}</h3>
                                <p className="text-gray-700 dark:text-gray-300">{member.role}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="glass-card p-6 border-l-4 border-yellow-500">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Notre Engagement</h2>
                    <p className="text-gray-700 dark:text-gray-100">
                        L&apos;équipe d&apos;ECA s&apos;engage quotidiennement pour faciliter l&apos;accès à la lecture pour les personnes déficientes visuelles. Nos membres, bénévoles passionnés, travaillent ensemble pour coordonner les enregistrements, former de nouveaux lecteurs, et assurer un service personnalisé et chaleureux.
                    </p>
                </section>

                <section className="text-center glass-card-lg p-8 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Rejoignez-nous</h2>
                    <p className="text-gray-700 dark:text-gray-100 mb-6">
                        Vous souhaitez contribuer à notre mission et devenir lecteur bénévole ? Nous sommes toujours à la recherche de nouvelles voix !
                    </p>
                    <a href="/nous-rejoindre" className="inline-block bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium py-3 px-8 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105">
                        Nous rejoindre
                    </a>
                </section>
            </div>
        </main>
    );
}