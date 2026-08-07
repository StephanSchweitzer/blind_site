import FrontendNavbar from "@/components/Frontend-Navbar";
import { resolveIcon } from "@/lib/icons";
import { getHistory } from "./data";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: 'Notre Histoire',
    description: "Depuis 40 ans, les ECA s'engagent pour rendre la lecture accessible aux personnes déficientes visuelles. Découvrez les moments clés de leur parcours.",
    alternates: { canonical: '/nous-connaitre/historique' },
};

export default async function HistoriquePage() {
    const historyEvents = await getHistory();

    return (
        <main className="min-h-screen relative">
            <FrontendNavbar />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-12">
                <section className="text-center glass-card-lg p-8 sm:p-12">
                    <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">Notre Histoire</h1>
                    <div className="w-24 h-1 bg-gradient-to-r from-blue-500 to-purple-500 mx-auto mb-6"></div>
                    <p className="text-lg text-gray-700 dark:text-gray-100 max-w-2xl mx-auto">
                        Depuis 40 ans, les ECA s&apos;engagent pour rendre la lecture accessible
                        aux personnes déficientes visuelles. Découvrez les moments clés de leur parcours.
                    </p>
                </section>

                <div className="relative">
                    {/* Timeline center line */}
                    <div className="absolute left-1/2 -translate-x-1/2 h-full w-1 bg-blue-500 hidden md:block"></div>

                    {historyEvents.map((event, index) => {
                        const Icon = resolveIcon(event.iconKey);
                        const isLeft = index % 2 === 0;
                        return (
                            <div
                                key={event.id}
                                className={`mb-12 md:mb-16 relative md:w-1/2 ${
                                    // Each card lives fully inside its half with a gap from the
                                    // center pole (pr-10 / pl-10). Right-side cards start at 50%
                                    // via ml-[50%] — both are real Tailwind classes, unlike the
                                    // former md:mr-1/2 / md:ml-1/2, which did nothing and let the
                                    // cards spill over the center line.
                                    isLeft ? 'md:pr-10 md:text-right' : 'md:pl-10 md:ml-[50%]'
                                }`}
                            >
                                {/* Timeline dot — a 40px circle centered on the pole. Sitting at
                                    the wrapper edge (which lands on the center line) with a -20px
                                    offset keeps it perfectly on the pole. */}
                                <div
                                    className="hidden md:flex md:absolute md:top-5 md:items-center md:justify-center md:w-10 md:h-10 md:rounded-full md:bg-blue-600 md:border-4 md:border-white dark:md:border-gray-800 md:shadow-lg md:z-10 md:text-white"
                                    style={{ [isLeft ? 'right' : 'left']: '-20px' }}
                                >
                                    <Icon className="h-6 w-6" />
                                </div>

                                <div className="glass-card overflow-hidden hover:scale-[1.02] transition-transform duration-300">
                                    <div className="bg-gradient-to-r from-blue-700 to-blue-600 p-3">
                                        <div className="flex md:hidden items-center justify-center w-8 h-8 rounded-full bg-white mr-3 text-blue-700 float-left">
                                            <Icon className="h-6 w-6" />
                                        </div>
                                        <h2 className={`text-xl font-semibold text-white flex flex-wrap md:flex-nowrap items-center ${isLeft ? 'md:justify-end' : ''}`}>
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
                            </div>
                        );
                    })}
                </div>

                <section className="glass-card-lg p-8 text-center bg-gradient-to-r from-blue-500/10 to-indigo-500/10">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">L&apos;histoire continue...</h2>
                    <p className="text-gray-700 dark:text-gray-100 mb-6 max-w-lg mx-auto">
                        Aujourd&apos;hui, les ECA poursuivent leur mission avec le même engagement et enthousiasme qu&apos;à leurs débuts.
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
